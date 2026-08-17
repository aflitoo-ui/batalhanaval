import { NextRequest, NextResponse } from "next/server";
import { run } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { productSchema } from "@/lib/schemas";

export const PATCH = withApiErrors(
  "products.PATCH",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    const parsed = productSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (parsed.data.name !== undefined) {
      fields.push(`name = $${i++}`);
      params.push(parsed.data.name);
    }
    if (parsed.data.defaultBuyPrice !== undefined) {
      fields.push(`default_buy_price = $${i++}`);
      params.push(parsed.data.defaultBuyPrice);
    }
    if (parsed.data.defaultSellPrice !== undefined) {
      fields.push(`default_sell_price = $${i++}`);
      params.push(parsed.data.defaultSellPrice);
    }
    if (parsed.data.active !== undefined) {
      fields.push(`active = $${i++}`);
      params.push(parsed.data.active);
    }
    if (fields.length === 0) {
      return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
    }
    params.push(id, user.id);
    const result = await run(`UPDATE products SET ${fields.join(", ")} WHERE id = $${i} AND user_id = $${i + 1}`, params);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withApiErrors(
  "products.DELETE",
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await ctx.params;
    try {
      const result = await run(`DELETE FROM products WHERE id = $1 AND user_id = $2`, [id, user.id]);
      if (result.rowCount === 0) {
        return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
      }
    } catch (err) {
      // Violação de chave estrangeira (código 23503 do Postgres) — o produto
      // já tem vendas ligadas a ele, apagar perderia esse histórico.
      if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23503") {
        return NextResponse.json(
          { error: "Esse produto já tem vendas lançadas — não pode ser excluído. Desative em vez de excluir." },
          { status: 409 }
        );
      }
      throw err;
    }
    return NextResponse.json({ ok: true });
  }
);
