import { get } from "@/db/pool";

// Compartilhado entre o cron diário (src/app/api/cron/daily-summary/route.ts)
// e o comando /resumo do bot do Telegram (src/app/api/telegram/webhook/route.ts)
// — mesmo texto, seja o disparo automático ou sob demanda.
export async function buildDailySummaryText(): Promise<string> {
  const [payments, cancellations, pastDue, newInvitesUsed, active] = await Promise.all([
    get<{ count: number; total: number }>(
      `SELECT count(*)::int as count, coalesce(sum(amount), 0)::numeric as total
       FROM payments_history WHERE status = 'approved' AND paid_at >= now() - interval '1 day'`
    ),
    get<{ count: number }>(
      `SELECT count(*)::int as count FROM subscriptions WHERE canceled_at >= now() - interval '1 day'`
    ),
    get<{ count: number }>(`SELECT count(*)::int as count FROM subscriptions WHERE status = 'past_due'`),
    get<{ count: number }>(`SELECT count(*)::int as count FROM invites WHERE used_at >= now() - interval '1 day'`),
    get<{ count: number; mrr: number }>(
      `SELECT count(*)::int as count, coalesce(sum(p.price), 0)::numeric as mrr
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.status = 'active'`
    ),
  ]);

  const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return [
    "📊 Resumo das últimas 24h — STRIX",
    `✅ ${payments?.count ?? 0} pagamento${payments?.count === 1 ? "" : "s"} aprovado${payments?.count === 1 ? "" : "s"} — ${money(Number(payments?.total ?? 0))}`,
    `↩️ ${cancellations?.count ?? 0} cancelamento${cancellations?.count === 1 ? "" : "s"} voluntário${cancellations?.count === 1 ? "" : "s"}`,
    `⚠️ ${pastDue?.count ?? 0} conta${pastDue?.count === 1 ? "" : "s"} em atraso`,
    `🎉 ${newInvitesUsed?.count ?? 0} cadastro${newInvitesUsed?.count === 1 ? "" : "s"} novo${newInvitesUsed?.count === 1 ? "" : "s"} via convite`,
    `💰 MRR atual: ${money(Number(active?.mrr ?? 0))} (${active?.count ?? 0} assinante${active?.count === 1 ? "" : "s"} ativo${active?.count === 1 ? "" : "s"})`,
  ].join("\n");
}
