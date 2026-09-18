"use client";

import { useMemo, useState } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { subscriptionBlockedMessage } from "../page";

type Sale = {
  id: number;
  saleDate: string;
  customerId: number | null;
  customerName: string | null;
  productName: string;
  quantity: number;
  unitBuyPrice: number;
  unitSellPrice: number;
  adjustment: number;
  total: number;
  paid: number;
  owed: number;
  profit: number;
};

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string) {
  const [, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}`;
}

// Dia local (fuso do navegador), não UTC — new Date().toISOString() sempre
// reflete UTC, o que inflava em +1 os buckets de dívida por atraso durante
// as últimas horas do dia no horário de Brasília (achado em auditoria).
function daysSince(iso: string) {
  const saleDate = new Date(iso.split("T")[0] + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - saleDate.getTime()) / 86400000);
}

type ProductAgg = { name: string; quantity: number; revenue: number; cost: number; profit: number; marginPct: number };
type CustomerAgg = { key: string; id: number | null; name: string; total: number; paid: number; owed: number; profit: number };
type MonthAgg = { key: string; label: string; total: number; profit: number };

const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function currentYearMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() };
}

function inMonth(s: Sale, year: number, month: number) {
  const [y, m] = s.saleDate.split("T")[0].split("-").map(Number);
  return y === year && m === month + 1;
}

function aggregateByMonth(sales: Sale[]): MonthAgg[] {
  const map = new Map<string, MonthAgg>();
  for (const s of sales) {
    const [y, m] = s.saleDate.split("T")[0].split("-");
    const key = `${y}-${m}`;
    const entry = map.get(key) || { key, label: `${MONTH_ABBR[Number(m) - 1]}/${y}`, total: 0, profit: 0 };
    entry.total += s.total;
    entry.profit += s.profit;
    map.set(key, entry);
  }
  // Mais recente primeiro — a situação atual é o que mais importa de cara.
  return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}

// Receita/lucro por produto usam só qtd × preço (nunca s.total/s.profit) —
// o "ajuste no total" de uma venda é uma cobrança/desconto solto, não algo
// gerado pelo produto em si. Somar ele aqui inflava (ou derrubava) a margem
// de qualquer produto que por acaso estivesse numa venda com ajuste.
function aggregateByProduct(sales: Sale[]): ProductAgg[] {
  const map = new Map<string, ProductAgg>();
  for (const s of sales) {
    const revenue = s.quantity * s.unitSellPrice;
    const cost = s.quantity * s.unitBuyPrice;
    const entry = map.get(s.productName) || { name: s.productName, quantity: 0, revenue: 0, cost: 0, profit: 0, marginPct: 0 };
    entry.quantity += s.quantity;
    entry.revenue += revenue;
    entry.cost += cost;
    entry.profit += revenue - cost;
    map.set(s.productName, entry);
  }
  return Array.from(map.values()).map((p) => ({ ...p, marginPct: p.cost > 0 ? (p.profit / p.cost) * 100 : 0 }));
}

function aggregateByCustomer(sales: Sale[]): CustomerAgg[] {
  const map = new Map<string, CustomerAgg>();
  for (const s of sales) {
    // Agrupa pela identidade do cliente (customerId), não pelo texto do
    // nome — assim o mesmo cliente com produtos diferentes conta como um
    // único cliente no ranking, mesmo se o nome dele mudar depois.
    const key = s.customerId != null ? `id:${s.customerId}` : `name:${s.customerName || ""}`;
    const entry = map.get(key) || { key, id: s.customerId, name: s.customerName || "-", total: 0, paid: 0, owed: 0, profit: 0 };
    entry.total += s.total;
    entry.paid += s.paid;
    entry.owed += s.owed;
    entry.profit += s.profit;
    map.set(key, entry);
  }
  return Array.from(map.values());
}

const AGE_BUCKETS: [string, number, number][] = [
  ["Até 30 dias", 0, 30],
  ["31 a 60 dias", 31, 60],
  ["61 a 90 dias", 61, 90],
  ["Mais de 90 dias", 91, Infinity],
];

// Sempre sobre TODAS as vendas (ignora o filtro de período) — é a mesma
// lógica de "Só quem deve" em Vendas: dívida é uma situação atual, não do
// mês que você está olhando. Guarda as vendas de cada faixa (não só o
// total) pra dar pra revelar exatamente quais são ao clicar no card.
function aggregateDebtAging(sales: Sale[]) {
  const buckets = AGE_BUCKETS.map(([label]) => ({ label, total: 0, count: 0, sales: [] as Sale[] }));
  for (const s of sales) {
    if (s.owed <= 0.001) continue;
    const age = daysSince(s.saleDate);
    const idx = AGE_BUCKETS.findIndex(([, min, max]) => age >= min && age <= max);
    if (idx >= 0) {
      buckets[idx].total += s.owed;
      buckets[idx].count += 1;
      buckets[idx].sales.push(s);
    }
  }
  return buckets.map((b) => ({ ...b, sales: b.sales.sort((a, c) => c.owed - a.owed) }));
}

function downloadCSV(filename: string, header: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function RankedBars({
  items,
  valueKey,
  formatValue,
  color,
}: {
  items: { name: string; value: number }[];
  valueKey: string;
  formatValue: (n: number) => string;
  color: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (items.length === 0) {
    return <p className="py-4 text-sm text-zinc-500">Sem dados ainda.</p>;
  }
  return (
    <div className="space-y-2.5" key={valueKey}>
      {items.map((item) => (
        <div key={item.name} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate font-medium text-zinc-300">{item.name}</span>
            <span className="shrink-0 tabular-nums text-zinc-400">{formatValue(item.value)}</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-sm bg-zinc-800/60">
            <div
              className="h-full rounded-r-[4px] transition-[width]"
              style={{ width: `${Math.max((item.value / max) * 100, 2)}%`, backgroundColor: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
        {action}
      </div>
      {children}
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

// Desativado por enquanto a pedido do dono — o botão nem aparece. Não
// apagar a lógica: é só trocar pra "true" e o export volta a funcionar.
const CSV_EXPORT_ENABLED = false;

function ExportButton({ onClick }: { onClick: () => void }) {
  if (!CSV_EXPORT_ENABLED) return null;
  return (
    <button
      onClick={onClick}
      className="rounded-md px-2.5 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
    >
      ⭳ Exportar CSV
    </button>
  );
}

type ProductSortKey = "quantity" | "revenue" | "profit" | "marginPct";
type CustomerSortKey = "total" | "profit" | "owed";

export default function RelatoriosPage() {
  const router = useRouter();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [productSort, setProductSort] = useState<ProductSortKey>("quantity");
  const [customerSort, setCustomerSort] = useState<CustomerSortKey>("total");
  const [viewMonth, setViewMonth] = useState(currentYearMonth);
  const [allTime, setAllTime] = useState(false);
  const [expandedAgeBucket, setExpandedAgeBucket] = useState<string | null>(null);
  const [subscriptionBlockedStatus, setSubscriptionBlockedStatus] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      // Inclui vendas arquivadas — mês arquivado some da lista de Vendas do
      // dia a dia, mas o histórico financeiro real continua contando aqui.
      const res = await fetch("/api/sales?includeArchived=1");

      // Sem assinatura ativa, a API nega com 403/subscription_required —
      // trata isso explicitamente pra não confundir "bloqueado" com "sem
      // vendas ainda" (que mostraria a mesma mensagem de lista vazia).
      if (res.status === 403) {
        const body = await res.json().catch(() => null);
        if (body?.code === "subscription_required") {
          setSubscriptionBlockedStatus(body?.subscriptionStatus || "expired");
          setLoading(false);
          return;
        }
      }

      const data = await res.json();
      setSales(data.sales || []);
      setSubscriptionBlockedStatus(null);
      setLoading(false);
    })();
  }, []);

  const isCurrentMonth = viewMonth.year === currentYearMonth().year && viewMonth.month === currentYearMonth().month;

  function goToMonth(delta: number) {
    setViewMonth((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  // Faturamento/Lucro por mês e o aging de dívida continuam olhando o
  // histórico inteiro (são visões de tendência/situação atual) — só os
  // totais, produtos e clientes respeitam o período selecionado.
  const periodSales = useMemo(
    () => (allTime ? sales : sales.filter((s) => inMonth(s, viewMonth.year, viewMonth.month))),
    [sales, allTime, viewMonth]
  );

  const products = useMemo(() => aggregateByProduct(periodSales), [periodSales]);
  const customers = useMemo(() => aggregateByCustomer(periodSales), [periodSales]);
  const recentMonths = useMemo(() => aggregateByMonth(sales).slice(0, 6), [sales]);
  const debtAging = useMemo(() => aggregateDebtAging(sales), [sales]);

  const totals = useMemo(
    () =>
      periodSales.reduce(
        // Math.max(0, s.owed): uma venda paga a mais (owed negativo) é um
        // crédito daquele cliente específico, não pode abater a dívida de
        // outro cliente na soma geral (achado em auditoria: um pagamento a
        // mais de R$10 escondia R$10 de dívida real de outra pessoa).
        (acc, s) => ({ revenue: acc.revenue + s.total, profit: acc.profit + s.profit, owed: acc.owed + Math.max(0, s.owed) }),
        { revenue: 0, profit: 0, owed: 0 }
      ),
    [periodSales]
  );

  const topByQuantity = useMemo(
    () => [...products].sort((a, b) => b.quantity - a.quantity).slice(0, 6).map((p) => ({ name: p.name, value: p.quantity })),
    [products]
  );

  const topByProfit = useMemo(
    () => [...products].sort((a, b) => b.profit - a.profit).slice(0, 6).map((p) => ({ name: p.name, value: p.profit })),
    [products]
  );

  const sortedProducts = useMemo(() => [...products].sort((a, b) => b[productSort] - a[productSort]), [products, productSort]);
  const sortedCustomers = useMemo(() => [...customers].sort((a, b) => b[customerSort] - a[customerSort]), [customers, customerSort]);

  function goToCustomerSales(name: string) {
    router.push(`/?cliente=${encodeURIComponent(name)}`);
  }

  function exportProductsCSV() {
    downloadCSV(
      "relatorios-produtos.csv",
      ["Produto", "Qtd vendida", "Receita", "Lucro", "Retorno (%)"],
      sortedProducts.map((p) => [p.name, p.quantity, p.revenue.toFixed(2), p.profit.toFixed(2), p.marginPct.toFixed(0)])
    );
  }

  function exportCustomersCSV() {
    downloadCSV(
      "relatorios-clientes.csv",
      ["Cliente", "Total comprado", "Pago", "Deve", "Lucro gerado"],
      sortedCustomers.map((c) => [c.name, c.total.toFixed(2), c.paid.toFixed(2), c.owed.toFixed(2), c.profit.toFixed(2)])
    );
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Carregando...</p>;
  }

  if (subscriptionBlockedStatus) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-zinc-100">Relatórios</h1>
        <div className="flex flex-col items-center gap-3 rounded-lg border border-red-900 bg-red-950/20 py-8 text-center">
          <p className="max-w-xs text-sm text-red-400">{subscriptionBlockedMessage(subscriptionBlockedStatus)}</p>
          <button
            onClick={() => router.push("/assinatura")}
            className="rounded-md bg-[#3a2268] px-4 py-1.5 text-sm font-medium text-white transition hover:bg-[#6139ae]"
          >
            Ver assinatura
          </button>
        </div>
      </div>
    );
  }

  if (sales.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-zinc-100">Relatórios</h1>
        <p className="text-sm text-zinc-500">Lance algumas vendas para ver os relatórios aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-zinc-100">Relatórios</h1>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => setAllTime((v) => !v)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            allTime ? "bg-zinc-700 text-zinc-100" : "bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          }`}
        >
          Todas as datas
        </button>
        {allTime ? (
          <button
            onClick={() => setAllTime(false)}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[#3a2268] transition hover:bg-zinc-900"
          >
            📅 Ver por mês
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={() => goToMonth(-1)}
              aria-label="Mês anterior"
              className="rounded-md px-2 py-1 text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200"
            >
              ◀
            </button>
            <span className="w-36 text-center text-sm font-medium text-zinc-200">
              {MONTH_NAMES[viewMonth.month]} {viewMonth.year}
            </span>
            <button
              onClick={() => goToMonth(1)}
              disabled={isCurrentMonth}
              aria-label="Próximo mês"
              className="rounded-md px-2 py-1 text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-30"
            >
              ▶
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="Faturamento" value={formatBRL(totals.revenue)} />
        <SummaryCard label="Lucro" value={formatBRL(totals.profit)} tone="emerald" />
        <SummaryCard label="A receber" value={formatBRL(totals.owed)} tone={totals.owed > 0.001 ? "red" : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Faturamento por mês">
          <RankedBars
            items={recentMonths.map((m) => ({ name: m.label, value: m.total }))}
            valueKey="month-total"
            formatValue={formatBRL}
            color="#3987e5"
          />
        </Panel>
        <Panel title="Lucro por mês">
          <RankedBars
            items={recentMonths.map((m) => ({ name: m.label, value: m.profit }))}
            valueKey="month-profit"
            formatValue={formatBRL}
            color="#199e70"
          />
        </Panel>
      </div>

      <Panel title="Dívida em aberto por idade">
        <p className="-mt-2 mb-3 text-xs text-zinc-500">
          Essa dívida reflete a situação atual do seu negócio: inclui vendas de qualquer mês, mesmo as de fora do
          período selecionado. Por isso o total pode ser diferente do &quot;A receber&quot; ali em cima, que soma só
          as vendas do mês que você está vendo.
        </p>
        {debtAging.every((b) => b.total === 0) ? (
          <p className="py-2 text-sm text-zinc-500">Ninguém deve nada no momento.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {debtAging.map((b) => (
                <button
                  key={b.label}
                  onClick={() => b.count > 0 && setExpandedAgeBucket((cur) => (cur === b.label ? null : b.label))}
                  disabled={b.count === 0}
                  className={`rounded-lg border p-3 text-left transition ${
                    expandedAgeBucket === b.label
                      ? "border-zinc-600 bg-zinc-800"
                      : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                  } ${b.count === 0 ? "cursor-default opacity-60" : "cursor-pointer"}`}
                >
                  <p className="text-xs text-zinc-500">{b.label}</p>
                  <p className={`mt-1 text-base font-bold ${b.total > 0 ? "text-red-400" : "text-zinc-600"}`}>{formatBRL(b.total)}</p>
                  <p className="text-[11px] text-zinc-600">{b.count} venda(s){b.count > 0 ? " — ver" : ""}</p>
                </button>
              ))}
            </div>
            {expandedAgeBucket && (
              <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950 text-left text-xs uppercase tracking-wide text-zinc-500">
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2">Produto</th>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2 text-right">Deve</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debtAging.find((b) => b.label === expandedAgeBucket)?.sales.map((s) => (
                      <tr
                        key={s.id}
                        onClick={s.customerId != null ? () => goToCustomerSales(s.customerName || "") : undefined}
                        className={`border-b border-zinc-900 last:border-0 ${s.customerId != null ? "cursor-pointer hover:bg-zinc-900/50" : ""}`}
                        title={s.customerId != null ? "Ver vendas desse cliente" : undefined}
                      >
                        <td className="px-3 py-2 font-medium text-amber-400">{s.customerName || "-"}</td>
                        <td className="px-3 py-2 text-zinc-300">{s.productName}</td>
                        <td className="px-3 py-2 text-zinc-400">{formatDate(s.saleDate)} ({daysSince(s.saleDate)}d)</td>
                        <td className="px-3 py-2 text-right font-medium text-red-400">{formatBRL(s.owed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Produtos mais vendidos (quantidade)">
          <RankedBars items={topByQuantity} valueKey="quantity" formatValue={(n) => String(n)} color="#3987e5" />
        </Panel>
        <Panel title="Produtos com mais lucro">
          <RankedBars items={topByProfit} valueKey="profit" formatValue={formatBRL} color="#199e70" />
        </Panel>
      </div>

      <Panel title="Todos os produtos" action={<ExportButton onClick={exportProductsCSV} />}>
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ["quantity", "Qtd vendida"],
              ["revenue", "Receita"],
              ["profit", "Lucro"],
              ["marginPct", "Retorno (%)"],
            ] as [ProductSortKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setProductSort(key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                productSort === key ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {sortedProducts.length === 0 ? (
          <p className="py-4 text-sm text-zinc-500">Nenhuma venda nesse período.</p>
        ) : (
          <>
          <div className="space-y-2 md:hidden">
            {sortedProducts.map((p) => (
              <div key={p.name} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <p className="mb-2 truncate text-sm font-medium text-zinc-200">{p.name}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <p className="text-[11px] text-zinc-500">Qtd vendida</p>
                    <p className="tabular-nums text-zinc-300">{p.quantity}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-500">Receita</p>
                    <p className="tabular-nums text-zinc-300">{formatBRL(p.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-500">Lucro</p>
                    <p className="tabular-nums text-emerald-400">{formatBRL(p.profit)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-500">Retorno</p>
                    <p className="tabular-nums text-zinc-300">{p.marginPct.toFixed(0)}%</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[480px] table-fixed text-sm">
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[17.5%]" />
                <col className="w-[17.5%]" />
                <col className="w-[17.5%]" />
                <col className="w-[17.5%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-1.5 pr-3">Produto</th>
                  <th className="py-1.5 pr-3 text-right">Qtd vendida</th>
                  <th className="py-1.5 pr-3 text-right">Receita</th>
                  <th className="py-1.5 pr-3 text-right">Lucro</th>
                  <th className="py-1.5 text-right">Retorno</th>
                </tr>
              </thead>
              <tbody>
                {sortedProducts.map((p) => (
                  <tr key={p.name} className="border-b border-zinc-900 last:border-0">
                    <td className="truncate py-1.5 pr-3 font-medium text-zinc-200">{p.name}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-300">{p.quantity}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-300">{formatBRL(p.revenue)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-emerald-400">{formatBRL(p.profit)}</td>
                    <td className="py-1.5 text-right tabular-nums text-zinc-300">{p.marginPct.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Panel>

      <Panel title="Melhores clientes" action={<ExportButton onClick={exportCustomersCSV} />}>
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ["total", "Total comprado"],
              ["profit", "Lucro gerado"],
              ["owed", "Deve"],
            ] as [CustomerSortKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setCustomerSort(key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                customerSort === key ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {sortedCustomers.length === 0 ? (
          <p className="py-4 text-sm text-zinc-500">Nenhuma venda nesse período.</p>
        ) : (
          <>
          <div className="space-y-2 md:hidden">
            {sortedCustomers.map((c) => (
              <div
                key={c.key}
                onClick={c.id != null ? () => goToCustomerSales(c.name) : undefined}
                className={`rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 ${c.id != null ? "cursor-pointer active:bg-zinc-800/50" : ""}`}
              >
                <p className="mb-2 truncate text-sm font-medium text-amber-400">{c.name}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <p className="text-[11px] text-zinc-500">Total comprado</p>
                    <p className="tabular-nums text-zinc-300">{formatBRL(c.total)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-500">Pago</p>
                    <p className="tabular-nums text-emerald-400">{formatBRL(c.paid)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-500">Deve</p>
                    <p className="tabular-nums text-red-400">{c.owed > 0 ? formatBRL(c.owed) : "-"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-500">Lucro gerado</p>
                    <p className="tabular-nums text-emerald-400">{formatBRL(c.profit)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[480px] table-fixed text-sm">
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[17.5%]" />
                <col className="w-[17.5%]" />
                <col className="w-[17.5%]" />
                <col className="w-[17.5%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-1.5 pr-3">Cliente</th>
                  <th className="py-1.5 pr-3 text-right">Total comprado</th>
                  <th className="py-1.5 pr-3 text-right">Pago</th>
                  <th className="py-1.5 pr-3 text-right">Deve</th>
                  <th className="py-1.5 text-right">Lucro gerado</th>
                </tr>
              </thead>
              <tbody>
                {sortedCustomers.map((c) => (
                  <tr
                    key={c.key}
                    onClick={c.id != null ? () => goToCustomerSales(c.name) : undefined}
                    className={`border-b border-zinc-900 last:border-0 ${c.id != null ? "cursor-pointer hover:bg-zinc-800/50" : ""}`}
                    title={c.id != null ? "Ver vendas desse cliente" : undefined}
                  >
                    <td className="truncate py-1.5 pr-3 font-medium text-amber-400">{c.name}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-300">{formatBRL(c.total)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-emerald-400">{formatBRL(c.paid)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-red-400">{c.owed > 0 ? formatBRL(c.owed) : "-"}</td>
                    <td className="py-1.5 text-right tabular-nums text-emerald-400">{formatBRL(c.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Panel>
    </div>
  );
}
