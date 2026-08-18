import { NextRequest, NextResponse } from "next/server";
import { all, run } from "@/db/pool";
import { withApiErrors } from "@/lib/api-errors";
import { sendTelegramAlert } from "@/lib/telegram";

// Chamado uma vez por dia pelo Vercel Cron (ver vercel.json). Não há evento
// de webhook pra "acesso perto de vencer" — só um teste diário. O Vercel
// Cron manda automaticamente "Authorization: Bearer <CRON_SECRET>" quando
// essa env var existe no projeto; sem isso qualquer um poderia bater nessa
// URL e disparar o job.
export const GET = withApiErrors("cron.trialAlerts.GET", async (req: NextRequest) => {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  // trial/acesso liberado com prazo vencendo nos próximos 3 dias (e ainda no
  // futuro) e que ainda não recebeu o alerta — cada assinatura só é
  // notificada uma vez, não todo dia enquanto faltam os 3 dias.
  const rows = await all<{
    subscriptionId: number;
    email: string;
    trialEndsAt: string;
    telegramChatId: string | null;
  }>(
    `SELECT s.id as "subscriptionId", u.email, s.trial_ends_at as "trialEndsAt",
      u.telegram_chat_id as "telegramChatId"
     FROM subscriptions s
     JOIN users u ON u.id = s.user_id
     WHERE s.status IN ('trialing', 'granted')
       AND s.trial_ends_at IS NOT NULL
       AND s.trial_ends_at > now()
       AND s.trial_ends_at <= now() + interval '3 days'
       AND s.expiry_alert_sent_at IS NULL`
  );

  for (const row of rows) {
    const daysLeft = Math.max(0, Math.ceil((new Date(row.trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
    await sendTelegramAlert(`⏳ ${row.email} — acesso termina em ${daysLeft} dia${daysLeft === 1 ? "" : "s"}`);
    // Mesmo evento, mesmo guard (expiry_alert_sent_at) — se o cliente
    // vinculou o próprio Telegram, ele recebe um aviso direto, com um texto
    // endereçado a ele em vez do resumo administrativo acima.
    if (row.telegramChatId) {
      await sendTelegramAlert(
        `⏳ Seu acesso no STRIX termina em ${daysLeft} dia${daysLeft === 1 ? "" : "s"} — renove pra não perder o acesso.`,
        row.telegramChatId
      );
    }
    await run(`UPDATE subscriptions SET expiry_alert_sent_at = now() WHERE id = $1`, [row.subscriptionId]);
  }

  return NextResponse.json({ ok: true, notified: rows.length });
});
