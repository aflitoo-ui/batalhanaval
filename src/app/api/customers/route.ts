import { NextRequest, NextResponse } from "next/server";
import { all, get } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { customerSchema } from "@/lib/schemas";
import { withActiveAccess } from "@/lib/subscription";

type CustomerRow = { id: number; name: string; phone: string | null; active: boolean; createdAt: string };

export const GET = withApiErrors("customers.GET", async () => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const result = await withActiveAccess(user, () =>
    all<CustomerRow>(
      `SELECT id, name, phone, active, created_at as "createdAt" FROM customers WHERE user_id = $1 ORDER BY name ASC`,
      [user.id]
    )
  );
  if (result instanceof NextResponse) return result;
  return NextResponse.json({ customers: result.data });
});

export const POST = withApiErrors("customers.POST", async (req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = customerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
  }

  const existingResult = await withActiveAccess(user, () =>
    get(`SELECT id FROM customers WHERE user_id = $1 AND LOWER(name) = LOWER($2)`, [user.id, parsed.data.name])
  );
  if (existingResult instanceof NextResponse) return existingResult;
  const existing = existingResult.data;
  if (existing) {
    return NextResponse.json({ error: "Já existe um cliente com esse nome." }, { status: 409 });
  }

  const row = await get<{ id: number }>(
    `INSERT INTO customers (user_id, name, phone) VALUES ($1, $2, $3) RETURNING id`,
    [user.id, parsed.data.name, parsed.data.phone || null]
  );
  return NextResponse.json({ id: row?.id }, { status: 201 });
});
