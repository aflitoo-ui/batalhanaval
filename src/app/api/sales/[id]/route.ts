import { NextRequest, NextResponse } from "next/server";
import { get, run } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { saleUpdateSchema } from "@/lib/schemas";
import { requireActiveAccess } from "@/lib/subscription";

type SaleRow = {
  id: number;
  saleDate: string;
  customerId: number | null;
  customerName: string | null;
  quantity: string;
  unitBuyPrice: string;
  unitSellPrice: string;
  adjustment: string;
  notes: string | null;
  productId: number;
  productName: string;
  totalPaid: string;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// Mesma forma/campos calculados devolvidos pela listagem em
// src/app/api/sales/route.ts (toSaleView) — a página de detalhe da venda
// depende de bater exatamente com o que a lista já mostra.
function toSaleView(r: SaleRow) {
  const quantity = Number(r.quantity);
  const unitBuyPrice = Number(r.unitBuyPrice);
  const unitSellPrice = Number(r.unitSellPrice);
  const adjustment = Number(r.adjustment);
  const totalPaid = Number(r.totalPaid);
  const total = round2(quantity * unitSellPrice + adjustment);
  const cost = round2(quantity * unitBuyPrice);
  return {
    id: r.id,
    saleDate: r.saleDate,
    customerId: r.customerId,
    customerName: r.customerName,
    productId: r.productId,
    productName: r.productName,
    quantity,
    unitBuyPrice,
    unitSellPrice,
    adjustment,
    notes: r.notes,
    total,
    paid: round2(totalPaid),
    owed: round2(total - totalPaid),
    profit: round2(total - cost),
  };
}

// Busca uma venda específica — usado pela página de detalhe (/venda/[id]),
// que precisa funcionar em acesso direto/F5 e não só a partir do estado já
// carregado na lista.
export const GET = withApiErrors(
  "sales.GET",
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const denied = await requireActiveAccess(user);
    if (denied) return denied;

    const { id } = await ctx.params;
    const row = await get<SaleRow>(
      `SELECT s.id, s.sale_date as "saleDate", s.customer_id as "customerId",
        COALESCE(c.name, s.customer_name) as "customerName",
        s.quantity, s.unit_buy_price as "unitBuyPrice", s.unit_sell_price as "unitSellPrice",
        s.adjustment, s.notes, p.id as "productId", p.name as "productName",
        COALESCE(pay.total_paid, 0) as "totalPaid"
      FROM sales s
      JOIN products p ON p.id = s.product_id
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN (
        SELECT sale_id, SUM(amount) as total_paid FROM payments GROUP BY sale_id
      ) pay ON pay.sale_id = s.id
      WHERE s.id = $1 AND s.user_id = $2`,
      [id, user.id]
    );
    if (!row) {
      return NextResponse.json({ error: "Venda não encontrada." }, { status: 404 });
    }
    return NextResponse.json({ sale: toSaleView(row) });
  }
);

export const PATCH = withApiErrors(
  "sales.PATCH",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const denied = await requireActiveAccess(user);
    if (denied) return denied;

    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    const parsed = saleUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
    }

    if (parsed.data.customerId !== undefined) {
      const customer = await get(`SELECT id FROM customers WHERE id = $1 AND user_id = $2`, [parsed.data.customerId, user.id]);
      if (!customer) {
        return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
      }
    }

    const columnByField: Record<string, string> = {
      saleDate: "sale_date",
      productId: "product_id",
      customerId: "customer_id",
      quantity: "quantity",
      unitBuyPrice: "unit_buy_price",
      unitSellPrice: "unit_sell_price",
      adjustment: "adjustment",
      notes: "notes",
    };

    const fields: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const [key, column] of Object.entries(columnByField)) {
      const value = (parsed.data as Record<string, unknown>)[key];
      if (value !== undefined) {
        fields.push(`${column} = $${i++}`);
        params.push(value);
      }
    }
    if (fields.length === 0) {
      return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
    }
    params.push(id, user.id);
    const result = await run(`UPDATE sales SET ${fields.join(", ")} WHERE id = $${i} AND user_id = $${i + 1}`, params);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Venda não encontrada." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withApiErrors(
  "sales.DELETE",
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const denied = await requireActiveAccess(user);
    if (denied) return denied;

    const { id } = await ctx.params;
    const result = await run(`DELETE FROM sales WHERE id = $1 AND user_id = $2`, [id, user.id]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Venda não encontrada." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }
);
