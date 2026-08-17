import { NextResponse } from "next/server";
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
    // Liberado manualmente pelo admin — se ele definiu um prazo (reaproveita
    // trial_ends_at), respeita; sem prazo definido, é permanente.
    if (!sub.trialEndsAt) return { allowed: true, status: "granted" };
    const grantEnd = new Date(sub.trialEndsAt);
    const daysLeft = Math.ceil((grantEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    if (grantEnd.getTime() > Date.now()) {
      // Só avisa quando está perto de vencer, mesma regra da assinatura paga.
      return { allowed: true, status: "granted", daysLeft: daysLeft <= 5 ? Math.max(daysLeft, 0) : undefined };
    }
    return { allowed: false, status: "expired" };
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
      const daysLeft = periodEnd ? Math.ceil((periodEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : undefined;
      // Só avisa quando está perto de vencer (ou já cancelada, que sempre
      // tem um fim definido) — não fica mostrando contador o mês inteiro.
      const showDaysLeft = sub.status === "canceled" || (daysLeft !== undefined && daysLeft <= 5);
      return { allowed: true, status: sub.status, daysLeft: showDaysLeft ? Math.max(daysLeft ?? 0, 0) : undefined };
    }
    return { allowed: false, status: "expired" };
  }

  return { allowed: false, status: sub.status };
}

/**
 * Barreira pras rotas de API que mexem em dados do usuário (produtos,
 * vendas, pagamentos) — a tela já bloqueia via redirect, mas isso sozinho
 * não impede uma chamada direta à API (ex: navegação em cache do
 * Next.js, ou alguém chamando a API na mão) enquanto a sessão de login
 * ainda for válida. Devolve null se pode seguir, ou a resposta 403 pronta.
 */
export async function requireActiveAccess(user: CurrentUser): Promise<NextResponse | null> {
  const access = await getAccessStatus(user);
  if (access.allowed) return null;
  return NextResponse.json(
    { error: "Sua assinatura não está ativa. Assine para continuar usando o STRIX.", code: "subscription_required" },
    { status: 403 }
  );
}
