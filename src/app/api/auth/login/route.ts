import { NextRequest, NextResponse } from "next/server";
import { get } from "@/db/pool";
import { verifyPassword, createSessionCookie } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { isRateLimited, recordRateLimitFailure, clearRateLimit } from "@/lib/rate-limit";
import { sendTelegramAlert } from "@/lib/telegram";

const RATE_LIMIT_OPTS = { max: 10, windowMs: 5 * 60 * 1000 };

export const POST = withApiErrors("auth.login.POST", async (req: NextRequest) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimitKey = `login:${ip}`;
  if (isRateLimited(rateLimitKey, RATE_LIMIT_OPTS)) {
    return NextResponse.json(
      { error: "Muitas tentativas de login. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Informe login e senha." }, { status: 400 });
  }

  const user = await get<{ id: number; email: string; passwordHash: string; active: boolean; role: string }>(
    `SELECT id, email, password_hash as "passwordHash", active, role FROM users WHERE email = $1`,
    [email]
  );

  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    recordRateLimitFailure(rateLimitKey, RATE_LIMIT_OPTS);
    return NextResponse.json({ error: "Login ou senha incorretos." }, { status: 401 });
  }

  clearRateLimit(rateLimitKey);
  await createSessionCookie(user.id);

  // Conta admin tem acesso a tudo — avisa sempre que ela logar em produção,
  // pra dar pra notar rápido se não foi você (só em produção pra não virar
  // ruído toda vez que você loga aqui local pra testar). Best-effort, nunca
  // atrasa/derruba o login.
  if (user.role === "admin" && process.env.NODE_ENV === "production") {
    void sendTelegramAlert(`🔐 Login na conta admin (zulu) — IP ${ip}`);
  }

  return NextResponse.json({ user: { id: user.id, email: user.email } });
});
