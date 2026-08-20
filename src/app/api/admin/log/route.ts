import { NextRequest, NextResponse } from "next/server";
import { all } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { ACTION_LABEL } from "@/lib/adminLogLabels";

const PAGE_SIZE = 50;

// Log de auditoria de ações administrativas — só o admin pode ver. Traz os
// e-mails via join (admin sempre existe; alvo pode ser null se o usuário já
// foi excluído, nesse caso o texto legível fica em "details").
//
// Paginado por offset (não cursor) — o volume aqui é baixo o suficiente
// (dezenas de milhares no máximo) pra offset não virar problema de
// performance, e é bem mais simples de implementar dos dois lados.
export const GET = withApiErrors("admin.log.GET", async (req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  const q = searchParams.get("q")?.trim() || "";

  const params: unknown[] = [];
  let where = "";
  if (q) {
    // O valor salvo em l.action é sempre em inglês (ex: "generate_invite") —
    // pra quem busca "convite" (o termo que aparece na tela, traduzido)
    // achar algo, também casa contra as chaves cujo rótulo em português
    // contém o termo buscado.
    const qLower = q.toLowerCase();
    const matchingActions = Object.entries(ACTION_LABEL)
      .filter(([, label]) => label.toLowerCase().includes(qLower))
      .map(([key]) => key);

    params.push(`%${q}%`, matchingActions);
    where = `WHERE a.email ILIKE $1 OR t.email ILIKE $1 OR l.action ILIKE $1 OR l.details ILIKE $1 OR l.action = ANY($2)`;
  }
  // Busca um a mais que o tamanho da página só pra saber se tem próxima
  // página, sem precisar de um COUNT(*) separado.
  params.push(PAGE_SIZE + 1, offset);
  const limitParam = `$${params.length - 1}`;
  const offsetParam = `$${params.length}`;

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
     ${where}
     ORDER BY l.created_at DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params
  );

  const hasMore = rows.length > PAGE_SIZE;
  return NextResponse.json({ log: hasMore ? rows.slice(0, PAGE_SIZE) : rows, hasMore });
});
