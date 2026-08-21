import { NextResponse } from "next/server";
import { get } from "@/db/pool";
import type { CurrentUser } from "@/lib/auth";

export type AccessStatus = {
  allowed: boolean;
  status:
    | "trialing"
    | "active"
    | "granted"
    | "pending"
    | "past_due"
    | "canceled"
    | "refunded"
    | "chargeback"
    | "expired"
    | "none";
  daysLeft?: number;
};

// "Hoje" no fuso do negócio (Brasil), como string YYYY-MM-DD. current_period_end
// é uma coluna DATE (sem hora) — o driver pg a converte pra um Date do JS
// interpretando os componentes no fuso horário do PROCESSO Node, não do
// negócio. Em produção (serverless, comumente TZ=UTC), isso cortaria o
// acesso ~3h antes da meia-noite real em horário de Brasília (achado em
// auditoria). Comparar como string de dia, calculada explicitamente no
// fuso certo, elimina essa dependência da config do servidor.
function todaySaoPauloISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export async function getAccessStatus(user: CurrentUser): Promise<AccessStatus> {
  if (user.role === "admin") return { allowed: true, status: "active" };

  const sub = await get<{
    status: AccessStatus["status"];
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
  }>(
    `SELECT status, trial_ends_at as "trialEndsAt", to_char(current_period_end, 'YYYY-MM-DD') as "currentPeriodEnd"
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

  if (sub.status === "pending") {
    // Fatura gerada mas ainda não paga — gerar a fatura antecipado (a pessoa
    // pode clicar em "Assinar agora" mesmo com dias de trial/liberação
    // sobrando) não pode cortar o acesso que ela já tinha até esse prazo. Só
    // fica bloqueado se realmente não sobrar mais nada.
    const trialEnd = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
    if (trialEnd && trialEnd.getTime() > Date.now()) {
      const daysLeft = Math.ceil((trialEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      return { allowed: true, status: "pending", daysLeft: Math.max(daysLeft, 0) };
    }
    return { allowed: false, status: "pending" };
  }

  if (sub.status === "refunded" || sub.status === "chargeback") {
    // Diferente de "canceled" (decisão do cliente, respeita o período já
    // pago), estorno e chargeback significam que o dinheiro voltou (ou está
    // em disputa) — o acesso é cortado na hora, ignorando current_period_end.
    return { allowed: false, status: sub.status };
  }

  if (sub.status === "active" || sub.status === "canceled") {
    // "canceled" ainda libera acesso até o fim do período já pago — só
    // deixa de renovar depois disso, não corta o que já foi pago.
    // Comparação por string de dia (não timestamp) — ver todaySaoPauloISO.
    const today = todaySaoPauloISO();
    const stillValid = !sub.currentPeriodEnd || sub.currentPeriodEnd >= today;
    if (stillValid) {
      const daysLeft = sub.currentPeriodEnd
        ? Math.ceil(
            (new Date(`${sub.currentPeriodEnd}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
              (24 * 60 * 60 * 1000)
          )
        : undefined;
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
  // subscriptionStatus vai junto pra quem chama poder mostrar uma mensagem
  // específica do motivo real (estornado/contestado/atrasado), em vez do
  // "expirou" genérico que não faz sentido pra esses casos (achado em
  // auditoria).
  return NextResponse.json(
    {
      error: "Sua assinatura não está ativa. Assine para continuar usando o STRIX.",
      code: "subscription_required",
      subscriptionStatus: access.status,
    },
    { status: 403 }
  );
}
