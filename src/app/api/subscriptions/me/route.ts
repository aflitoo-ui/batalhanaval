import { NextResponse } from "next/server";
import { all, get } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { getAccessStatus } from "@/lib/subscription";

export const GET = withApiErrors("subscriptions.me.GET", async () => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const access = await getAccessStatus(user);

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
    [user.id]
  );

  const history = sub
    ? await all<{ id: number; amount: string; status: string; paidAt: string | null }>(
        `SELECT id, amount, status, paid_at as "paidAt" FROM payments_history
         WHERE subscription_id = $1 ORDER BY created_at DESC`,
        [sub.id]
      )
    : [];

  // Dias restantes de verdade (sem o filtro de "só perto de vencer" que o
  // aviso no topo usa) — a própria tela de assinatura sempre mostra o prazo.
  const fullDaysLeft = (() => {
    if (!sub) return null;
    const iso =
      sub.status === "trialing" || sub.status === "granted" || sub.status === "pending"
        ? sub.trialEndsAt
        : sub.status === "active" || sub.status === "canceled"
          ? sub.currentPeriodEnd
          : null;
    if (!iso) return null;
    return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  })();

  return NextResponse.json({
    access,
    subscription: sub
      ? { ...sub, price: Number(sub.price), daysLeft: fullDaysLeft }
      : null,
    history: history.map((h) => ({ ...h, amount: Number(h.amount) })),
  });
});
