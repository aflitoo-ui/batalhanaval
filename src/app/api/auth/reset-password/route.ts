import { NextRequest, NextResponse } from "next/server";
import { get, run } from "@/db/pool";
import { hashPassword } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { isRateLimited, recordRateLimitFailure } from "@/lib/rate-limit";
import { z } from "zod";

const RATE_LIMIT_OPTS = { max: 10, windowMs: 15 * 60 * 1000 };

const bodySchema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
});

// Pública, sem sessão — o token de uso único (mandado por Telegram, ver
// send-password-reset/route.ts) já é a prova de identidade.
export const POST = withApiErrors("auth.resetPassword.POST", async (req: NextRequest) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimitKey = `reset-password:${ip}`;
  if (isRateLimited(rateLimitKey, RATE_LIMIT_OPTS)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    recordRateLimitFailure(rateLimitKey, RATE_LIMIT_OPTS);
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
  }

  const reset = await get<{ id: number; userId: number }>(
    `SELECT id, user_id as "userId" FROM password_resets
     WHERE token = $1 AND used_at IS NULL AND expires_at > now()`,
    [parsed.data.token]
  );
  if (!reset) {
    recordRateLimitFailure(rateLimitKey, RATE_LIMIT_OPTS);
    return NextResponse.json({ error: "Link inválido ou expirado. Peça um novo ao suporte." }, { status: 400 });
  }

  const passwordHash = hashPassword(parsed.data.password);
  const updated = await run(
    `UPDATE password_resets SET used_at = now() WHERE id = $1 AND used_at IS NULL`,
    [reset.id]
  );
  if (updated.rowCount === 0) {
    // Corrida rara: dois cliques quase juntos no mesmo link.
    return NextResponse.json({ error: "Link inválido ou expirado. Peça um novo ao suporte." }, { status: 400 });
  }

  await run(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, reset.userId]);
  // Derruba qualquer sessão aberta com a senha antiga.
  await run(`DELETE FROM sessions WHERE user_id = $1`, [reset.userId]);

  return NextResponse.json({ ok: true });
});
