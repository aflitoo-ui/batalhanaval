import { NextRequest, NextResponse } from "next/server";
import { all, get } from "@/db/pool";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { createUserSchema } from "@/lib/schemas";

export const GET = withApiErrors("users.GET", async () => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const rows = await all(
    `SELECT id, email, role, active, created_at as "createdAt" FROM users ORDER BY created_at ASC`
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
  const row = await get<{ id: number }>(
    `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id`,
    [parsed.data.email, passwordHash, parsed.data.role || "user"]
  );
  return NextResponse.json({ id: row?.id }, { status: 201 });
});
