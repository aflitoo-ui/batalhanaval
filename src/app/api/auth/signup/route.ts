import { NextRequest, NextResponse } from "next/server";
import { get, withTransaction } from "@/db/pool";
import { hashPassword, createSessionCookie } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { signupSchema } from "@/lib/schemas";
import { isRateLimited, recordRateLimitFailure } from "@/lib/rate-limit";

const RATE_LIMIT_OPTS = { max: 10, windowMs: 15 * 60 * 1000 };

// Cadastro público via convite — a única porta de entrada pra criar conta
// sem ser o admin. Sem convite válido (código existente e ainda não usado)
// não tem como chegar até aqui: ver src/app/api/account/invite/route.ts
// pra como o código é gerado.
export const POST = withApiErrors("auth.signup.POST", async (req: NextRequest) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimitKey = `signup:${ip}`;
  if (isRateLimited(rateLimitKey, RATE_LIMIT_OPTS)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    recordRateLimitFailure(rateLimitKey, RATE_LIMIT_OPTS);
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
  }

  const invite = await get<{ id: number }>(`SELECT id FROM invites WHERE code = $1 AND used_by IS NULL`, [
    parsed.data.code,
  ]);
  if (!invite) {
    recordRateLimitFailure(rateLimitKey, RATE_LIMIT_OPTS);
    return NextResponse.json({ error: "Convite inválido ou já utilizado." }, { status: 400 });
  }

  const existing = await get(`SELECT id FROM users WHERE email = $1`, [parsed.data.email]);
  if (existing) {
    recordRateLimitFailure(rateLimitKey, RATE_LIMIT_OPTS);
    return NextResponse.json({ error: "Já existe uma conta com esse e-mail." }, { status: 409 });
  }

  const passwordHash = hashPassword(parsed.data.password);
  const userId = await withTransaction(async (tx) => {
    const newUser = await tx.get<{ id: number }>(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'user') RETURNING id`,
      [parsed.data.email, passwordHash]
    );
    if (!newUser) return undefined;

    // Mesmo trial de 14 dias que o admin dá ao criar uma conta manualmente
    // (ver POST /api/users).
    const plan = await tx.get<{ id: number }>(`SELECT id FROM plans WHERE code = 'mensal-2990'`);
    if (plan) {
      await tx.get(
        `INSERT INTO subscriptions (user_id, plan_id, status, trial_ends_at)
         VALUES ($1, $2, 'trialing', now() + interval '14 days')`,
        [newUser.id, plan.id]
      );
    }

    await tx.get(`UPDATE invites SET used_by = $1, used_at = now() WHERE id = $2`, [newUser.id, invite.id]);
    return newUser.id;
  });

  if (!userId) {
    return NextResponse.json({ error: "Erro ao criar conta." }, { status: 500 });
  }

  await createSessionCookie(userId);
  return NextResponse.json({ ok: true }, { status: 201 });
});
