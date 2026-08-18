import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { run } from "@/db/pool";
import { withApiErrors } from "@/lib/api-errors";

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
    await run(
      `UPDATE users SET telegram_chat_id = $1, telegram_link_code = NULL WHERE telegram_link_code = $2`,
      [String(chatId), code]
    );
  }

  return NextResponse.json({ ok: true });
});
