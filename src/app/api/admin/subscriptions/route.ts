import { NextResponse } from "next/server";
import { all, get } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";

export const GET = withApiErrors("admin.subscriptions.GET", async () => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const rows = await all<{
    userId: number;
    email: string;
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    price: string;
  }>(
    `SELECT u.id as "userId", u.email, s.status, s.trial_ends_at as "trialEndsAt",
      s.current_period_end as "currentPeriodEnd", p.price
     FROM users u
     LEFT JOIN subscriptions s ON s.id = (
       SELECT id FROM subscriptions WHERE user_id = u.id ORDER BY id DESC LIMIT 1
     )
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE u.role != 'admin'
     ORDER BY u.created_at ASC`
  );

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const revenue = await get<{ total: string }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM payments_history
     WHERE status = 'approved' AND created_at >= $1`,
    [monthStart.toISOString()]
  );

  const summary = rows.reduce(
    (acc, r) => {
      acc.total++;
      if (r.status === "active" || r.status === "trialing" || r.status === "granted") acc.ativos++;
      else if (r.status === "canceled" || r.status === "expired") acc.cancelados++;
      else if (r.status === "past_due") acc.inadimplentes++;
      return acc;
    },
    { total: 0, ativos: 0, cancelados: 0, inadimplentes: 0 }
  );

  return NextResponse.json({
    summary: { ...summary, receitaMes: Number(revenue?.total || 0) },
    subscriptions: rows.map((r) => ({ ...r, price: r.price ? Number(r.price) : null })),
  });
});
