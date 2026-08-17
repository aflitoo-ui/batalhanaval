import { NextRequest, NextResponse } from "next/server";
import { run } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";

export const DELETE = withApiErrors(
  "payments.DELETE",
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await ctx.params;
    await run(`DELETE FROM payments WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  }
);
