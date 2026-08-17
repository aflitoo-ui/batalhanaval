import { NextRequest, NextResponse } from "next/server";
import { run } from "@/db/pool";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { updateUserSchema } from "@/lib/schemas";

export const PATCH = withApiErrors(
  "users.PATCH",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

    const { id } = await ctx.params;
    if (Number(id) === user.id) {
      return NextResponse.json({ error: "Você não pode alterar a própria conta por aqui." }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (parsed.data.active !== undefined) {
      fields.push(`active = $${i++}`);
      params.push(parsed.data.active);
    }
    if (parsed.data.role !== undefined) {
      fields.push(`role = $${i++}`);
      params.push(parsed.data.role);
    }
    if (parsed.data.password !== undefined) {
      fields.push(`password_hash = $${i++}`);
      params.push(hashPassword(parsed.data.password));
    }
    if (fields.length === 0) {
      return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
    }
    params.push(id);
    const result = await run(`UPDATE users SET ${fields.join(", ")} WHERE id = $${i}`, params);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withApiErrors(
  "users.DELETE",
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

    const { id } = await ctx.params;
    if (Number(id) === user.id) {
      return NextResponse.json({ error: "Você não pode excluir a própria conta." }, { status: 400 });
    }

    // Apaga em cascata produtos, vendas, assinatura e sessões desse usuário
    // (chaves estrangeiras com ON DELETE CASCADE) — ação irreversível.
    const result = await run(`DELETE FROM users WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }
);
