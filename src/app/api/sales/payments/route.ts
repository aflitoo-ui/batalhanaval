import { NextRequest, NextResponse } from "next/server";
import { all, withTransaction } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { batchPaymentSchema } from "@/lib/schemas";
import { withActiveAccess } from "@/lib/subscription";

type OpenSaleRow = { id: number; total: string; totalPaid: string };

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateBR(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Registra um pagamento de valor livre contra várias vendas em aberto do
// mesmo cliente de uma vez, abatendo da mais antiga pra mais nova. Sem isso,
// um pagamento que não fecha exatamente uma venda obrigava a entrar venda
// por venda calculando o resto na mão (pedido explícito do usuário). Cada
// pagamento gerado leva uma observação automática, pra quem abrir a venda
// depois entender de onde veio aquele valor parcial.
export const POST = withApiErrors("sales.payments.batch.POST", async (req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = batchPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
  }
  const { saleIds, amount, paidAt } = parsed.data;

  const result = await withActiveAccess(user, () =>
    all<OpenSaleRow>(
      `SELECT s.id,
         (s.quantity * s.unit_sell_price + s.adjustment) as total,
         COALESCE(pay.total_paid, 0) as "totalPaid"
       FROM sales s
       LEFT JOIN (SELECT sale_id, SUM(amount) as total_paid FROM payments GROUP BY sale_id) pay ON pay.sale_id = s.id
       WHERE s.id = ANY($1) AND s.user_id = $2
       ORDER BY s.sale_date ASC, s.id ASC`,
      [saleIds, user.id]
    )
  );
  if (result instanceof NextResponse) return result;
  const rows = result.data;

  if (rows.length !== saleIds.length) {
    return NextResponse.json({ error: "Uma ou mais vendas não foram encontradas." }, { status: 404 });
  }

  const open = rows.map((r) => ({ id: r.id, owed: Math.max(0, round2(Number(r.total) - Number(r.totalPaid))) }));
  const totalOwed = round2(open.reduce((sum, s) => sum + s.owed, 0));

  if (amount > totalOwed + 0.001) {
    return NextResponse.json(
      { error: `Essas vendas somam ${formatBRL(totalOwed)} em aberto — o valor informado é maior que isso.` },
      { status: 400 }
    );
  }

  let remaining = amount;
  const applied: { id: number; amount: number }[] = [];
  for (const s of open) {
    if (remaining <= 0.001 || s.owed <= 0.001) continue;
    const chunk = round2(Math.min(remaining, s.owed));
    if (chunk <= 0) continue;
    applied.push({ id: s.id, amount: chunk });
    remaining = round2(remaining - chunk);
  }

  if (applied.length === 0) {
    return NextResponse.json({ error: "Nenhuma dessas vendas tem valor em aberto." }, { status: 400 });
  }

  const note =
    applied.length > 1
      ? `Pagamento de ${formatBRL(amount)} em ${formatDateBR(paidAt)} — dividido entre ${applied.length} vendas.`
      : `Pagamento de ${formatBRL(amount)} em ${formatDateBR(paidAt)}.`;

  await withTransaction(async (tx) => {
    for (const a of applied) {
      await tx.get(`INSERT INTO payments (sale_id, amount, paid_at, notes) VALUES ($1, $2, $3, $4) RETURNING id`, [
        a.id,
        a.amount,
        paidAt,
        note,
      ]);
    }
  });

  return NextResponse.json({ applied, totalApplied: amount }, { status: 201 });
});
