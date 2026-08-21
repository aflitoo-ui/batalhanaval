import { NextRequest, NextResponse } from "next/server";
import { get } from "@/db/pool";
import { withApiErrors } from "@/lib/api-errors";
import { sendTelegramAlert } from "@/lib/telegram";

// Chamado uma vez por dia pelo Vercel Cron (ver vercel.json), mesmo padrão
// de autenticação do trial-alerts. Diferente dos alertas por evento (que
// avisam na hora de cada pagamento/cancelamento), isso é um boletim
// agregado das últimas 24h — dá uma leitura rápida de tendência sem
// precisar abrir o painel admin.
export const GET = withApiErrors("cron.dailySummary.GET", async (req: NextRequest) => {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

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

  const lines = [
    "📊 Resumo de ontem — STRIX",
    `✅ ${payments?.count ?? 0} pagamento${payments?.count === 1 ? "" : "s"} aprovado${payments?.count === 1 ? "" : "s"} — ${money(Number(payments?.total ?? 0))}`,
    `↩️ ${cancellations?.count ?? 0} cancelamento${cancellations?.count === 1 ? "" : "s"} voluntário${cancellations?.count === 1 ? "" : "s"}`,
    `⚠️ ${pastDue?.count ?? 0} conta${pastDue?.count === 1 ? "" : "s"} em atraso`,
    `🎉 ${newInvitesUsed?.count ?? 0} cadastro${newInvitesUsed?.count === 1 ? "" : "s"} novo${newInvitesUsed?.count === 1 ? "" : "s"} via convite`,
    `💰 MRR atual: ${money(Number(active?.mrr ?? 0))} (${active?.count ?? 0} assinante${active?.count === 1 ? "" : "s"} ativo${active?.count === 1 ? "" : "s"})`,
  ];

  await sendTelegramAlert(lines.join("\n"));

  return NextResponse.json({ ok: true });
});
