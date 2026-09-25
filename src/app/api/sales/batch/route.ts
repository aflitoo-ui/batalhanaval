import { NextRequest, NextResponse } from "next/server";
import { all, get, withTransaction } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { batchCreateSaleSchema } from "@/lib/schemas";
import { withActiveAccess } from "@/lib/subscription";

// Lança várias vendas de uma vez (mesmo cliente, mesma data) — usado quando
// o cliente leva vários produtos na mesma visita, em vez de repetir o
// formulário pra cada um. Continua uma linha por produto em "sales" (mantém
// intacto tudo que já lida com dívida/pagamento parcial/relatório por
// venda); as linhas lançadas juntas só compartilham um group_id pra a tela
// juntar visualmente. Pagamento inicial, se houver, é aplicado à parte pelo
// chamador via POST /api/sales/payments (mesmo endpoint do pagamento
// distribuído), reaproveitando a mesma lógica de abater da mais antiga.
export const POST = withApiErrors("sales.batch.POST", async (req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = batchCreateSaleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
  }
  const { saleDate, customerId, items } = parsed.data;
  const productIds = [...new Set(items.map((i) => i.productId))];

  const result = await withActiveAccess(user, () =>
    Promise.all([
      get(`SELECT id FROM customers WHERE id = $1 AND user_id = $2`, [customerId, user.id]),
      all<{ id: number }>(`SELECT id FROM products WHERE id = ANY($1) AND user_id = $2`, [productIds, user.id]),
    ])
  );
  if (result instanceof NextResponse) return result;
  const [customer, foundProducts] = result.data;
  if (!customer) {
    return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  }
  if (foundProducts.length !== productIds.length) {
    return NextResponse.json({ error: "Um ou mais produtos não foram encontrados." }, { status: 404 });
  }

  const ids = await withTransaction(async (tx) => {
    const insertedIds: number[] = [];
    for (const item of items) {
      const row = await tx.get<{ id: number }>(
        `INSERT INTO sales (user_id, sale_date, product_id, customer_id, quantity, unit_buy_price, unit_sell_price, adjustment, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          user.id,
          saleDate,
          item.productId,
          customerId,
          item.quantity,
          item.unitBuyPrice,
          item.unitSellPrice,
          item.adjustment || 0,
          item.notes || null,
        ]
      );
      if (row) insertedIds.push(row.id);
    }
    if (insertedIds.length > 1) {
      const groupId = Math.min(...insertedIds);
      await tx.all(`UPDATE sales SET group_id = $1 WHERE id = ANY($2)`, [groupId, insertedIds]);
    }
    return insertedIds;
  });

  return NextResponse.json({ ids }, { status: 201 });
});
