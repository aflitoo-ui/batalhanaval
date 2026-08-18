// Alertas best-effort via bot do Telegram (pagamento falhou/estornado/
// chargeback/cancelado, acesso perto de vencer). Mesmo estilo de fetch puro
// usado em src/lib/payments/providers/asaas.ts — sem dependência nova.
//
// chatId é opcional: por padrão manda pro dono do sistema
// (TELEGRAM_CHAT_ID, canal fixo já existente), mas qualquer chamador pode
// passar o telegram_chat_id de um cliente específico que tenha vinculado o
// próprio Telegram (ver src/app/api/account/telegram-link/route.ts) pra
// mandar um alerta direto pra ele.
export async function sendTelegramAlert(text: string, chatId?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const targetChatId = chatId ?? process.env.TELEGRAM_CHAT_ID;
  if (!token || !targetChatId) {
    console.error("[telegram] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID não configurados — alerta não enviado.");
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: targetChatId, text }),
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
