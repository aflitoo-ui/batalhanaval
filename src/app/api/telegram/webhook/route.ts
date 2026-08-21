import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { withTransaction } from "@/db/pool";
import { withApiErrors } from "@/lib/api-errors";
import { sendTelegramAlert } from "@/lib/telegram";
import { buildDailySummaryText } from "@/lib/dailySummary";

const LINK_BONUS_DAYS = 5;

// Endpoint chamado pelo Telegram (nunca pelo navegador do usuário) sempre
// que alguém interage com o bot — em especial quando abre o deep link
// t.me/<bot>?start=<code> e toca em "Iniciar", o que gera uma mensagem
// "/start <code>" que usamos pra ligar o chat.id de quem clicou ao usuário
// dono desse código (ver src/app/api/account/telegram-link/route.ts).
//
// Autenticação: registrado via setWebhook com secret_token — o Telegram
// reenvia esse valor no header abaixo em toda chamada. Comparação em tempo
// constante, mesmo espírito defensivo da verificação de assinatura do
// webhook da Asaas (src/lib/payments/providers/asaas.ts).
function isValidSecret(req: NextRequest): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const received = req.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const POST = withApiErrors("telegram.webhook.POST", async (req: NextRequest) => {
  if (!isValidSecret(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const text: string | undefined = body?.message?.text;
  const chatId: number | string | undefined = body?.message?.chat?.id;

  // Telegram espera 200 rápido pra qualquer update que reconheça — mensagem
  // que não é "/start <code>", código desconhecido, update de outro tipo
  // (edited_message, etc.) são só no-op, não erro.
  const match = typeof text === "string" ? text.match(/^\/start (.+)$/) : null;
  if (match && chatId !== undefined) {
    const code = match[1].trim();

    // Incentivo pra vincular: +5 dias de acesso, só uma vez POR CONTA (não
    // por vínculo) — telegram_bonus_granted_at é permanente e sobrevive a
    // "Trocar Telegram" de propósito, senão daria pra vincular, trocar,
    // vincular de novo repetidas vezes só pra somar +5 dias toda hora.
    const linked = await withTransaction(async (tx) => {
      const user = await tx.get<{ id: number; telegramBonusGrantedAt: string | null }>(
        `UPDATE users SET telegram_chat_id = $1, telegram_link_code = NULL
         WHERE telegram_link_code = $2 RETURNING id, telegram_bonus_granted_at as "telegramBonusGrantedAt"`,
        [String(chatId), code]
      );
      if (!user) return null;
      if (user.telegramBonusGrantedAt) return { result: "already_used" as const };

      const sub = await tx.get<{
        id: number;
        status: string;
        trialEndsAt: string | null;
        currentPeriodEnd: string | null;
      }>(
        `SELECT id, status, trial_ends_at as "trialEndsAt", current_period_end as "currentPeriodEnd"
         FROM subscriptions WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
        [user.id]
      );
      if (!sub) return { result: "no_subscription" as const };
      await tx.get(`UPDATE users SET telegram_bonus_granted_at = now() WHERE id = $1`, [user.id]);

      // Conta liberada pelo admin (com ou sem prazo) não mexe em dias — só
      // "trialing" (convite) ganha o bônus somado ao prazo já em curso.
      // Achado real: uma conta "granted" sem prazo (trial_ends_at NULL,
      // acesso permanente) caía no cálculo abaixo com base=hoje, e o
      // acesso permanente virava um prazo de só 5 dias — pior que não dar
      // bônus nenhum. Estorno e chargeback também ficam de fora: o
      // pagamento voltou (ou está em disputa), então dar acesso de volta só
      // por vincular o Telegram, sem checar o pagamento, seria um jeito de
      // burlar o bloqueio (achado em auditoria).
      if (sub.status === "granted" || sub.status === "refunded" || sub.status === "chargeback") {
        return { result: "not_eligible" as const };
      }

      if (sub.status === "trialing") {
        const base = sub.trialEndsAt && new Date(sub.trialEndsAt) > new Date() ? new Date(sub.trialEndsAt) : new Date();
        base.setDate(base.getDate() + LINK_BONUS_DAYS);
        await tx.get(`UPDATE subscriptions SET trial_ends_at = $1, updated_at = now() WHERE id = $2`, [
          base.toISOString(),
          sub.id,
        ]);
      } else if (sub.status === "active" || sub.status === "canceled") {
        const base =
          sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > new Date() ? new Date(sub.currentPeriodEnd) : new Date();
        base.setDate(base.getDate() + LINK_BONUS_DAYS);
        await tx.get(`UPDATE subscriptions SET current_period_end = $1, updated_at = now() WHERE id = $2`, [
          base.toISOString().slice(0, 10),
          sub.id,
        ]);
      } else {
        // pending/past_due/expired — um empurrão de boas-vindas pra pessoa
        // voltar a usar (refunded/chargeback já foram excluídos acima).
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + LINK_BONUS_DAYS);
        await tx.get(
          `UPDATE subscriptions SET status = 'granted', trial_ends_at = $1, updated_at = now() WHERE id = $2`,
          [trialEndsAt.toISOString(), sub.id]
        );
      }

      // Registra o bônus no histórico de pagamentos — não é dinheiro, mas é
      // o mesmo lugar que a pessoa (ou o admin, se ela reclamar "não
      // recebi") já consulta pra ver o que aconteceu com a conta.
      await tx.get(
        `INSERT INTO payments_history (subscription_id, amount, status, paid_at)
         VALUES ($1, $2, 'telegram_bonus', now())`,
        [sub.id, LINK_BONUS_DAYS]
      );

      return { result: "applied" as const };
    });

    if (linked?.result === "applied") {
      await sendTelegramAlert(
        `🎉 Telegram vinculado! Você ganhou +${LINK_BONUS_DAYS} dias de acesso no STRIX.`,
        String(chatId)
      );
    } else if (linked?.result === "not_eligible") {
      await sendTelegramAlert(
        "✅ Telegram vinculado com sucesso! Sua conta já tem acesso liberado pelo suporte, então não recebe o bônus de dias.",
        String(chatId)
      );
    } else if (linked?.result === "no_subscription") {
      await sendTelegramAlert(
        "✅ Telegram vinculado com sucesso! Sua conta não tem assinatura, então o bônus de dias não se aplica.",
        String(chatId)
      );
    } else if (linked) {
      await sendTelegramAlert("✅ Telegram vinculado com sucesso! (bônus de dias já recebido anteriormente)", String(chatId));
    }
  } else if (text === "/resumo" && chatId !== undefined) {
    // Mesmo boletim do cron diário, mas sob demanda — só responde no chat
    // do próprio admin (TELEGRAM_CHAT_ID), nunca pro chat de um usuário
    // comum que tenha vinculado o próprio Telegram, já que o resumo expõe
    // dados do negócio inteiro (MRR, todas as contas em atraso etc.).
    if (String(chatId) === process.env.TELEGRAM_CHAT_ID) {
      await sendTelegramAlert(await buildDailySummaryText(), String(chatId));
    }
  }

  return NextResponse.json({ ok: true });
});
