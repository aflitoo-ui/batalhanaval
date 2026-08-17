import { NextRequest, NextResponse } from "next/server";
import { get, run } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { z } from "zod";

const bodySchema = z.object({
  action: z.enum(["grant", "revoke"]),
  days: z.number().int().positive().max(3650).optional(),
});

// Libera acesso pra um usuário específico sem cobrar (ex: conta de cortesia)
// ou desfaz isso depois. Não mexe no gateway de pagamento — é só um estado
// interno da assinatura.
export const PATCH = withApiErrors(
  "admin.subscriptions.PATCH",
  async (req: NextRequest, ctx: { params: Promise<{ userId: string }> }) => {
    const admin = await getSessionUser();
    if (!admin) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (admin.role !== "admin") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

    const { userId } = await ctx.params;
    const body = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }

    const sub = await get<{ id: number }>(
      `SELECT id FROM subscriptions WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    if (!sub) return NextResponse.json({ error: "Usuário sem assinatura." }, { status: 404 });

    if (parsed.data.action === "revoke") {
      await run(`UPDATE subscriptions SET status = 'expired', updated_at = now() WHERE id = $1`, [sub.id]);
      return NextResponse.json({ ok: true, status: "expired" });
    }

    // "grant" com dias definido reaproveita trial_ends_at como prazo do
    // acesso liberado; sem dias, fica permanente (trial_ends_at = null).
    if (parsed.data.days) {
      await run(
        `UPDATE subscriptions SET status = 'granted', trial_ends_at = now() + make_interval(days => $2), updated_at = now() WHERE id = $1`,
        [sub.id, parsed.data.days]
      );
    } else {
      await run(
        `UPDATE subscriptions SET status = 'granted', trial_ends_at = NULL, updated_at = now() WHERE id = $1`,
        [sub.id]
      );
    }
    return NextResponse.json({ ok: true, status: "granted" });
  }
);
