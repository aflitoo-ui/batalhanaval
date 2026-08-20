import { NextResponse } from "next/server";
import { all } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";

// Quem convidou quem — só convites já usados (os que ainda não foram usados
// não têm "afilhado" pra mostrar). Admin-only.
export const GET = withApiErrors("admin.invites.GET", async () => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const rows = await all<{
    id: number;
    code: string;
    usedAt: string;
    referrerEmail: string;
    usedByEmail: string;
  }>(
    `SELECT i.id, i.code, i.used_at as "usedAt",
      creator.email as "referrerEmail", used.email as "usedByEmail"
     FROM invites i
     JOIN users creator ON creator.id = i.created_by
     JOIN users used ON used.id = i.used_by
     WHERE i.used_by IS NOT NULL
     ORDER BY i.used_at DESC
     LIMIT 200`
  );

  return NextResponse.json({ invites: rows });
});
