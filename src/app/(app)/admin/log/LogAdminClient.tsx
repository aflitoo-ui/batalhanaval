"use client";

import { useEffect, useState } from "react";

type LogRow = {
  id: number;
  action: string;
  details: string | null;
  createdAt: string;
  adminEmail: string;
  targetEmail: string | null;
};

const ACTION_LABEL: Record<string, string> = {
  grant_access: "Liberou acesso",
  revoke_access: "Revogou acesso",
  create_user: "Criou usuário",
  deactivate_user: "Desativou usuário",
  reactivate_user: "Reativou usuário",
  change_role: "Alterou papel",
  reset_password: "Redefiniu senha",
  reset_telegram: "Desvinculou Telegram",
  delete_user: "Excluiu usuário",
  grant_invite_credit: "Liberou +1 convite",
  generate_invite: "Gerou link de convite",
  signup_via_invite: "Padrinho de novo cadastro",
  send_password_reset: "Mandou link de redefinir senha (Telegram)",
};

function actionLabel(action: string) {
  return ACTION_LABEL[action] || action;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR");
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

export function LogAdminClient() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/log");
      const data = await res.json().catch(() => null);
      setRows(data?.log || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="text-sm text-zinc-500">Carregando...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Log de ações</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Últimas {rows.length} ações administrativas (liberar/revogar acesso, criar/excluir usuário, etc.).
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-6 text-center text-sm text-zinc-500">
          Nenhuma ação registrada ainda.
        </p>
      ) : (
        <>
          {/* Cartões — telas pequenas */}
          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <div key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-zinc-200">{actionLabel(r.action)}</p>
                  <span className="shrink-0 text-xs text-zinc-500">{formatDateTime(r.createdAt)}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">por {r.adminEmail}</p>
                {(r.targetEmail || r.details) && (
                  <p className="mt-1.5 text-xs text-zinc-400">
                    {r.targetEmail ? <span className="text-zinc-300">{r.targetEmail}</span> : null}
                    {r.targetEmail && r.details ? " · " : ""}
                    {r.details || ""}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Tabela — telas médias pra cima */}
          <div className="hidden overflow-x-auto rounded-lg border border-zinc-800 md:block">
            <table className="w-full min-w-[720px] table-fixed text-sm">
              <colgroup>
                <col className="w-[16%]" />
                <col className="w-[20%]" />
                <col className="w-[16%]" />
                <col className="w-[20%]" />
                <col className="w-[28%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2">Quando</th>
                  <th className="px-4 py-2">Admin</th>
                  <th className="px-4 py-2">Ação</th>
                  <th className="px-4 py-2">Alvo</th>
                  <th className="px-4 py-2">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-900 last:border-0">
                    <td className="px-4 py-2 text-zinc-400">{formatDateTime(r.createdAt)}</td>
                    <td className="truncate px-4 py-2 text-zinc-300">{r.adminEmail}</td>
                    <td className="px-4 py-2 font-medium text-zinc-200">{actionLabel(r.action)}</td>
                    <td className="truncate px-4 py-2 text-zinc-400">
                      {r.targetEmail || <span className="text-zinc-600">excluído</span>}
                    </td>
                    <td className="truncate px-4 py-2 text-zinc-500">{r.details || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
