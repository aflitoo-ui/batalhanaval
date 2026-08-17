"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  userId: number;
  email: string;
  status: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  price: number | null;
  daysLeft: number | null;
};

type Summary = { total: number; ativos: number; cancelados: number; inadimplentes: number; receitaMes: number };

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function formatDaysLeft(status: string | null, daysLeft: number | null) {
  if (status === "granted" && daysLeft === null) return "Sem prazo";
  if (daysLeft === null) return "-";
  if (daysLeft < 0) return "Vencido";
  if (daysLeft === 0) return "Hoje";
  return `${daysLeft} dia${daysLeft === 1 ? "" : "s"}`;
}

const STATUS_LABEL: Record<string, string> = {
  trialing: "Teste grátis",
  active: "Ativa",
  granted: "Liberada",
  pending: "Aguardando pagamento",
  past_due: "Inadimplente",
  canceled: "Cancelada",
  expired: "Expirada",
};

export function AssinaturasAdminClient() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/subscriptions");
      const data = await res.json();
      setSummary(data.summary);
      setRows(data.subscriptions || []);
      setLoading(false);
    })();
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.email.toLowerCase().includes(q));
  }, [rows, search]);

  if (loading) return <p className="text-sm text-zinc-500">Carregando...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-zinc-100">Assinaturas</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label="Usuários" value={String(summary?.total ?? 0)} />
        <SummaryCard label="Ativos" value={String(summary?.ativos ?? 0)} tone="emerald" />
        <SummaryCard label="Cancelados" value={String(summary?.cancelados ?? 0)} />
        <SummaryCard label="Inadimplentes" value={String(summary?.inadimplentes ?? 0)} tone="red" />
        <SummaryCard label="Receita do mês" value={formatBRL(summary?.receitaMes ?? 0)} tone="emerald" />
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por e-mail..."
        className="input max-w-xs"
      />

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full min-w-[560px] table-fixed text-sm">
          <colgroup>
            <col className="w-[30%]" />
            <col className="w-[20%]" />
            <col className="w-[15%]" />
            <col className="w-[20%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-2">Usuário</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Valor</th>
              <th className="px-4 py-2">Próx. cobrança</th>
              <th className="px-4 py-2">Dias restantes</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                  {rows.length === 0 ? "Nenhum usuário ainda." : "Nenhum usuário encontrado para essa busca."}
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => (
                <tr key={r.userId} className="border-b border-zinc-900 last:border-0">
                  <td className="truncate px-4 py-2 font-medium text-zinc-200">{r.email}</td>
                  <td className="px-4 py-2 text-zinc-300">
                    {r.status ? STATUS_LABEL[r.status] || r.status : "-"}
                  </td>
                  <td className="px-4 py-2 text-right text-zinc-300">{r.price ? formatBRL(r.price) : "-"}</td>
                  <td className="px-4 py-2 text-zinc-400">{formatDate(r.currentPeriodEnd)}</td>
                  <td
                    className={`px-4 py-2 ${
                      r.daysLeft !== null && r.daysLeft <= 5 ? "font-medium text-amber-400" : "text-zinc-400"
                    }`}
                  >
                    {formatDaysLeft(r.status, r.daysLeft)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "red" }) {
  const color = tone === "emerald" ? "text-emerald-400" : tone === "red" ? "text-red-400" : "text-zinc-100";
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
