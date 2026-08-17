import { get } from "@/db/pool";
import type { CurrentUser } from "@/lib/auth";

export type AccessStatus = {
  allowed: boolean;
  status: "trialing" | "active" | "granted" | "pending" | "past_due" | "canceled" | "expired" | "none";
  daysLeft?: number;
};

export async function getAccessStatus(user: CurrentUser): Promise<AccessStatus> {
  if (user.role === "admin") return { allowed: true, status: "active" };

  const sub = await get<{
    status: AccessStatus["status"];
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
  }>(
    `SELECT status, trial_ends_at as "trialEndsAt", current_period_end as "currentPeriodEnd"
     FROM subscriptions WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
    [user.id]
  );

  if (!sub) return { allowed: false, status: "none" };

  if (sub.status === "granted") {
    // Liberado manualmente pelo admin — acesso permanente, sem checar prazo.
    return { allowed: true, status: "granted" };
  }

  if (sub.status === "trialing") {
    const trialEnd = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
    const daysLeft = trialEnd ? Math.ceil((trialEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : 0;
    if (trialEnd && trialEnd.getTime() > Date.now()) {
      return { allowed: true, status: "trialing", daysLeft: Math.max(daysLeft, 0) };
    }
    return { allowed: false, status: "expired" };
  }

  if (sub.status === "active" || sub.status === "canceled") {
    // "canceled" ainda libera acesso até o fim do período já pago — só
    // deixa de renovar depois disso, não corta o que já foi pago.
    const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
    if (!periodEnd || periodEnd.getTime() >= Date.now()) {
      return { allowed: true, status: sub.status };
    }
    return { allowed: false, status: "expired" };
  }

  return { allowed: false, status: sub.status };
}
