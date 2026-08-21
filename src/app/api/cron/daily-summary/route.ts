import { NextRequest, NextResponse } from "next/server";
import { withApiErrors } from "@/lib/api-errors";
import { sendTelegramAlert } from "@/lib/telegram";
import { buildDailySummaryText } from "@/lib/dailySummary";

// Chamado uma vez por dia pelo Vercel Cron (ver vercel.json), mesmo padrão
// de autenticação do trial-alerts. Diferente dos alertas por evento (que
// avisam na hora de cada pagamento/cancelamento), isso é um boletim
// agregado das últimas 24h — dá uma leitura rápida de tendência sem
// precisar abrir o painel admin. Mesmo texto usado pelo comando /resumo do
// bot (ver src/app/api/telegram/webhook/route.ts), pra quem quiser puxar
// na hora em vez de esperar o horário fixo.
export const GET = withApiErrors("cron.dailySummary.GET", async (req: NextRequest) => {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  await sendTelegramAlert(await buildDailySummaryText());

  return NextResponse.json({ ok: true });
});
