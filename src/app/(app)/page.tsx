"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStandalone } from "@/lib/useStandalone";

export type Product = {
  id: number;
  name: string;
  defaultBuyPrice: number;
  defaultSellPrice: number;
  active: boolean;
};

export type Customer = {
  id: number;
  name: string;
  phone: string | null;
  active: boolean;
};

export type Sale = {
  id: number;
  saleDate: string;
  customerId: number | null;
  customerName: string | null;
  productId: number;
  productName: string;
  quantity: number;
  unitBuyPrice: number;
  unitSellPrice: number;
  adjustment: number;
  notes: string | null;
  total: number;
  paid: number;
  owed: number;
  profit: number;
};

export type PaymentEntry = { id: number; amount: number; paidAt: string; notes: string | null };

export function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(iso: string) {
  const [, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}`;
}

// Mensagem de bloqueio nas telas de dados (Vendas/Produtos/Clientes/
// Relatórios) — antes era sempre "assinatura expirou", mesmo pra estorno,
// contestação ou pagamento atrasado, quando nada "expirou" de fato nesses
// casos (achado em auditoria).
export function subscriptionBlockedMessage(status: string | undefined): string {
  if (status === "refunded") return "Pagamento estornado. Regularize abaixo pra voltar a usar o STRIX.";
  if (status === "chargeback") return "Pagamento contestado. Regularize abaixo pra voltar a usar o STRIX.";
  if (status === "past_due") return "Pagamento atrasado. Regularize abaixo pra voltar a usar o STRIX.";
  return "Sua assinatura expirou. Regularize abaixo pra voltar a usar o STRIX.";
}

// Aceita tanto "10,5" (formato BR digitado) quanto "1.234,56" (com milhar) —
// só remove pontos quando há vírgula, senão um valor como "1000" (sem
// vírgula) seria lido errado como 1 (achado em auditoria: o mobile tinha
// esse mesmo tipo de bug, corrigido lá com a mesma lógica). Retorna NaN pra
// entrada inválida (não 0) de propósito — o resto do código já valida com
// Number.isNaN antes de salvar, então "0 silencioso" esconderia erro de
// digitação; quem só quer exibir um preview usa `|| 0` como já fazia.
export function parseNumber(v: string): number {
  if (!v) return NaN;
  const str = v.trim();
  const normalized = str.includes(",") ? str.replace(/\./g, "").replace(",", ".") : str;
  return Number(normalized);
}

// Dia local (fuso do navegador), não UTC — toISOString() sempre reflete UTC,
// o que fazia o app "virar o dia" ~3h antes da meia-noite real no horário de
// Brasília, inflando todo contador de dias em atraso por algumas horas
// diariamente (achado em auditoria).
export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysSince(iso: string) {
  const saleDate = new Date(iso.split("T")[0] + "T00:00:00");
  const today = new Date(todayISO() + "T00:00:00");
  return Math.round((today.getTime() - saleDate.getTime()) / 86400000);
}

function inMonth(s: Sale, year: number, month: number) {
  const [y, m] = s.saleDate.split("T")[0].split("-").map(Number);
  return y === year && m === month + 1;
}


const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function currentYearMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() };
}

export const ADJUSTMENT_HINT =
  "Use quando o cliente já te devia algum valor atrasado de antes e você quer somar essa dívida ao total dessa venda. Toque no +/− ao lado do campo pra escolher entre somar ou descontar.";

export function AdjustmentSignToggle({ negative, onToggle }: { negative: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={negative ? "Descontando do total — toque pra somar" : "Somando ao total — toque pra descontar"}
      className={`shrink-0 rounded-lg border px-3 text-base font-bold transition ${
        negative
          ? "border-red-800 bg-red-950/40 text-red-400 hover:bg-red-950/70"
          : "border-emerald-800 bg-emerald-950/40 text-emerald-400 hover:bg-emerald-950/70"
      }`}
    >
      {negative ? "−" : "+"}
    </button>
  );
}

export default function VendasPage() {
  return (
    <Suspense>
      <VendasPageInner />
    </Suspense>
  );
}

function VendasPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isStandalone = useStandalone();
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewSale, setShowNewSale] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyOwed, setOnlyOwed] = useState(false);
  const [debtAgeFilter, setDebtAgeFilter] = useState(0);
  const [viewMonth, setViewMonth] = useState(currentYearMonth);
  const [showArchiveMonth, setShowArchiveMonth] = useState(false);
  const [showUnarchiveMonth, setShowUnarchiveMonth] = useState(false);
  const [archiveBlockedMsg, setArchiveBlockedMsg] = useState<string | null>(null);
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [subscriptionBlockedStatus, setSubscriptionBlockedStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!archiveBlockedMsg) return;
    const t = setTimeout(() => setArchiveBlockedMsg(null), 4000);
    return () => clearTimeout(t);
  }, [archiveBlockedMsg]);

  async function load() {
    const [salesRes, allSalesRes, productsRes, customersRes] = await Promise.all([
      fetch("/api/sales"),
      fetch("/api/sales?includeArchived=1"),
      fetch("/api/products"),
      fetch("/api/customers"),
    ]);

    // Sem assinatura ativa, as APIs negam com 403/subscription_required —
    // trata isso explicitamente pra não confundir "bloqueado" com "sem
    // vendas ainda" (que mostraria a mesma lista vazia).
    for (const res of [salesRes, allSalesRes, productsRes, customersRes]) {
      if (res.status === 403) {
        const body = await res.json().catch(() => null);
        if (body?.code === "subscription_required") {
          setSubscriptionBlockedStatus(body?.subscriptionStatus || "expired");
          setLoading(false);
          return;
        }
      }
    }

    const salesData = await salesRes.json();
    const allSalesData = await allSalesRes.json();
    const productsData = await productsRes.json();
    const customersData = await customersRes.json();
    setSales(salesData.sales || []);
    setAllSales(allSalesData.sales || []);
    setProducts(productsData.products || []);
    setCustomers(customersData.customers || []);
    setSubscriptionBlockedStatus(null);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  // Chegando aqui a partir do drill-down de um cliente em Relatórios — a
  // busca já vem preenchida com o nome. Limpa o parâmetro da URL depois de
  // aplicar pra não reaplicar sempre que a página for recarregada.
  useEffect(() => {
    const cliente = searchParams.get("cliente");
    if (cliente) {
      setSearch(cliente);
      router.replace("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const isCurrentMonth = viewMonth.year === currentYearMonth().year && viewMonth.month === currentYearMonth().month;

  function goToMonth(delta: number) {
    setArchiveBlockedMsg(null);
    setViewMonth((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  const q = search.trim().toLowerCase();
  // Buscar por um cliente é implicitamente "todas as datas" — sem isso o
  // resultado ficaria vazio sem motivo aparente sempre que a venda daquele
  // cliente não estivesse no mês em exibição no momento (inclusive vindo do
  // drill-down de Relatórios).
  const monthFilterActive = !onlyOwed && !q;

  const filteredSales = useMemo(() => {
    return sales
      .filter((s) => (monthFilterActive ? inMonth(s, viewMonth.year, viewMonth.month) : true))
      .filter((s) => !q || (s.customerName || "").toLowerCase().includes(q))
      .filter((s) => !onlyOwed || s.owed > 0)
      .filter((s) => !onlyOwed || debtAgeFilter === 0 || daysSince(s.saleDate) >= debtAgeFilter);
  }, [sales, q, onlyOwed, viewMonth, debtAgeFilter, monthFilterActive]);

  // Lista renderizada em telas com centenas de vendas ficava enorme (e no PWA
  // chegou a atrapalhar o posicionamento da barra inferior) — mostra só as
  // primeiras 80 até a pessoa pedir o resto. Some sozinho quando o filtro
  // muda, senão ficaria expandido/contraído sem relação com o que tá vendo.
  const SALES_PAGE_SIZE = 80;
  const [showAllSales, setShowAllSales] = useState(false);
  useEffect(() => {
    setShowAllSales(false);
  }, [q, onlyOwed, viewMonth, debtAgeFilter]);
  const visibleSales = useMemo(
    () => (showAllSales ? filteredSales : filteredSales.slice(0, SALES_PAGE_SIZE)),
    [filteredSales, showAllSales]
  );

  // Um mês só é arquivado por inteiro (a rota de arquivar pega todas as
  // vendas do mês de uma vez) — então "sem vendas ativas mas com vendas no
  // includeArchived=1" significa "esse mês está arquivado", não "vazio".
  const isMonthArchived = useMemo(() => {
    if (!monthFilterActive) return false;
    return !sales.some((s) => inMonth(s, viewMonth.year, viewMonth.month)) && allSales.some((s) => inMonth(s, viewMonth.year, viewMonth.month));
  }, [sales, allSales, monthFilterActive, viewMonth]);

  // Ranking de "clientes mais usados" pro CustomerPicker — igual ao mobile,
  // conta quantas vendas cada cliente tem no histórico completo (não só o
  // mês em exibição).
  const customerUsage = useMemo(() => {
    const usage = new Map<number, number>();
    for (const s of allSales) {
      if (s.customerId != null) usage.set(s.customerId, (usage.get(s.customerId) ?? 0) + 1);
    }
    return usage;
  }, [allSales]);

  const totals = useMemo(() => {
    return filteredSales.reduce(
      (acc, s) => ({
        total: acc.total + s.total,
        paid: acc.paid + s.paid,
        owed: acc.owed + s.owed,
        profit: acc.profit + s.profit,
      }),
      { total: 0, paid: 0, owed: 0, profit: 0 }
    );
  }, [filteredSales]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-100">Vendas</h1>
        {!isStandalone && (
          <button
            onClick={() => setShowNewSale(true)}
            className="rounded-md bg-[#3a2268] px-4 py-1.5 text-sm font-medium text-white transition hover:bg-[#6139ae]"
          >
            + Nova venda
          </button>
        )}
      </div>

      <div className={`flex items-center justify-center gap-3 ${monthFilterActive ? "" : "opacity-40"}`}>
        <button
          onClick={() => goToMonth(-1)}
          disabled={!monthFilterActive}
          aria-label="Mês anterior"
          className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200 disabled:pointer-events-none"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="w-36 text-center text-sm font-medium text-zinc-200">
          {monthFilterActive ? `${MONTH_NAMES[viewMonth.month]} ${viewMonth.year}` : "Todas as datas"}
        </span>
        <button
          onClick={() => goToMonth(1)}
          disabled={!monthFilterActive || isCurrentMonth}
          aria-label="Próximo mês"
          className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-30"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {monthFilterActive && isMonthArchived && (
        <div className="text-center">
          <p className="text-xs text-zinc-500">
            🔒 {MONTH_NAMES[viewMonth.month]} de {viewMonth.year} está arquivado.
          </p>
          <button
            onClick={() => setShowUnarchiveMonth(true)}
            className="mt-1 rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-900 hover:text-amber-400"
          >
            desarquivar mês
          </button>
        </div>
      )}

      {monthFilterActive && !isMonthArchived && filteredSales.length > 0 && (
        <div className="text-center">
          <button
            onClick={() => {
              if (totals.owed > 0) {
                setArchiveBlockedMsg(
                  `Só dá pra arquivar quando o mês estiver totalmente quitado — ainda falta ${formatBRL(totals.owed)}.`
                );
                return;
              }
              setArchiveBlockedMsg(null);
              setShowArchiveMonth(true);
            }}
            title="Fechou o mês? Deixe o visual mais clean arquivando os meses que não precisa mais ver."
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-900 ${
              totals.owed > 0 ? "hover:text-zinc-300" : "hover:text-amber-400"
            }`}
          >
            {totals.owed > 0 && "🔒"} arquivar {MONTH_NAMES[viewMonth.month].toLowerCase()} inteiro
          </button>
          {archiveBlockedMsg && <p className="mt-1.5 text-xs text-amber-400">{archiveBlockedMsg}</p>}
        </div>
      )}

      {q && (
        <p className="text-center text-sm text-zinc-300">
          Somando só os resultados de <span className="font-semibold text-zinc-100">&quot;{search.trim()}&quot;</span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total vendido" value={formatBRL(totals.total)} />
        <SummaryCard label="Recebido" value={formatBRL(totals.paid)} tone="emerald" />
        <SummaryCard label="A receber" value={formatBRL(totals.owed)} tone="red" />
        <SummaryCard label="Lucro" value={formatBRL(totals.profit)} tone="emerald" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente..."
          className="input max-w-xs"
        />
        <button
          onClick={() => {
            setOnlyOwed((v) => !v);
            setDebtAgeFilter(0);
          }}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            onlyOwed
              ? "bg-red-950 text-red-400"
              : "bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          }`}
        >
          Só quem deve
        </button>
      </div>

      {onlyOwed && (
        <div className="flex flex-wrap gap-2">
          {[0, 30, 60, 90].map((days) => (
            <button
              key={days}
              onClick={() => setDebtAgeFilter(days)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                debtAgeFilter === days
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              }`}
            >
              {days === 0 ? "Todos" : `+${days} dias`}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="py-6 text-center text-sm text-zinc-500">Carregando...</p>
      ) : subscriptionBlockedStatus ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-red-900 bg-red-950/20 py-8 text-center">
          <p className="max-w-xs text-sm text-red-400">{subscriptionBlockedMessage(subscriptionBlockedStatus)}</p>
          <button
            onClick={() => router.push("/assinatura")}
            className="rounded-md bg-[#3a2268] px-4 py-1.5 text-sm font-medium text-white transition hover:bg-[#6139ae]"
          >
            Ver assinatura
          </button>
        </div>
      ) : filteredSales.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">
          {isMonthArchived
            ? "As vendas desse mês estão arquivadas."
            : sales.length === 0
              ? "Nenhuma venda lançada ainda."
              : onlyOwed
                ? "Ninguém deve nada no momento."
                : search
                  ? "Nenhuma venda encontrada para essa busca."
                  : "Nenhuma venda nesse mês."}
        </p>
      ) : (
        <>
          {/* Cartões — telas pequenas */}
          <div className="space-y-3 md:hidden">
            {visibleSales.map((s) => (
              <div
                key={s.id}
                onClick={() => router.push(`/venda/${s.id}`)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 active:bg-zinc-800/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-amber-400">{s.customerName}</p>
                    <p className="text-xs text-zinc-500">
                      {formatDate(s.saleDate)} · {s.productName} · {s.quantity}x
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-zinc-100">{formatBRL(s.total)}</p>
                    {s.adjustment !== 0 && (
                      <p className="text-[11px] text-zinc-500">
                        ajuste: {s.adjustment > 0 ? "+" : ""}
                        {formatBRL(s.adjustment)}
                      </p>
                    )}
                  </div>
                </div>
                {s.notes && <p className="mt-1.5 text-xs italic text-zinc-500">{s.notes}</p>}
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-[11px] text-zinc-500">Pagou</p>
                    <p className="text-emerald-400">{formatBRL(s.paid)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-500">Deve</p>
                    <p className="font-medium text-red-400">{s.owed > 0 ? formatBRL(s.owed) : "-"}</p>
                    {s.owed > 0 && daysSince(s.saleDate) > 0 && (
                      <p className="text-[10px] text-zinc-500">há {daysSince(s.saleDate)}d</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-500">Lucro</p>
                    <p className="text-zinc-200">{formatBRL(s.profit)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tabela — telas médias pra cima */}
          <div className="hidden overflow-x-auto rounded-lg border border-zinc-800 md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Produto</th>
                  <th className="px-3 py-2 text-right">Qtd</th>
                  <th className="px-3 py-2 text-right">Custo</th>
                  <th className="px-3 py-2 text-right">Venda</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Pagou</th>
                  <th className="px-3 py-2 text-right">Deve</th>
                  <th className="px-3 py-2 text-right">Lucro</th>
                  <th className="px-3 py-2">Cliente</th>
                </tr>
              </thead>
              <tbody>
                {visibleSales.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => router.push(`/venda/${s.id}`)}
                    className="cursor-pointer border-b border-zinc-900 last:border-0 hover:bg-zinc-900/50"
                  >
                    <td className="px-3 py-2 text-zinc-400">{formatDate(s.saleDate)}</td>
                    <td className="px-3 py-2 font-medium text-zinc-200">
                      {s.productName}
                      {s.notes && (
                        <span className="ml-1.5 text-zinc-500" title={s.notes}>
                          📝
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-300">{s.quantity}</td>
                    <td className="px-3 py-2 text-right text-zinc-400">{formatBRL(s.unitBuyPrice)}</td>
                    <td className="px-3 py-2 text-right text-zinc-400">{formatBRL(s.unitSellPrice)}</td>
                    <td className="px-3 py-2 text-right text-zinc-200">
                      {s.adjustment !== 0 && (
                        <span
                          className="mr-1 text-xs text-zinc-500"
                          title={`Ajuste de ${formatBRL(s.adjustment)} incluído no total`}
                        >
                          ({s.adjustment > 0 ? "+" : ""}
                          {formatBRL(s.adjustment)})
                        </span>
                      )}
                      {formatBRL(s.total)}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-400">{formatBRL(s.paid)}</td>
                    <td className="px-3 py-2 text-right font-medium text-red-400">
                      {s.owed > 0 && daysSince(s.saleDate) > 0 && (
                        <span className="mr-1 text-xs font-normal text-zinc-500">(há {daysSince(s.saleDate)}d)</span>
                      )}
                      {s.owed > 0 ? formatBRL(s.owed) : "-"}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-200">{formatBRL(s.profit)}</td>
                    <td className="px-3 py-2 text-amber-400">{s.customerName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!showAllSales && filteredSales.length > visibleSales.length && (
            <button
              onClick={() => setShowAllSales(true)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
            >
              Ver mais ({filteredSales.length - visibleSales.length} restantes)
            </button>
          )}
        </>
      )}

      {showNewSale && (
        <NewSaleModal
          products={products.filter((p) => p.active)}
          customers={customers.filter((c) => c.active)}
          customerUsage={customerUsage}
          onCustomerCreated={(c) => setCustomers((prev) => [...prev, c])}
          onClose={() => setShowNewSale(false)}
          onSaved={() => {
            setShowNewSale(false);
            setViewMonth(currentYearMonth());
            load();
          }}
        />
      )}

      {showArchiveMonth && (
        <ArchiveMonthModal
          monthLabel={`${MONTH_NAMES[viewMonth.month]} de ${viewMonth.year}`}
          count={filteredSales.length}
          total={totals.total}
          year={viewMonth.year}
          month={viewMonth.month + 1}
          onClose={() => setShowArchiveMonth(false)}
          onArchived={() => {
            setShowArchiveMonth(false);
            load();
          }}
        />
      )}

      {showUnarchiveMonth && (
        <UnarchiveMonthModal
          monthLabel={`${MONTH_NAMES[viewMonth.month]} de ${viewMonth.year}`}
          year={viewMonth.year}
          month={viewMonth.month + 1}
          onClose={() => setShowUnarchiveMonth(false)}
          onUnarchived={() => {
            setShowUnarchiveMonth(false);
            load();
          }}
        />
      )}
      {/* Botão flutuante — só no web-app instalado, igual ao FAB do mobile.
          No navegador normal, "+ Nova venda" no topo já cumpre esse papel. */}
      {isStandalone && (
        <button
          onClick={() => setShowNewSale(true)}
          aria-label="Nova venda"
          className="fixed right-4 z-30 flex h-[54px] w-[54px] items-center justify-center rounded-full bg-[#3a2268] text-white shadow-lg shadow-black/40 transition hover:bg-[#6139ae]"
          style={{ bottom: "calc(64px + env(safe-area-inset-bottom) + 16px)" }}
        >
          <svg viewBox="0 0 24 24" className="h-[26px] w-[26px]" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
      )}
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

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Trava o scroll do body enquanto o modal está aberto — sem isso, no PWA
  // instalado (sem barra de endereço pra absorver o gesto), um scroll
  // dentro do modal que "estoura" o topo/fim vira puxar-pra-atualizar da
  // página por trás, recarregando tudo e fechando o modal sem querer.
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex touch-none items-center justify-center overscroll-contain bg-black/60 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+1.5rem)]"
    >
      <div className="flex max-h-full w-full max-w-md touch-pan-y flex-col overflow-x-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 p-5 pb-4">
          <h2 className="text-base font-bold text-zinc-100">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="-m-2 shrink-0 rounded-full p-2 text-xl leading-none text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
          >
            ✕
          </button>
        </div>
        <div className="overflow-x-hidden overflow-y-auto overscroll-contain p-5 pt-4">{children}</div>
      </div>
    </div>
  );
}

function ArchiveMonthModal({
  monthLabel,
  count,
  total,
  year,
  month,
  onClose,
  onArchived,
}: {
  monthLabel: string;
  count: number;
  total: number;
  year: number;
  month: number;
  onClose: () => void;
  onArchived: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  async function handleArchive() {
    setArchiving(true);
    setError(null);
    const res = await fetch(`/api/sales?year=${year}&month=${month}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    setArchiving(false);
    if (!res.ok) {
      setError(data?.error || "Erro ao arquivar.");
      return;
    }
    onArchived();
  }

  return (
    <ModalShell title={`Arquivar ${monthLabel}?`} onClose={onClose}>
      <p className="text-sm text-zinc-300">
        <strong>{count}</strong> {count === 1 ? "venda" : "vendas"} desse mês (totalizando{" "}
        <strong>{formatBRL(total)}</strong>) vão sair da lista de Vendas do dia a dia.
      </p>
      <p className="mt-2 text-sm text-zinc-400">
        Continuam contando nos Relatórios normalmente — nada é apagado de verdade.
      </p>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <div className="mt-5 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
        >
          Cancelar
        </button>
        <button
          onClick={handleArchive}
          disabled={archiving}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-60"
        >
          {archiving ? "Arquivando..." : "Arquivar mês"}
        </button>
      </div>
    </ModalShell>
  );
}

function UnarchiveMonthModal({
  monthLabel,
  year,
  month,
  onClose,
  onUnarchived,
}: {
  monthLabel: string;
  year: number;
  month: number;
  onClose: () => void;
  onUnarchived: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleUnarchive() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/sales", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, password }),
    });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(data?.error || "Erro ao desarquivar.");
      return;
    }
    onUnarchived();
  }

  return (
    <ModalShell title={`Desarquivar ${monthLabel}?`} onClose={onClose}>
      <p className="text-sm text-zinc-400">
        As vendas desse mês voltam a aparecer na lista do dia a dia. Confirme com sua senha de login.
      </p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && password && handleUnarchive()}
        placeholder="Sua senha"
        autoFocus
        className="input mt-3 w-full"
      />
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <div className="mt-5 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
        >
          Cancelar
        </button>
        <button
          onClick={handleUnarchive}
          disabled={loading || !password}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-60"
        >
          {loading ? "Desarquivando..." : "Desarquivar"}
        </button>
      </div>
    </ModalShell>
  );
}

function NewSaleModal({
  products,
  customers,
  customerUsage,
  onCustomerCreated,
  onClose,
  onSaved,
}: {
  products: Product[];
  customers: Customer[];
  customerUsage: Map<number, number>;
  onCustomerCreated: (c: Customer) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [saleDate, setSaleDate] = useState(todayISO());
  const [productId, setProductId] = useState<number | "">(products[0]?.id ?? "");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [buyPrice, setBuyPrice] = useState(String(products[0]?.defaultBuyPrice ?? ""));
  const [sellPrice, setSellPrice] = useState(String(products[0]?.defaultSellPrice ?? ""));
  const [initialPayment, setInitialPayment] = useState("");
  const [adjustment, setAdjustment] = useState("");
  const [adjustmentNegative, setAdjustmentNegative] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleProductChange(id: number) {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (p) {
      setBuyPrice(String(p.defaultBuyPrice));
      setSellPrice(String(p.defaultSellPrice));
    }
  }

  // Prévia ao vivo (igual ao mobile) — dá pra ver o resultado antes de
  // salvar, em vez de só descobrir depois de confirmar.
  const qtyPreview = parseNumber(quantity) || 0;
  const sellPreview = parseNumber(sellPrice) || 0;
  const buyPreview = parseNumber(buyPrice) || 0;
  const adjAbsPreview = adjustment ? parseNumber(adjustment) || 0 : 0;
  const adjPreview = adjustmentNegative ? -adjAbsPreview : adjAbsPreview;
  const totalPreview = qtyPreview * sellPreview + adjPreview;
  const profitPreview = totalPreview - qtyPreview * buyPreview;
  const paidPreview = initialPayment ? parseNumber(initialPayment) || 0 : 0;
  const owedPreview = totalPreview - paidPreview;

  // Se o modal abrir antes da lista de produtos terminar de carregar (ex:
  // clique rápido logo após um refresh), productId/preços ficam vazios pois
  // só são inicializados uma vez, no mount. Assim que a lista chegar, se o
  // produto selecionado ainda não é válido, seleciona o primeiro de verdade
  // e preenche os preços — em vez de deixar o campo vazio escondido atrás do
  // <select> mostrando visualmente a primeira opção sem valor nenhum salvo.
  useEffect(() => {
    if (products.length === 0) return;
    if (products.some((p) => p.id === productId)) return;
    const first = products[0];
    setProductId(first.id);
    setBuyPrice(String(first.defaultBuyPrice));
    setSellPrice(String(first.defaultSellPrice));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const qty = parseNumber(quantity);
    const qp = parseNumber(buyPrice);
    const qv = parseNumber(sellPrice);
    const payment = initialPayment ? parseNumber(initialPayment) : 0;
    const adjAbs = adjustment ? parseNumber(adjustment) : 0;
    const adj = adjustmentNegative ? -adjAbs : adjAbs;
    if (!customer) {
      setError('Selecione o cliente na lista (ou clique em "+ Criar cliente") antes de salvar.');
      return;
    }
    if (!productId || !qty || Number.isNaN(qp) || Number.isNaN(qv) || Number.isNaN(adj)) {
      setError("Preencha todos os campos corretamente.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saleDate,
        productId,
        customerId: customer.id,
        quantity: qty,
        unitBuyPrice: qp,
        unitSellPrice: qv,
        adjustment: adj,
        initialPayment: payment,
        notes: notes.trim() || undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Erro ao salvar.");
      return;
    }
    onSaved();
  }

  if (products.length === 0) {
    return (
      <ModalShell title="Nova venda" onClose={onClose}>
        <div className="text-center">
          <p className="font-semibold text-zinc-100">Nenhum produto cadastrado</p>
          <p className="mt-1 text-sm text-zinc-400">Antes de lançar uma venda, cadastre pelo menos um produto.</p>
          <button
            onClick={() => router.push("/produtos")}
            className="mt-4 w-full rounded-lg bg-zinc-800 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
          >
            Cadastrar produto
          </button>
        </div>
      </ModalShell>
    );
  }

  const formBody = (
      <form onSubmit={handleSubmit} className="space-y-3">
        <ProductPicker products={products} value={productId || null} onChange={handleProductChange} />
        <CustomerPicker
          customers={customers}
          value={customer}
          onChange={setCustomer}
          onCustomerCreated={onCustomerCreated}
          usage={customerUsage}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">
            <DateField value={saleDate} onChange={setSaleDate} />
          </Field>
          <Field label="Quantidade" labelClassName="pl-[3%]">
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} className="input" inputMode="decimal" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preço de venda">
            <input value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} className="input" inputMode="decimal" />
          </Field>
          <Field label="Preço de custo">
            <input value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} className="input" inputMode="decimal" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={
              <>
                Ajuste no total (opcional)
                <InfoTip text={ADJUSTMENT_HINT} />
              </>
            }
          >
            <div className="flex gap-2">
              <input
                value={adjustment}
                onChange={(e) => setAdjustment(e.target.value.replace(/-/g, ""))}
                className="input flex-1"
                placeholder="0,00"
                inputMode="decimal"
              />
              <AdjustmentSignToggle negative={adjustmentNegative} onToggle={() => setAdjustmentNegative((v) => !v)} />
            </div>
          </Field>
          <Field label="Pagou agora (em branco se for tudo fiado)">
            <input
              value={initialPayment}
              onChange={(e) => setInitialPayment(e.target.value)}
              className="input"
              placeholder="0,00"
              inputMode="decimal"
            />
          </Field>
        </div>
        <Field label="Observação (opcional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input min-h-16 resize-y"
            placeholder="Alguma anotação sobre essa venda..."
          />
        </Field>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Total</span>
            <span className="font-semibold text-zinc-100">{formatBRL(totalPreview)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-zinc-500">Lucro</span>
            <span className={`font-semibold ${profitPreview >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatBRL(profitPreview)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-zinc-500">{owedPreview > 0.001 ? "Fica devendo" : "Situação"}</span>
            <span className={`font-semibold ${owedPreview > 0.001 ? "text-red-400" : "text-emerald-400"}`}>
              {owedPreview > 0.001 ? formatBRL(owedPreview) : "Quitado"}
            </span>
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-[#3a2268] py-2 text-sm font-medium text-white transition hover:bg-[#6139ae] disabled:opacity-60"
        >
          {saving ? "Salvando..." : "Salvar venda"}
        </button>
      </form>
  );

  return <ModalShell title="Nova venda" onClose={onClose}>{formBody}</ModalShell>;
}

// Busca + chips, igual ao seletor de produto do mobile — mais rápido de
// tocar do que abrir um <select> nativo, principalmente no web-app.
export function ProductPicker({
  products,
  value,
  onChange,
}: {
  products: Product[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const visible = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-zinc-400">Produto</span>
      <div className="relative mb-2">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-8"
          placeholder="Buscar produto"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {visible.length === 0 && <p className="text-xs text-zinc-500">Nenhum produto encontrado.</p>}
        {visible.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            style={value === p.id ? { borderColor: "#3a2268", backgroundColor: "#3a2268" } : undefined}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
              value === p.id ? "text-white" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CustomerPicker({
  customers,
  value,
  onChange,
  onCustomerCreated,
  usage,
}: {
  customers: Customer[];
  value: Customer | null;
  onChange: (c: Customer | null) => void;
  onCustomerCreated: (c: Customer) => void;
  usage: Map<number, number>;
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();

  // Sem busca, mostra só os clientes mais usados (senão a lista vira uma
  // parede de chips pra quem tem muito cliente cadastrado) — igual ao
  // mobile. Digitar qualquer letra já busca em todos.
  const topCustomers = useMemo(() => {
    const ranked = [...customers].sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0));
    const top = ranked.slice(0, 5);
    if (value && !top.some((c) => c.id === value.id)) {
      const selected = customers.find((c) => c.id === value.id);
      if (selected) top.splice(top.length - 1, 1, selected);
    }
    return top;
  }, [customers, usage, value]);

  const visible = q ? customers.filter((c) => c.name.toLowerCase().includes(q)) : topCustomers;

  async function handleCreate() {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => null);
    setCreating(false);
    if (!res.ok) {
      setCreateError(data?.error || "Erro ao criar cliente.");
      return;
    }
    const newCustomer: Customer = { id: data.id, name, phone: null, active: true };
    onCustomerCreated(newCustomer);
    onChange(newCustomer);
    setQuery("");
  }

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-zinc-400">Cliente</span>
      <div className="relative mb-1">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCreateError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q && visible.length === 0) {
              e.preventDefault();
              handleCreate();
            }
          }}
          className="input pl-8"
          placeholder="Buscar cliente"
        />
      </div>
      {!q && customers.length > topCustomers.length && (
        <p className="mb-1 text-[11px] text-zinc-500">Mais usados — digite pra ver todos</p>
      )}
      <div className="flex flex-wrap gap-2">
        {visible.length === 0 && !q && <p className="text-xs text-zinc-500">Nenhum cliente cadastrado.</p>}
        {visible.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c)}
            style={value?.id === c.id ? { borderColor: "#3a2268", backgroundColor: "#3a2268" } : undefined}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
              value?.id === c.id ? "text-white" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
      {q && visible.length === 0 && (
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="mt-2 text-sm font-medium text-[#a483d9] transition hover:text-[#c2aaf0] disabled:opacity-60"
        >
          {creating ? "Criando..." : `+ Criar cliente "${query.trim()}"`}
        </button>
      )}
      {createError && <p className="mt-1 text-xs text-red-400">{createError}</p>}
    </div>
  );
}

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

// Calendário próprio, sem depender do <input type="date"> nativo — no PWA
// instalado o picker nativo do Android/Chrome abre num azul do sistema que
// não tem nada a ver com o resto do app (é um componente de sistema, não dá
// pra estilizar via CSS). Mesma abordagem do DateField do mobile.
export function DateField({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = isoToLocalDate(value);
  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function openPicker() {
    const d = isoToLocalDate(value);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setOpen(true);
  }

  function changeMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  function pick(day: number) {
    onChange(dateToLocalIso(new Date(viewYear, viewMonth, day)));
    setOpen(false);
  }

  const weeks = getMonthMatrix(viewYear, viewMonth);
  const today = new Date();

  return (
    <>
      <button type="button" onClick={openPicker} className="input text-left">
        {formatDisplayDate(selected)}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[60] flex touch-none items-center justify-center overscroll-contain bg-black/60 px-4"
          onClick={() => setOpen(false)}
          onTouchEnd={(e) => {
            // touch-action: none no fundo trava o gesto de arrastar/puxar por
            // trás, mas por spec também suprime o "click" sintetizado que o
            // navegador geraria depois de um toque — sem isso aqui, tocar
            // fora do calendário num celular de verdade não fecha nada.
            e.preventDefault();
            setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-[280px] touch-auto rounded-xl border border-zinc-800 bg-zinc-900 p-4"
            onClick={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar"
              className="absolute -right-3 -top-8 flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-sm leading-none text-zinc-300 transition hover:bg-zinc-700 hover:text-zinc-100"
            >
              ✕
            </button>
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                aria-label="Mês anterior"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 transition hover:bg-zinc-800"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="text-sm font-bold text-zinc-100">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </span>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                aria-label="Próximo mês"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 transition hover:bg-zinc-800"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-7">
              {WEEKDAYS.map((w, i) => (
                <span key={i} className="py-1 text-center text-xs font-semibold text-zinc-500">
                  {w}
                </span>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7">
                {week.map((day, di) => {
                  if (day == null) return <div key={di} className="aspect-square" />;
                  const isSelected =
                    day === selected.getDate() && viewMonth === selected.getMonth() && viewYear === selected.getFullYear();
                  const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
                  return (
                    <button
                      key={di}
                      type="button"
                      onClick={() => pick(day)}
                      style={isSelected ? { backgroundColor: "#3a2268" } : undefined}
                      className={`aspect-square rounded-md text-sm transition ${
                        isSelected
                          ? "font-bold text-white"
                          : isToday
                            ? "font-bold text-[#a483d9] hover:bg-zinc-800"
                            : "text-zinc-200 hover:bg-zinc-800"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                onChange(dateToLocalIso(new Date()));
                setOpen(false);
              }}
              className="mt-2 w-full rounded-md border-t border-zinc-800 pt-2 text-center text-sm font-medium text-[#a483d9] transition hover:text-[#c2aaf0]"
            >
              Hoje
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function getMonthMatrix(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function isoToLocalDate(iso: string): Date {
  const [y, m, d] = (iso || "").slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

function dateToLocalIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDisplayDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function Field({
  label,
  children,
  labelClassName,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  labelClassName?: string;
}) {
  return (
    <label className="block">
      <span className={`mb-1 flex items-center gap-1 text-xs font-medium text-zinc-400 ${labelClassName ?? ""}`}>
        {label}
      </span>
      {children}
    </label>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full border border-zinc-600 text-[9px] font-bold text-zinc-500"
    >
      i
    </span>
  );
}
