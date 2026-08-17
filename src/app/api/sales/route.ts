import { NextRequest, NextResponse } from "next/server";
import { all, get, withTransaction } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { saleSchema } from "@/lib/schemas";
import { requireActiveAccess } from "@/lib/subscription";

type SaleRow = {
  id: number;
  saleDate: string;
  customerName: string;
  quantity: string;
  unitBuyPrice: string;
  unitSellPrice: string;
  notes: string | null;
  productId: number;
  productName: string;
  totalPaid: string;
};

const LIST_SQL = `
  SELECT s.id, s.sale_date as "saleDate", s.customer_name as "customerName",
    s.quantity, s.unit_buy_price as "unitBuyPrice", s.unit_sell_price as "unitSellPrice",
    s.notes, p.id as "productId", p.name as "productName",
    COALESCE(pay.total_paid, 0) as "totalPaid"
  FROM sales s
  JOIN products p ON p.id = s.product_id
  LEFT JOIN (
    SELECT sale_id, SUM(amount) as total_paid FROM payments GROUP BY sale_id
  ) pay ON pay.sale_id = s.id
  WHERE s.user_id = $1
  ORDER BY s.sale_date DESC, s.id DESC
`;

function toSaleView(r: SaleRow) {
  const quantity = Number(r.quantity);
  const unitBuyPrice = Number(r.unitBuyPrice);
  const unitSellPrice = Number(r.unitSellPrice);
  const totalPaid = Number(r.totalPaid);
  const total = round2(quantity * unitSellPrice);
  const cost = round2(quantity * unitBuyPrice);
  return {
    id: r.id,
    saleDate: r.saleDate,
    customerName: r.customerName,
    productId: r.productId,
    productName: r.productName,
    quantity,
    unitBuyPrice,
    unitSellPrice,
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

export const GET = withApiErrors("sales.GET", async () => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const denied = await requireActiveAccess(user);
  if (denied) return denied;

  const rows = await all<SaleRow>(LIST_SQL, [user.id]);
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

  const id = await withTransaction(async (tx) => {
    const sale = await tx.get<{ id: number }>(
      `INSERT INTO sales (user_id, sale_date, product_id, customer_name, quantity, unit_buy_price, unit_sell_price, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [user.id, d.saleDate, d.productId, d.customerName, d.quantity, d.unitBuyPrice, d.unitSellPrice, d.notes || null]
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
