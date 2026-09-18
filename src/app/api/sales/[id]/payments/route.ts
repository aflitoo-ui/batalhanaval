import { NextRequest, NextResponse } from "next/server";
import { all, get } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { paymentSchema } from "@/lib/schemas";
import { withActiveAccess } from "@/lib/subscription";

export const GET = withApiErrors(
  "sales.payments.GET",
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await ctx.params;
    // A lista de pagamentos só é devolvida se `sale` confirmar que a venda é
    // do usuário — buscar as duas em paralelo é seguro porque o resultado de
    // `rows` fica descartado abaixo caso essa checagem falhe.
    const result = await withActiveAccess(user, () =>
      Promise.all([
        get(`SELECT id FROM sales WHERE id = $1 AND user_id = $2`, [id, user.id]),
        all<{ id: number; amount: string; paidAt: string; notes: string | null }>(
          `SELECT id, amount, paid_at as "paidAt", notes FROM payments WHERE sale_id = $1 ORDER BY paid_at DESC, id DESC`,
          [id]
        ),
      ])
    );
    if (result instanceof NextResponse) return result;
    const [sale, rows] = result.data;
    if (!sale) return NextResponse.json({ error: "Venda não encontrada." }, { status: 404 });

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

    const { id } = await ctx.params;
    const saleResult = await withActiveAccess(user, () =>
      get(`SELECT id FROM sales WHERE id = $1 AND user_id = $2`, [id, user.id])
    );
    if (saleResult instanceof NextResponse) return saleResult;
    if (!saleResult.data) return NextResponse.json({ error: "Venda não encontrada." }, { status: 404 });

    const body = await req.json().catch(() => null);
    const parsed = paymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
    }

    const row = await get<{ id: number }>(
      `INSERT INTO payments (sale_id, amount, paid_at, notes) VALUES ($1, $2, $3, $4) RETURNING id`,
      [id, parsed.data.amount, parsed.data.paidAt, parsed.data.notes || null]
    );
    return NextResponse.json({ id: row?.id }, { status: 201 });
  }
);
