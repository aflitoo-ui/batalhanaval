"use client";

import { useEffect, useMemo, useState } from "react";

type InviteRow = {
  id: number;
  code: string;
  usedAt: string;
  referrerEmail: string;
  usedByEmail: string;
};

// Contas pessoais/de teste do próprio dono do sistema — não é apadrinhamento
// de verdade, é só a conta usada pra gerar o convite. Mostrar o login real
// aqui não ajuda em nada (é sempre a mesma pessoa), então some atrás de um
// rótulo genérico.
const OWN_ACCOUNTS = new Set(["test", "aflitoo"]);

function referrerLabel(email: string) {
  return OWN_ACCOUNTS.has(email) ? "Interno" : email;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR");
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

export function ConvitesAdminClient() {
  const [rows, setRows] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/invites");
      const data = await res.json().catch(() => null);
      setRows(data?.invites || []);
      setLoading(false);
    })();
  }, []);

  // Ranking de quem mais indicou, calculado em cima da mesma lista — não
  // precisa de outra consulta, são no máximo 200 linhas. Contas próprias
  // ficam de fora do ranking: não é uma indicação de verdade competindo
  // com clientes reais, é sempre a mesma pessoa (o dono do sistema).
  const topReferrers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (OWN_ACCOUNTS.has(r.referrerEmail)) continue;
      counts.set(r.referrerEmail, (counts.get(r.referrerEmail) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [rows]);

  if (loading) return <p className="text-sm text-zinc-500">Carregando...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Apadrinhamento</h1>
        <p className="mt-1 text-sm text-zinc-500">Quem convidou quem — últimos {rows.length} cadastros via convite.</p>
      </div>

      {topReferrers.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="mb-2 text-sm font-semibold text-zinc-200">Quem mais indicou</h2>
          <ul className="space-y-1">
            {topReferrers.map(([email, count]) => (
              <li key={email} className="flex items-center justify-between text-sm">
                <span className="text-zinc-300">{email}</span>
                <span className="font-medium text-zinc-100">
                  {count} indicaç{count === 1 ? "ão" : "ões"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-6 text-center text-sm text-zinc-500">
          Nenhum cadastro via convite ainda.
        </p>
      ) : (
        <>
          {/* Cartões — telas pequenas */}
          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <div key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-zinc-200">{r.usedByEmail}</p>
                  <span className="shrink-0 text-xs text-zinc-500">{formatDateTime(r.usedAt)}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  padrinho: <span className="text-zinc-300">{referrerLabel(r.referrerEmail)}</span>
                </p>
              </div>
            ))}
          </div>

          {/* Tabela — telas médias pra cima */}
          <div className="hidden overflow-x-auto rounded-lg border border-zinc-800 md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2">Quando</th>
                  <th className="px-4 py-2">Padrinho</th>
                  <th className="px-4 py-2">Afilhado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-900 last:border-0">
                    <td className="px-4 py-2 text-zinc-400">{formatDateTime(r.usedAt)}</td>
                    <td className="px-4 py-2 text-zinc-300">{referrerLabel(r.referrerEmail)}</td>
                    <td className="px-4 py-2 font-medium text-zinc-200">{r.usedByEmail}</td>
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
