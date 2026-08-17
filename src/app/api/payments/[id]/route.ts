import { NextRequest, NextResponse } from "next/server";
import { run } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { requireActiveAccess } from "@/lib/subscription";

export const DELETE = withApiErrors(
  "payments.DELETE",
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const denied = await requireActiveAccess(user);
    if (denied) return denied;

    const { id } = await ctx.params;
    const result = await run(
      `DELETE FROM payments WHERE id = $1 AND sale_id IN (SELECT id FROM sales WHERE user_id = $2)`,
      [id, user.id]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Pagamento não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }
);
