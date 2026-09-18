import { NextRequest, NextResponse } from "next/server";
import { all, get } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { productSchema } from "@/lib/schemas";
import { withActiveAccess } from "@/lib/subscription";

type ProductRow = {
  id: number;
  name: string;
  defaultBuyPrice: string;
  defaultSellPrice: string;
  active: boolean;
};

export const GET = withApiErrors("products.GET", async () => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const result = await withActiveAccess(user, () =>
    all<ProductRow>(
      `SELECT id, name, default_buy_price as "defaultBuyPrice", default_sell_price as "defaultSellPrice", active
       FROM products WHERE user_id = $1 ORDER BY name ASC`,
      [user.id]
    )
  );
  if (result instanceof NextResponse) return result;
  return NextResponse.json({
    products: result.data.map((r) => ({
      ...r,
      defaultBuyPrice: Number(r.defaultBuyPrice),
      defaultSellPrice: Number(r.defaultSellPrice),
    })),
  });
});

export const POST = withApiErrors("products.POST", async (req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
  }

  const existingResult = await withActiveAccess(user, () =>
    get(`SELECT id FROM products WHERE user_id = $1 AND LOWER(name) = LOWER($2)`, [user.id, parsed.data.name])
  );
  if (existingResult instanceof NextResponse) return existingResult;
  const existing = existingResult.data;
  if (existing) {
    return NextResponse.json({ error: "Já existe um produto com esse nome." }, { status: 409 });
  }

  const row = await get<{ id: number }>(
    `INSERT INTO products (user_id, name, default_buy_price, default_sell_price) VALUES ($1, $2, $3, $4) RETURNING id`,
    [user.id, parsed.data.name, parsed.data.defaultBuyPrice, parsed.data.defaultSellPrice]
  );
  return NextResponse.json({ id: row?.id }, { status: 201 });
});
