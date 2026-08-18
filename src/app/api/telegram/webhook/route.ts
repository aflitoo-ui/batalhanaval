import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { withTransaction } from "@/db/pool";
import { withApiErrors } from "@/lib/api-errors";
import { sendTelegramAlert } from "@/lib/telegram";

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
      if (user.telegramBonusGrantedAt) return { bonusApplied: false };

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
      if (!sub) return { bonusApplied: false };
      await tx.get(`UPDATE users SET telegram_bonus_granted_at = now() WHERE id = $1`, [user.id]);

      if (sub.status === "trialing" || sub.status === "granted") {
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
        // expirado/aguardando pagamento/sem assinatura ativa — um empurrão
        // de boas-vindas pra pessoa voltar a usar.
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + LINK_BONUS_DAYS);
        await tx.get(
          `UPDATE subscriptions SET status = 'granted', trial_ends_at = $1, updated_at = now() WHERE id = $2`,
          [trialEndsAt.toISOString(), sub.id]
        );
      }

      return { bonusApplied: true };
    });

    if (linked?.bonusApplied) {
      await sendTelegramAlert(
        `🎉 Telegram vinculado! Você ganhou +${LINK_BONUS_DAYS} dias de acesso no STRIX.`,
        String(chatId)
      );
    } else if (linked) {
      await sendTelegramAlert("✅ Telegram vinculado com sucesso!", String(chatId));
    }
  }

  return NextResponse.json({ ok: true });
});
