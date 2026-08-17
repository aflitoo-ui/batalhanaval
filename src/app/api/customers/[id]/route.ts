import { NextRequest, NextResponse } from "next/server";
import { get, run } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { customerSchema } from "@/lib/schemas";
import { requireActiveAccess } from "@/lib/subscription";

export const PATCH = withApiErrors(
  "customers.PATCH",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const denied = await requireActiveAccess(user);
    if (denied) return denied;

    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    const parsed = customerSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
    }

    if (parsed.data.name !== undefined) {
      const existing = await get(`SELECT id FROM customers WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND id != $3`, [
        user.id,
        parsed.data.name,
        id,
      ]);
      if (existing) {
        return NextResponse.json({ error: "Já existe um cliente com esse nome." }, { status: 409 });
      }
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (parsed.data.name !== undefined) {
      fields.push(`name = $${i++}`);
      params.push(parsed.data.name);
    }
    if (parsed.data.phone !== undefined) {
      fields.push(`phone = $${i++}`);
      params.push(parsed.data.phone || null);
    }
    if (parsed.data.active !== undefined) {
      fields.push(`active = $${i++}`);
      params.push(parsed.data.active);
    }
    if (fields.length === 0) {
      return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
    }
    params.push(id, user.id);
    const result = await run(`UPDATE customers SET ${fields.join(", ")} WHERE id = $${i} AND user_id = $${i + 1}`, params);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withApiErrors(
  "customers.DELETE",
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const denied = await requireActiveAccess(user);
    if (denied) return denied;

    const { id } = await ctx.params;
    try {
      const result = await run(`DELETE FROM customers WHERE id = $1 AND user_id = $2`, [id, user.id]);
      if (result.rowCount === 0) {
        return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
      }
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23503") {
        return NextResponse.json(
          { error: "Esse cliente já tem vendas lançadas — não pode ser excluído. Desative em vez de excluir." },
          { status: 409 }
        );
      }
      throw err;
    }
    return NextResponse.json({ ok: true });
  }
);
