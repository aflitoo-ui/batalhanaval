import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { all, get, withTransaction } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { logAdminAction } from "@/lib/adminLog";

export const GET = withApiErrors("account.invite.GET", async () => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const row = await get<{ inviteCredits: number }>(`SELECT invite_credits as "inviteCredits" FROM users WHERE id = $1`, [
    user.id,
  ]);
  const invites = await all<{ code: string; createdAt: string }>(
    `SELECT code, created_at as "createdAt" FROM invites WHERE created_by = $1 AND used_by IS NULL ORDER BY created_at DESC`,
    [user.id]
  );

  return NextResponse.json({ credits: row?.inviteCredits ?? 0, invites });
});

export const POST = withApiErrors("account.invite.POST", async () => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const code = await withTransaction(async (tx) => {
    const row = await tx.get<{ inviteCredits: number }>(
      `SELECT invite_credits as "inviteCredits" FROM users WHERE id = $1 FOR UPDATE`,
      [user.id]
    );
    if (!row || row.inviteCredits <= 0) return null;

    const newCode = randomBytes(8).toString("hex");
    await tx.get(`UPDATE users SET invite_credits = invite_credits - 1 WHERE id = $1`, [user.id]);
    await tx.get(`INSERT INTO invites (code, created_by) VALUES ($1, $2)`, [newCode, user.id]);
    return newCode;
  });

  if (!code) {
    return NextResponse.json({ error: "Você não tem créditos de convite disponíveis." }, { status: 400 });
  }
  await logAdminAction({ adminId: user.id, action: "generate_invite" });
  return NextResponse.json({ code });
});
