import { NextRequest, NextResponse } from "next/server";
import { all, get, withTransaction } from "@/db/pool";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { logAdminAction } from "@/lib/adminLog";
import { createUserSchema } from "@/lib/schemas";

export const GET = withApiErrors("users.GET", async () => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const rows = await all(
    `SELECT id, email, role, active, created_at as "createdAt", last_seen_at as "lastSeenAt",
      telegram_chat_id IS NOT NULL as "telegramLinked"
     FROM users ORDER BY created_at ASC`
  );
  return NextResponse.json({ users: rows });
});

export const POST = withApiErrors("users.POST", async (req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
  }

  const existing = await get(`SELECT id FROM users WHERE email = $1`, [parsed.data.email]);
  if (existing) {
    return NextResponse.json({ error: "Já existe um usuário com esse e-mail." }, { status: 409 });
  }

  const passwordHash = hashPassword(parsed.data.password);
  const id = await withTransaction(async (tx) => {
    const newUser = await tx.get<{ id: number }>(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id`,
      [parsed.data.email, passwordHash, parsed.data.role || "user"]
    );
    // Trial de 14 dias, sem cobrança automática — se o cliente não pagar
    // depois de usar, o acesso é bloqueado (ver src/lib/subscription.ts).
    const plan = await tx.get<{ id: number }>(`SELECT id FROM plans WHERE code = 'mensal-2990'`);
    if (newUser && plan) {
      await tx.get(
        `INSERT INTO subscriptions (user_id, plan_id, status, trial_ends_at)
         VALUES ($1, $2, 'trialing', now() + interval '14 days')`,
        [newUser.id, plan.id]
      );
    }
    return newUser?.id;
  });
  await logAdminAction({
    adminId: user.id,
    action: "create_user",
    targetUserId: id ?? null,
    details: parsed.data.email,
  });
  return NextResponse.json({ id }, { status: 201 });
});
