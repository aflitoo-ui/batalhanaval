import { NextRequest, NextResponse } from "next/server";
import { all, get, run } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { logAdminAction } from "@/lib/adminLog";
import { grantInviteCreditOnce } from "@/lib/invites";
import { z } from "zod";

const bodySchema = z.object({
  action: z.enum(["grant", "revoke"]),
  days: z.number().int().positive().max(3650).optional(),
});

// Histórico completo de assinatura + pagamentos de um usuário específico —
// mesma query de /api/subscriptions/me, só que o admin pode ver qualquer
// usuário (não só a própria conta).
export const GET = withApiErrors(
  "admin.subscriptions.history.GET",
  async (_req: NextRequest, ctx: { params: Promise<{ userId: string }> }) => {
    const admin = await getSessionUser();
    if (!admin) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (admin.role !== "admin") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

    const { userId } = await ctx.params;

    const target = await get<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [userId]);
    if (!target) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

    const sub = await get<{
      id: number;
      status: string;
      trialEndsAt: string | null;
      currentPeriodEnd: string | null;
      canceledAt: string | null;
      planName: string;
      price: string;
    }>(
      `SELECT s.id, s.status, s.trial_ends_at as "trialEndsAt", s.current_period_end as "currentPeriodEnd",
        s.canceled_at as "canceledAt", p.name as "planName", p.price
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id
       WHERE s.user_id = $1 ORDER BY s.id DESC LIMIT 1`,
      [userId]
    );

    const history = sub
      ? await all<{ id: number; amount: string; status: string; paidAt: string | null }>(
          `SELECT id, amount, status, paid_at as "paidAt" FROM payments_history
           WHERE subscription_id = $1 ORDER BY created_at DESC`,
          [sub.id]
        )
      : [];

    return NextResponse.json({
      email: target.email,
      subscription: sub ? { ...sub, price: Number(sub.price) } : null,
      history: history.map((h) => ({ ...h, amount: Number(h.amount) })),
    });
  }
);

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
      await logAdminAction({
        adminId: admin.id,
        action: "revoke_access",
        targetUserId: Number(userId),
        details: "revogado",
      });
      return NextResponse.json({ ok: true, status: "expired" });
    }

    // "grant" com dias definido reaproveita trial_ends_at como prazo do
    // acesso liberado; sem dias, fica permanente (trial_ends_at = null).
    if (parsed.data.days) {
      await run(
        `UPDATE subscriptions SET status = 'granted', trial_ends_at = now() + make_interval(days => $2), updated_at = now() WHERE id = $1`,
        [sub.id, parsed.data.days]
      );
      await logAdminAction({
        adminId: admin.id,
        action: "grant_access",
        targetUserId: Number(userId),
        details: `liberado por ${parsed.data.days} dias`,
      });
    } else {
      await run(
        `UPDATE subscriptions SET status = 'granted', trial_ends_at = NULL, updated_at = now() WHERE id = $1`,
        [sub.id]
      );
      await logAdminAction({
        adminId: admin.id,
        action: "grant_access",
        targetUserId: Number(userId),
        details: "liberado sem prazo",
      });
    }
    await grantInviteCreditOnce({ get }, Number(userId));
    return NextResponse.json({ ok: true, status: "granted" });
  }
);
