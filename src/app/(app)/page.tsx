"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Product = {
  id: number;
  name: string;
  defaultBuyPrice: number;
  defaultSellPrice: number;
  active: boolean;
};

type Customer = {
  id: number;
  name: string;
  phone: string | null;
  active: boolean;
};

type Sale = {
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

type PaymentEntry = { id: number; amount: number; paidAt: string; notes: string | null };

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string) {
  const [, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}`;
}

// Deixa o campo inteiro clicável pra abrir o calendário, não só o ícone
// (que é minúsculo e quase invisível no fundo escuro). showPicker() pode não
// existir em todo navegador e pode reclamar fora de um gesto real do
// usuário — por isso o try/catch, silencioso, sem quebrar o campo.
function openDatePicker(e: React.MouseEvent<HTMLInputElement>) {
  try {
    e.currentTarget.showPicker?.();
  } catch {
    // sem suporte ou fora de um gesto do usuário — o clique no ícone continua funcionando normalmente
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

const ADJUSTMENT_HINT =
  "Use quando o cliente já te devia algum valor atrasado de antes e você quer somar essa dívida ao total dessa venda. Toque no +/− ao lado do campo pra escolher entre somar ou descontar.";

function AdjustmentSignToggle({ negative, onToggle }: { negative: boolean; onToggle: () => void }) {
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
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewSale, setShowNewSale] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [onlyOwed, setOnlyOwed] = useState(false);
  const [debtAgeFilter, setDebtAgeFilter] = useState(0);
  const [viewMonth, setViewMonth] = useState(currentYearMonth);
  const [showArchiveMonth, setShowArchiveMonth] = useState(false);
  const [showUnarchiveMonth, setShowUnarchiveMonth] = useState(false);
  const [archiveBlockedMsg, setArchiveBlockedMsg] = useState<string | null>(null);
  const [allSales, setAllSales] = useState<Sale[]>([]);

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
    const salesData = await salesRes.json();
    const allSalesData = await allSalesRes.json();
    const productsData = await productsRes.json();
    const customersData = await customersRes.json();
    setSales(salesData.sales || []);
    setAllSales(allSalesData.sales || []);
    setProducts(productsData.products || []);
    setCustomers(customersData.customers || []);
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

  // Um mês só é arquivado por inteiro (a rota de arquivar pega todas as
  // vendas do mês de uma vez) — então "sem vendas ativas mas com vendas no
  // includeArchived=1" significa "esse mês está arquivado", não "vazio".
  const isMonthArchived = useMemo(() => {
    if (!monthFilterActive) return false;
    return !sales.some((s) => inMonth(s, viewMonth.year, viewMonth.month)) && allSales.some((s) => inMonth(s, viewMonth.year, viewMonth.month));
  }, [sales, allSales, monthFilterActive, viewMonth]);

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
        <button
          onClick={() => setShowNewSale(true)}
          className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500"
        >
          + Nova venda
        </button>
      </div>

      <div className={`flex items-center justify-center gap-3 ${monthFilterActive ? "" : "opacity-40"}`}>
        <button
          onClick={() => goToMonth(-1)}
          disabled={!monthFilterActive}
          aria-label="Mês anterior"
          className="rounded-md px-2 py-1 text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200 disabled:pointer-events-none"
        >
          ◀
        </button>
        <span className="w-36 text-center text-sm font-medium text-zinc-200">
          {monthFilterActive ? `${MONTH_NAMES[viewMonth.month]} ${viewMonth.year}` : "Todas as datas"}
        </span>
        <button
          onClick={() => goToMonth(1)}
          disabled={!monthFilterActive || isCurrentMonth}
          aria-label="Próximo mês"
          className="rounded-md px-2 py-1 text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-30"
        >
          ▶
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
            {filteredSales.map((s) => (
              <div
                key={s.id}
                onClick={() => setSelectedSaleId(s.id)}
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
                {filteredSales.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedSaleId(s.id)}
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
        </>
      )}

      {showNewSale && (
        <NewSaleModal
          products={products.filter((p) => p.active)}
          customers={customers.filter((c) => c.active)}
          onCustomerCreated={(c) => setCustomers((prev) => [...prev, c])}
          onClose={() => setShowNewSale(false)}
          onSaved={() => {
            setShowNewSale(false);
            setViewMonth(currentYearMonth());
            load();
          }}
        />
      )}

      {selectedSaleId !== null && (
        <SaleModal
          sale={sales.find((s) => s.id === selectedSaleId)!}
          products={products.filter((p) => p.active)}
          customers={customers.filter((c) => c.active)}
          onCustomerCreated={(c) => setCustomers((prev) => [...prev, c])}
          onClose={() => setSelectedSaleId(null)}
          onChanged={load}
          onDeleted={() => {
            setSelectedSaleId(null);
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
      className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/60 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+1.5rem)]"
    >
      <div className="flex max-h-full w-full max-w-md flex-col rounded-xl border border-zinc-800 bg-zinc-900">
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
        <div className="overflow-y-auto overscroll-contain p-5 pt-4">{children}</div>
      </div>
    </div>
  );
}

// Fundido a partir de 3 modais separados (detalhe somente-leitura, pagamentos
// e edição) que existiam antes — igual ao mobile, que já mostra tudo numa
// tela só. Mantém a confirmação de alterações antes de salvar (mesma lógica
// de diff do mobile), já que mexe direto em valor financeiro da venda.
function SaleModal({
  sale,
  products,
  customers,
  onCustomerCreated,
  onClose,
  onChanged,
  onDeleted,
}: {
  sale: Sale;
  products: Product[];
  customers: Customer[];
  onCustomerCreated: (c: Customer) => void;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [history, setHistory] = useState<PaymentEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayISO());
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(null);
  const [confirmDeletePaymentId, setConfirmDeletePaymentId] = useState<number | null>(null);

  const [saleDate, setSaleDate] = useState(sale.saleDate.slice(0, 10));
  const [productId, setProductId] = useState<number>(sale.productId);
  const [customer, setCustomer] = useState<Customer | null>(
    sale.customerId ? { id: sale.customerId, name: sale.customerName || "", phone: null, active: true } : null
  );
  const [quantity, setQuantity] = useState(String(sale.quantity));
  const [buyPrice, setBuyPrice] = useState(String(sale.unitBuyPrice));
  const [sellPrice, setSellPrice] = useState(String(sale.unitSellPrice));
  const [adjustment, setAdjustment] = useState(sale.adjustment ? String(Math.abs(sale.adjustment)) : "");
  const [adjustmentNegative, setAdjustmentNegative] = useState(sale.adjustment < 0);
  const [notes, setNotes] = useState(sale.notes || "");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<string[] | null>(null);

  const [confirmDeleteSale, setConfirmDeleteSale] = useState(false);
  const [deletingSale, setDeletingSale] = useState(false);

  async function loadHistory() {
    setLoadingHistory(true);
    const res = await fetch(`/api/sales/${sale.id}/payments`);
    const data = await res.json().catch(() => null);
    setHistory(data?.payments || []);
    setLoadingHistory(false);
  }

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale.id]);

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    setPaymentError(null);
    const value = Number(amount.replace(",", "."));
    if (!value || value <= 0) {
      setPaymentError("Informe um valor válido.");
      return;
    }
    setSavingPayment(true);
    const res = await fetch(`/api/sales/${sale.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: value, paidAt, notes: paymentNotes.trim() || undefined }),
    });
    const data = await res.json();
    setSavingPayment(false);
    if (!res.ok) {
      setPaymentError(data.error || "Erro ao salvar.");
      return;
    }
    setAmount("");
    setPaymentNotes("");
    await loadHistory();
    onChanged();
  }

  async function handleDeletePayment(id: number) {
    setDeletingPaymentId(id);
    await fetch(`/api/payments/${id}`, { method: "DELETE" });
    setDeletingPaymentId(null);
    setConfirmDeletePaymentId(null);
    await loadHistory();
    onChanged();
  }

  // Produto/cliente podem ter sido desativados desde a venda — garante que
  // continuem aparecendo como opção pra não perder a referência ao editar
  // outra coisa.
  const productOptions = products.some((p) => p.id === sale.productId)
    ? products
    : [{ id: sale.productId, name: sale.productName, defaultBuyPrice: 0, defaultSellPrice: 0, active: false }, ...products];

  const customerOptions =
    sale.customerId && !customers.some((c) => c.id === sale.customerId)
      ? [{ id: sale.customerId, name: sale.customerName || "", phone: null, active: false }, ...customers]
      : customers;

  const qty = Number(quantity.replace(",", ".")) || 0;
  const subtotal = qty * (Number(sellPrice.replace(",", ".")) || 0);
  const adjAbs = adjustment ? Number(adjustment.replace(",", ".")) || 0 : 0;
  const adjustmentValue = adjustmentNegative ? -adjAbs : adjAbs;

  async function doSaveEdit() {
    setSavingEdit(true);
    const res = await fetch(`/api/sales/${sale.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saleDate,
        productId,
        customerId: customer?.id,
        quantity: qty,
        unitBuyPrice: Number(buyPrice.replace(",", ".")),
        unitSellPrice: Number(sellPrice.replace(",", ".")),
        adjustment: adjustmentValue,
        notes: notes.trim() || null,
      }),
    });
    const data = await res.json().catch(() => null);
    setSavingEdit(false);
    setPendingChanges(null);
    if (!res.ok) {
      setEditError(data?.error || "Erro ao salvar.");
      return;
    }
    onChanged();
    onClose();
  }

  // Mostra só o que realmente mudou antes de gravar — evita salvar uma
  // edição sem querer, já que mexe direto no valor financeiro da venda
  // (mesma lógica de diff do mobile).
  function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);
    const qp = Number(buyPrice.replace(",", "."));
    const qv = Number(sellPrice.replace(",", "."));
    if (!customer) {
      setEditError('Selecione o cliente na lista (ou clique em "+ Criar cliente") antes de salvar.');
      return;
    }
    if (!productId || !qty || Number.isNaN(qp) || Number.isNaN(qv) || Number.isNaN(adjustmentValue)) {
      setEditError("Preencha todos os campos corretamente.");
      return;
    }

    const changes: string[] = [];
    if (saleDate !== sale.saleDate.slice(0, 10)) {
      changes.push(`Data: ${formatDate(sale.saleDate)} → ${formatDate(saleDate)}`);
    }
    if (productId !== sale.productId) {
      const newName = productOptions.find((p) => p.id === productId)?.name || "?";
      changes.push(`Produto: ${sale.productName} → ${newName}`);
    }
    if (customer.id !== sale.customerId) {
      changes.push(`Cliente: ${sale.customerName || "sem cliente"} → ${customer.name}`);
    }
    if (qty !== sale.quantity) {
      changes.push(`Quantidade: ${sale.quantity} → ${qty}`);
    }
    if (qv !== sale.unitSellPrice) {
      changes.push(`Preço de venda: ${formatBRL(sale.unitSellPrice)} → ${formatBRL(qv)}`);
    }
    if (qp !== sale.unitBuyPrice) {
      changes.push(`Preço de custo: ${formatBRL(sale.unitBuyPrice)} → ${formatBRL(qp)}`);
    }
    if (adjustmentValue !== (sale.adjustment || 0)) {
      const from = sale.adjustment ? `${sale.adjustment > 0 ? "+" : "−"}${formatBRL(Math.abs(sale.adjustment))}` : "sem ajuste";
      const to = adjustmentValue ? `${adjustmentValue > 0 ? "+" : "−"}${formatBRL(Math.abs(adjustmentValue))}` : "sem ajuste";
      changes.push(`Ajuste no total: ${from} → ${to}`);
    }
    if ((notes || "") !== (sale.notes || "")) {
      changes.push("Observações alteradas");
    }

    if (changes.length === 0) {
      onClose();
      return;
    }
    setPendingChanges(changes);
  }

  async function handleDeleteSale() {
    setDeletingSale(true);
    await fetch(`/api/sales/${sale.id}`, { method: "DELETE" });
    onDeleted();
  }

  return (
    <ModalShell title={`Venda — ${sale.customerName || "Sem cliente"}`} onClose={onClose}>
      <div className="mb-3 grid grid-cols-4 gap-2 text-sm">
        <div>
          <p className="text-[11px] text-zinc-500">Total</p>
          <p className="text-zinc-200">{formatBRL(sale.total)}</p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Pagou</p>
          <p className="text-emerald-400">{formatBRL(sale.paid)}</p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Deve</p>
          <p className="font-medium text-red-400">{sale.owed > 0 ? formatBRL(sale.owed) : "-"}</p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Lucro</p>
          <p className="text-zinc-200">{formatBRL(sale.profit)}</p>
        </div>
      </div>

      <div className="mb-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Pagamentos</h3>
        {loadingHistory ? (
          <p className="text-sm text-zinc-500">Carregando...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum pagamento registrado ainda.</p>
        ) : (
          <ul className="max-h-40 space-y-1.5 overflow-y-auto">
            {history.map((h) => (
              <li key={h.id} className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">{formatDate(h.paidAt)}</span>
                  <span className="text-emerald-400">{formatBRL(h.amount)}</span>
                  {confirmDeletePaymentId === h.id ? (
                    <span className="flex items-center gap-1.5">
                      <span className="text-xs text-zinc-500">Remover?</span>
                      <button
                        onClick={() => handleDeletePayment(h.id)}
                        disabled={deletingPaymentId === h.id}
                        className="text-xs font-medium text-zinc-400 hover:text-emerald-400 disabled:opacity-60"
                      >
                        {deletingPaymentId === h.id ? "..." : "sim"}
                      </button>
                      <button
                        onClick={() => setConfirmDeletePaymentId(null)}
                        className="ml-2 text-xs font-medium text-zinc-500 hover:text-red-400"
                      >
                        não
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDeletePaymentId(h.id)}
                      className="text-xs font-medium text-zinc-500 hover:text-red-400"
                    >
                      remover
                    </button>
                  )}
                </div>
                {h.notes && <p className="mt-1 text-xs italic text-zinc-500">{h.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {sale.owed > 0 ? (
        <form onSubmit={handleAddPayment} className="space-y-3 border-t border-zinc-800 pt-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Valor pago">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input"
                inputMode="decimal"
                placeholder="0"
              />
            </Field>
            <Field label="Data">
              <input
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                onClick={openDatePicker}
                className="input"
              />
            </Field>
          </div>
          <Field label="Observação (opcional)">
            <input value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} className="input" />
          </Field>
          {paymentError && <p className="text-sm text-red-400">{paymentError}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setAmount(String(Math.round(sale.owed * 100) / 100))}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
            >
              Quitar tudo
            </button>
            <button
              type="submit"
              disabled={savingPayment}
              className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {savingPayment ? "Salvando..." : "Registrar pagamento"}
            </button>
          </div>
        </form>
      ) : (
        <p className="border-t border-zinc-800 pt-3 text-sm text-emerald-400">Pago integralmente.</p>
      )}

      <div className="my-4 border-t border-zinc-800" />

      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Detalhes da venda</h3>
      <form onSubmit={handleSaveEdit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Data">
            <input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              onClick={openDatePicker}
              className="input"
            />
          </Field>
          <Field label="Produto">
            <select value={productId} onChange={(e) => setProductId(Number(e.target.value))} className="input">
              {productOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <CustomerPicker
          customers={customerOptions}
          value={customer}
          onChange={setCustomer}
          onCustomerCreated={onCustomerCreated}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Quantidade">
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} className="input" inputMode="decimal" />
          </Field>
          <Field label="Preço de custo">
            <input value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} className="input" inputMode="decimal" />
          </Field>
          <Field label="Preço de venda">
            <input value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} className="input" inputMode="decimal" />
          </Field>
        </div>
        <p className="flex items-center justify-between text-xs text-zinc-500">
          <span>Subtotal (qtd × venda)</span>
          <span className="font-medium text-zinc-300">{formatBRL(subtotal)}</span>
        </p>
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
        <Field label="Observação (opcional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input min-h-16 resize-y"
            placeholder="Alguma anotação sobre essa venda..."
          />
        </Field>
        {editError && <p className="text-sm text-red-400">{editError}</p>}

        {pendingChanges ? (
          <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-3">
            <p className="mb-2 text-xs font-medium text-amber-400">Confirmar alterações:</p>
            <ul className="mb-3 space-y-1 text-xs text-zinc-300">
              {pendingChanges.map((c, i) => (
                <li key={i}>• {c}</li>
              ))}
            </ul>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingChanges(null)}
                className="flex-1 rounded-lg border border-zinc-700 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={doSaveEdit}
                disabled={savingEdit}
                className="flex-1 rounded-lg bg-amber-600 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-60"
              >
                {savingEdit ? "Salvando..." : "Confirmar e salvar"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
          >
            Salvar alterações
          </button>
        )}
      </form>

      <div className="my-4 border-t border-zinc-800" />

      {confirmDeleteSale ? (
        <div className="space-y-2">
          <p className="text-center text-sm text-zinc-400">Excluir essa venda? Não pode ser desfeito.</p>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmDeleteSale(false)}
              className="flex-1 rounded-lg border border-zinc-700 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              onClick={handleDeleteSale}
              disabled={deletingSale}
              className="flex-1 rounded-lg border border-red-800 py-2 text-sm font-medium text-red-400 transition hover:bg-red-950/40 disabled:opacity-60"
            >
              {deletingSale ? "Excluindo..." : "Confirmar exclusão"}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirmDeleteSale(true)}
          className="w-full rounded-lg border border-red-900 py-2 text-sm font-medium text-red-400 transition hover:bg-red-950/30"
        >
          Excluir venda
        </button>
      )}
    </ModalShell>
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
  onCustomerCreated,
  onClose,
  onSaved,
}: {
  products: Product[];
  customers: Customer[];
  onCustomerCreated: (c: Customer) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
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
    const qty = Number(quantity.replace(",", "."));
    const qp = Number(buyPrice.replace(",", "."));
    const qv = Number(sellPrice.replace(",", "."));
    const payment = initialPayment ? Number(initialPayment.replace(",", ".")) : 0;
    const adjAbs = adjustment ? Number(adjustment.replace(",", ".")) : 0;
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
        <p className="text-sm text-zinc-400">
          Cadastre um produto na aba <strong>Produtos</strong> antes de lançar uma venda.
        </p>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Nova venda" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Data">
            <input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              onClick={openDatePicker}
              className="input"
            />
          </Field>
          <Field label="Produto">
            <select
              value={productId}
              onChange={(e) => handleProductChange(Number(e.target.value))}
              className="input"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <CustomerPicker
          customers={customers}
          value={customer}
          onChange={setCustomer}
          onCustomerCreated={onCustomerCreated}
          autoFocus
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Quantidade">
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} className="input" inputMode="decimal" />
          </Field>
          <Field label="Preço de custo">
            <input value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} className="input" inputMode="decimal" />
          </Field>
          <Field label="Preço de venda">
            <input value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} className="input" inputMode="decimal" />
          </Field>
        </div>
        <Field label="Valor pago no ato (deixe em branco se for tudo fiado)">
          <input
            value={initialPayment}
            onChange={(e) => setInitialPayment(e.target.value)}
            className="input"
            placeholder="0,00"
            inputMode="decimal"
          />
        </Field>
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
        <Field label="Observação (opcional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input min-h-16 resize-y"
            placeholder="Alguma anotação sobre essa venda..."
          />
        </Field>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
        >
          {saving ? "Salvando..." : "Salvar venda"}
        </button>
      </form>
    </ModalShell>
  );
}

function CustomerPicker({
  customers,
  value,
  onChange,
  onCustomerCreated,
  autoFocus,
}: {
  customers: Customer[];
  value: Customer | null;
  onChange: (c: Customer | null) => void;
  onCustomerCreated: (c: Customer) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const filtered = q ? customers.filter((c) => c.name.toLowerCase().includes(q)) : customers;
  const exactMatch = customers.some((c) => c.name.toLowerCase() === q);

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
    setQuery(newCustomer.name);
    setOpen(false);
  }

  function selectCustomer(c: Customer) {
    onChange(c);
    setQuery(c.name);
    setOpen(false);
  }

  function handleCreateButtonClick() {
    if (q && !exactMatch) {
      handleCreate();
      return;
    }
    setOpen(true);
    inputRef.current?.focus();
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400">Cliente</span>
        <button
          type="button"
          onClick={handleCreateButtonClick}
          disabled={creating}
          className="rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
        >
          {creating ? "Criando..." : "+ Criar cliente"}
        </button>
      </div>
      <div className="relative">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setCreateError(null);
          if (value) onChange(null);
        }}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== "Tab") return;
          const exact = customers.find((c) => c.name.toLowerCase() === q);
          const match = exact || filtered[0];
          if (match) {
            // Tab só completa (e continua pro próximo campo, comportamento
            // normal de tab); Enter também cria o cliente se não achar nada.
            if (e.key === "Enter") e.preventDefault();
            selectCustomer(match);
          } else if (e.key === "Enter" && q) {
            e.preventDefault();
            handleCreate();
          }
        }}
        onBlur={() => {
          setTimeout(() => {
            setOpen(false);
            if (!value) {
              const exact = customers.find((c) => c.name.toLowerCase() === q);
              if (exact) selectCustomer(exact);
            }
          }, 150);
        }}
        className="input"
        placeholder="Buscar ou criar cliente..."
        autoFocus={autoFocus}
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-zinc-700 bg-zinc-900 shadow-lg">
          {filtered.length === 0 && !q && (
            <p className="px-3 py-1.5 text-xs text-zinc-500">Nenhum cliente cadastrado ainda.</p>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectCustomer(c)}
              className="block w-full px-3 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-800"
            >
              {c.name}
            </button>
          ))}
          {q && !exactMatch && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleCreate}
              disabled={creating}
              className="block w-full border-t border-zinc-800 px-3 py-1.5 text-left text-sm text-emerald-400 hover:bg-zinc-800 disabled:opacity-60"
            >
              {creating ? "Criando..." : `+ Criar cliente "${query.trim()}"`}
            </button>
          )}
        </div>
      )}
      </div>
      {createError && <p className="mt-1 text-xs text-red-400">{createError}</p>}
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-xs font-medium text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full border border-zinc-600 text-[9px] font-bold text-zinc-500"
    >
      i
    </span>
  );
}
