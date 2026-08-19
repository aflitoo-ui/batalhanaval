import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { get, run } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { logAdminAction } from "@/lib/adminLog";
import { sendTelegramAlert } from "@/lib/telegram";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1h — link fica velho rápido de propósito

// Admin manda um link de uso único pelo Telegram do próprio usuário — ele
// clica e escolhe a senha nova sozinho (ver /redefinir-senha). Ninguém além
// da pessoa dona da conta chega a ver a senha em texto puro.
export const POST = withApiErrors(
  "users.sendPasswordReset.POST",
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await getSessionUser();
    if (!admin) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (admin.role !== "admin") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

    const { id } = await ctx.params;
    const target = await get<{ telegramChatId: string | null }>(
      `SELECT telegram_chat_id as "telegramChatId" FROM users WHERE id = $1`,
      [id]
    );
    if (!target) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    if (!target.telegramChatId) {
      return NextResponse.json({ error: "Esse usuário não tem Telegram vinculado." }, { status: 400 });
    }

    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await run(`INSERT INTO password_resets (token, user_id, expires_at) VALUES ($1, $2, $3)`, [
      token,
      id,
      expiresAt,
    ]);

    const url = `${_req.nextUrl.origin}/redefinir-senha?t=${token}`;
    await sendTelegramAlert(
      `🔑 O suporte pediu a redefinição da sua senha no STRIX. Toque no link pra escolher uma senha nova (expira em 1h): ${url}`,
      target.telegramChatId
    );

    await logAdminAction({ adminId: admin.id, action: "send_password_reset", targetUserId: Number(id) });
    return NextResponse.json({ ok: true });
  }
);
