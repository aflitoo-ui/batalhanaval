import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { get, run } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";

// Sem checagem de role aqui de propósito: o admin já tem o próprio canal de
// alerta fixo (TELEGRAM_CHAT_ID via env), mas não custa nada deixar ele
// também vincular o Telegram por essa rota — mantém a rota simples (sem
// ramificação por papel) e não muda o comportamento de ninguém.
export const GET = withApiErrors("account.telegramLink.GET", async () => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const row = await get<{ telegramChatId: string | null; telegramLinkCode: string | null; telegramPopupDismissed: boolean }>(
    `SELECT telegram_chat_id as "telegramChatId", telegram_link_code as "telegramLinkCode",
      telegram_popup_dismissed as "telegramPopupDismissed"
     FROM users WHERE id = $1`,
    [user.id]
  );
  if (!row) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  if (row.telegramChatId) {
    return NextResponse.json({ linked: true });
  }
  if (row.telegramPopupDismissed) {
    return NextResponse.json({ linked: false, dismissed: true });
  }

  // Gera o código de vínculo sob demanda (na primeira vez que o usuário
  // chega aqui sem ter dispensado nem vinculado ainda) e persiste — precisa
  // ser estável entre chamadas pra o link do popup não trocar a cada render.
  let code = row.telegramLinkCode;
  if (!code) {
    code = randomBytes(16).toString("hex");
    await run(`UPDATE users SET telegram_link_code = $1 WHERE id = $2`, [code, user.id]);
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  const deepLink = botUsername ? `https://t.me/${botUsername}?start=${code}` : null;

  return NextResponse.json({ linked: false, dismissed: false, deepLink });
});

export const POST = withApiErrors("account.telegramLink.POST", async (req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (body?.action !== "dismiss") {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  await run(`UPDATE users SET telegram_popup_dismissed = true WHERE id = $1`, [user.id]);
  return NextResponse.json({ ok: true });
});
