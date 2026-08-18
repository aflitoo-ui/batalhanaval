import { NextResponse } from "next/server";
import { all } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";

// Log de auditoria de ações administrativas — só o admin pode ver. Traz os
// e-mails via join (admin sempre existe; alvo pode ser null se o usuário já
// foi excluído, nesse caso o texto legível fica em "details").
export const GET = withApiErrors("admin.log.GET", async () => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const rows = await all<{
    id: number;
    action: string;
    details: string | null;
    createdAt: string;
    adminEmail: string;
    targetEmail: string | null;
  }>(
    `SELECT l.id, l.action, l.details, l.created_at as "createdAt",
      a.email as "adminEmail", t.email as "targetEmail"
     FROM admin_log l
     JOIN users a ON a.id = l.admin_id
     LEFT JOIN users t ON t.id = l.target_user_id
     ORDER BY l.created_at DESC
     LIMIT 200`
  );

  return NextResponse.json({ log: rows });
});
