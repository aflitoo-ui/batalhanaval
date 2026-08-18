import { run } from "@/db/pool";

/**
 * Registra uma ação administrativa no log de auditoria (admin_log). Nunca
 * deve derrubar a rota que chamou — se a gravação do log falhar, só loga o
 * erro no servidor (mesmo espírito defensivo do withApiErrors em
 * src/lib/api-errors.ts): a ação em si (grant, delete, etc.) já foi feita
 * com sucesso, perder o registro do log não pode virar um erro 500 pro admin.
 */
export async function logAdminAction(params: {
  adminId: number;
  action: string;
  targetUserId?: number | null;
  details?: string;
}): Promise<void> {
  try {
    await run(
      `INSERT INTO admin_log (admin_id, action, target_user_id, details) VALUES ($1, $2, $3, $4)`,
      [params.adminId, params.action, params.targetUserId ?? null, params.details ?? null]
    );
  } catch (err) {
    console.error("[adminLog] falha ao gravar ação:", err);
  }
}
