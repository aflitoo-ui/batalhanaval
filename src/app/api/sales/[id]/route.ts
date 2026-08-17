import { NextRequest, NextResponse } from "next/server";
import { get, run } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { saleUpdateSchema } from "@/lib/schemas";
import { requireActiveAccess } from "@/lib/subscription";

export const PATCH = withApiErrors(
  "sales.PATCH",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const denied = await requireActiveAccess(user);
    if (denied) return denied;

    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    const parsed = saleUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
    }

    if (parsed.data.customerId !== undefined) {
      const customer = await get(`SELECT id FROM customers WHERE id = $1 AND user_id = $2`, [parsed.data.customerId, user.id]);
      if (!customer) {
        return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
      }
    }

    const columnByField: Record<string, string> = {
      saleDate: "sale_date",
      productId: "product_id",
      customerId: "customer_id",
      quantity: "quantity",
      unitBuyPrice: "unit_buy_price",
      unitSellPrice: "unit_sell_price",
      adjustment: "adjustment",
      notes: "notes",
    };

    const fields: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const [key, column] of Object.entries(columnByField)) {
      const value = (parsed.data as Record<string, unknown>)[key];
      if (value !== undefined) {
        fields.push(`${column} = $${i++}`);
        params.push(value);
      }
    }
    if (fields.length === 0) {
      return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
    }
    params.push(id, user.id);
    const result = await run(`UPDATE sales SET ${fields.join(", ")} WHERE id = $${i} AND user_id = $${i + 1}`, params);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Venda não encontrada." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withApiErrors(
  "sales.DELETE",
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const denied = await requireActiveAccess(user);
    if (denied) return denied;

    const { id } = await ctx.params;
    const result = await run(`DELETE FROM sales WHERE id = $1 AND user_id = $2`, [id, user.id]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Venda não encontrada." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }
);
