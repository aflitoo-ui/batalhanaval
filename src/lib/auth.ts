import { cache } from "react";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { get, run } from "@/db/pool";

export type UserRole = "admin" | "user";
export type CurrentUser = {
  id: number;
  email: string;
  role: UserRole;
};

export { hashPassword, verifyPassword } from "./password";

const SESSION_COOKIE = "strix_session";
const SESSION_DAYS = 30;

export async function createSessionCookie(userId: number) {
  const token = randomUUID() + randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await run(`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`, [
    token,
    userId,
    expiresAt,
  ]);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Em dev (http, sem https) um cookie "secure" é recusado pelo navegador.
    // Em produção assume-se deploy atrás de HTTPS (Vercel).
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySessionCookie() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await run(`DELETE FROM sessions WHERE token = $1`, [token]);
  }
  jar.delete(SESSION_COOKIE);
}

// Memoizado por requisição — layout e páginas podem checar a sessão
// independentemente sem disparar mais de uma consulta ao banco.
export const getSessionUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await get<{ id: number; email: string; role: string; active: boolean; expiresAt: string }>(
    `SELECT u.id, u.email, u.role, u.active, s.expires_at as "expiresAt"
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = $1`,
    [token]
  );
  if (!row) return null;
  if (!row.active) return null;
  if (new Date(row.expiresAt) < new Date()) {
    await run(`DELETE FROM sessions WHERE token = $1`, [token]);
    return null;
  }
  return { id: row.id, email: row.email, role: row.role === "admin" ? "admin" : "user" };
});
