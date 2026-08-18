// Alertas best-effort via bot do Telegram (pagamento falhou/estornado/
// chargeback/cancelado, acesso perto de vencer). Mesmo estilo de fetch puro
// usado em src/lib/payments/providers/asaas.ts — sem dependência nova.
export async function sendTelegramAlert(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error("[telegram] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID não configurados — alerta não enviado.");
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[telegram] falha ao enviar alerta (${res.status}):`, body);
    }
  } catch (err) {
    // Nunca deixa uma falha de rede/API do Telegram derrubar quem chamou
    // (webhook do gateway de pagamento ou o cron) — só perde a notificação.
    console.error("[telegram] erro ao enviar alerta:", err);
  }
}
