import { NextRequest, NextResponse } from "next/server";
import { all, get } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { paymentSchema } from "@/lib/schemas";
import { requireActiveAccess } from "@/lib/subscription";

export const GET = withApiErrors(
  "sales.payments.GET",
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const denied = await requireActiveAccess(user);
    if (denied) return denied;

    const { id } = await ctx.params;
    const sale = await get(`SELECT id FROM sales WHERE id = $1 AND user_id = $2`, [id, user.id]);
    if (!sale) return NextResponse.json({ error: "Venda não encontrada." }, { status: 404 });

    const rows = await all<{ id: number; amount: string; paidAt: string }>(
      `SELECT id, amount, paid_at as "paidAt" FROM payments WHERE sale_id = $1 ORDER BY paid_at DESC, id DESC`,
      [id]
    );
    return NextResponse.json({
      payments: rows.map((r) => ({ ...r, amount: Number(r.amount) })),
    });
  }
);

export const POST = withApiErrors(
  "sales.payments.POST",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const denied = await requireActiveAccess(user);
    if (denied) return denied;

    const { id } = await ctx.params;
    const sale = await get(`SELECT id FROM sales WHERE id = $1 AND user_id = $2`, [id, user.id]);
    if (!sale) return NextResponse.json({ error: "Venda não encontrada." }, { status: 404 });

    const body = await req.json().catch(() => null);
    const parsed = paymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
    }

    const row = await get<{ id: number }>(
      `INSERT INTO payments (sale_id, amount, paid_at) VALUES ($1, $2, $3) RETURNING id`,
      [id, parsed.data.amount, parsed.data.paidAt]
    );
    return NextResponse.json({ id: row?.id }, { status: 201 });
  }
);
