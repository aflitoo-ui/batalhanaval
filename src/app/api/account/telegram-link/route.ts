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

  // Mesmo dispensado (telegramPopupDismissed), ainda gera/devolve o link —
  // o popup (que respeita "dismissed" pra não incomodar de novo) e a tela
  // "Minha assinatura" (onde a pessoa pode voltar a vincular quando quiser,
  // mesmo tendo clicado "Não tenho Telegram" antes) usam essa mesma rota.
  let code = row.telegramLinkCode;
  if (!code) {
    code = randomBytes(16).toString("hex");
    await run(`UPDATE users SET telegram_link_code = $1 WHERE id = $2`, [code, user.id]);
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  const deepLink = botUsername ? `https://t.me/${botUsername}?start=${code}` : null;

  return NextResponse.json({ linked: false, dismissed: row.telegramPopupDismissed, deepLink });
});

export const POST = withApiErrors("account.telegramLink.POST", async (req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);

  if (body?.action === "dismiss") {
    await run(`UPDATE users SET telegram_popup_dismissed = true WHERE id = $1`, [user.id]);
    return NextResponse.json({ ok: true });
  }

  // "reset" cobre dois casos com a mesma limpeza de estado: trocar de
  // Telegram (já vinculado, quer ligar uma conta diferente) e "cliquei em
  // não tenho Telegram sem querer, quero vincular agora" — os dois viram
  // "sem vínculo, sem dispensa", e o próximo GET já gera um código novo.
  if (body?.action === "reset") {
    await run(
      `UPDATE users SET telegram_chat_id = NULL, telegram_link_code = NULL, telegram_popup_dismissed = false WHERE id = $1`,
      [user.id]
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
});
