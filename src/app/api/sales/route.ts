import { NextRequest, NextResponse } from "next/server";
import { all, get, run, withTransaction } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { saleSchema } from "@/lib/schemas";
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

function listSql(includeArchived: boolean) {
  return `
    SELECT s.id, s.sale_date as "saleDate", s.customer_id as "customerId",
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
    WHERE s.user_id = $1 ${includeArchived ? "" : "AND s.archived_at IS NULL"}
    ORDER BY s.sale_date DESC, s.id DESC
  `;
}

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

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export const GET = withApiErrors("sales.GET", async (req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const denied = await requireActiveAccess(user);
  if (denied) return denied;

  const includeArchived = new URL(req.url).searchParams.get("includeArchived") === "1";
  const rows = await all<SaleRow>(listSql(includeArchived), [user.id]);
  return NextResponse.json({ sales: rows.map(toSaleView) });
});

export const POST = withApiErrors("sales.POST", async (req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const denied = await requireActiveAccess(user);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = saleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
  }
  const d = parsed.data;

  const product = await get(`SELECT id FROM products WHERE id = $1 AND user_id = $2`, [d.productId, user.id]);
  if (!product) {
    return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
  }
  const customer = await get(`SELECT id FROM customers WHERE id = $1 AND user_id = $2`, [d.customerId, user.id]);
  if (!customer) {
    return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  }

  const id = await withTransaction(async (tx) => {
    const sale = await tx.get<{ id: number }>(
      `INSERT INTO sales (user_id, sale_date, product_id, customer_id, quantity, unit_buy_price, unit_sell_price, adjustment, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        user.id,
        d.saleDate,
        d.productId,
        d.customerId,
        d.quantity,
        d.unitBuyPrice,
        d.unitSellPrice,
        d.adjustment || 0,
        d.notes || null,
      ]
    );
    if (d.initialPayment && d.initialPayment > 0 && sale) {
      await tx.get(`INSERT INTO payments (sale_id, amount, paid_at) VALUES ($1, $2, $3)`, [
        sale.id,
        d.initialPayment,
        d.saleDate,
      ]);
    }
    return sale?.id;
  });

  return NextResponse.json({ id }, { status: 201 });
});

// Arquiva de uma vez todas as vendas de um mês — usado no botão "arquivar
// mês inteiro". Não apaga (continua contando nos Relatórios pra não
// reescrever o histórico financeiro), só some da lista do dia a dia. Só
// aparece no front quando o mês já está sem dívidas, mas a checagem aqui é
// a que realmente vale: nunca confia só no que o navegador validou.
export const DELETE = withApiErrors("sales.archiveMonth.DELETE", async (req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const denied = await requireActiveAccess(user);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Mês inválido." }, { status: 400 });
  }

  const rows = await all<{ id: number; total: string; totalPaid: string }>(
    `SELECT s.id, (s.quantity * s.unit_sell_price + s.adjustment) as total, COALESCE(pay.total_paid, 0) as "totalPaid"
     FROM sales s
     LEFT JOIN (SELECT sale_id, SUM(amount) as total_paid FROM payments GROUP BY sale_id) pay ON pay.sale_id = s.id
     WHERE s.user_id = $1 AND s.archived_at IS NULL
       AND EXTRACT(YEAR FROM s.sale_date) = $2 AND EXTRACT(MONTH FROM s.sale_date) = $3`,
    [user.id, year, month]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "Nenhuma venda encontrada nesse mês." }, { status: 404 });
  }

  const hasDebt = rows.some((r) => round2(Number(r.total) - Number(r.totalPaid)) > 0);
  if (hasDebt) {
    return NextResponse.json(
      { error: "Ainda tem dívida em aberto nesse mês — quite tudo antes de arquivar." },
      { status: 409 }
    );
  }

  await run(
    `UPDATE sales SET archived_at = now()
     WHERE user_id = $1 AND archived_at IS NULL
       AND EXTRACT(YEAR FROM sale_date) = $2 AND EXTRACT(MONTH FROM sale_date) = $3`,
    [user.id, year, month]
  );

  return NextResponse.json({ ok: true, archived: rows.length });
});
