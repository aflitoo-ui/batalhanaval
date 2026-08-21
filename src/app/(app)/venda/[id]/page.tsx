"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AdjustmentSignToggle,
  ADJUSTMENT_HINT,
  CustomerPicker,
  DateField,
  Field,
  formatBRL,
  formatDate,
  InfoTip,
  parseNumber,
  todayISO,
  type Customer,
  type PaymentEntry,
  type Product,
  type Sale,
} from "../../page";

// Página de detalhe da venda — era um modal (SaleModal, em src/app/(app)/page.tsx)
// que virou tela própria a pedido: mais espaço de respiro e navegação com
// botão voltar em vez de X fechando um popup, igual ao app mobile
// (SaleDetailScreen). A lógica de negócio (histórico de pagamentos, registrar
// pagamento, "Quitar tudo", editar com confirmação do que mudou, excluir) é a
// mesma de antes, só o invólucro visual mudou.
export default function VendaDetalhePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const saleId = params.id;

  const [sale, setSale] = useState<Sale | null>(null);
  const [loadingSale, setLoadingSale] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allSales, setAllSales] = useState<Sale[]>([]);

  async function loadSale() {
    setLoadingSale(true);
    setLoadError(null);
    const res = await fetch(`/api/sales/${saleId}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setLoadError(data?.error || "Erro ao carregar a venda.");
      setLoadingSale(false);
      return;
    }
    setSale(data.sale);
    setLoadingSale(false);
  }

  useEffect(() => {
    void loadSale();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleId]);

  useEffect(() => {
    async function loadPickerData() {
      const [productsRes, customersRes, allSalesRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/customers"),
        fetch("/api/sales?includeArchived=1"),
      ]);
      const productsData = await productsRes.json().catch(() => null);
      const customersData = await customersRes.json().catch(() => null);
      const allSalesData = await allSalesRes.json().catch(() => null);
      setProducts(productsData?.products || []);
      setCustomers(customersData?.customers || []);
      setAllSales(allSalesData?.sales || []);
    }
    void loadPickerData();
  }, []);

  // Ranking de "clientes mais usados" pro CustomerPicker — mesma lógica da
  // lista de Vendas (conta o histórico completo, não só um recorte).
  const customerUsage = useMemo(() => {
    const usage = new Map<number, number>();
    for (const s of allSales) {
      if (s.customerId != null) usage.set(s.customerId, (usage.get(s.customerId) ?? 0) + 1);
    }
    return usage;
  }, [allSales]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="-ml-2 flex items-center gap-1 rounded-md p-2 text-sm font-medium text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Vendas
        </Link>
      </div>

      {loadingSale ? (
        <p className="py-6 text-center text-sm text-zinc-500">Carregando...</p>
      ) : loadError || !sale ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-red-900 bg-red-950/20 py-8 text-center">
          <p className="max-w-xs text-sm text-red-400">{loadError || "Venda não encontrada."}</p>
          <Link
            href="/"
            className="rounded-md bg-[#3a2268] px-4 py-1.5 text-sm font-medium text-white transition hover:bg-[#6139ae]"
          >
            Voltar pra Vendas
          </Link>
        </div>
      ) : (
        <SaleDetail
          sale={sale}
          products={products.filter((p) => p.active)}
          customers={customers.filter((c) => c.active)}
          customerUsage={customerUsage}
          onCustomerCreated={(c) => setCustomers((prev) => [...prev, c])}
          onChanged={loadSale}
          onDeleted={() => router.push("/")}
        />
      )}
    </div>
  );
}

function SaleDetail({
  sale,
  products,
  customers,
  customerUsage,
  onCustomerCreated,
  onChanged,
  onDeleted,
}: {
  sale: Sale;
  products: Product[];
  customers: Customer[];
  customerUsage: Map<number, number>;
  onCustomerCreated: (c: Customer) => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const router = useRouter();

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
    const value = parseNumber(amount);
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

  const qty = parseNumber(quantity) || 0;
  const subtotal = qty * (parseNumber(sellPrice) || 0);
  const adjAbs = adjustment ? parseNumber(adjustment) || 0 : 0;
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
        unitBuyPrice: parseNumber(buyPrice),
        unitSellPrice: parseNumber(sellPrice),
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
    router.push("/");
  }

  // Mostra só o que realmente mudou antes de gravar — evita salvar uma
  // edição sem querer, já que mexe direto no valor financeiro da venda
  // (mesma lógica de diff do mobile).
  function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);
    const qp = parseNumber(buyPrice);
    const qv = parseNumber(sellPrice);
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
      router.push("/");
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
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-lg font-bold text-zinc-100">Venda — {sale.customerName || "Sem cliente"}</h1>

      <div className="grid grid-cols-4 gap-2 text-sm">
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

      <div>
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
                        className="rounded-md px-2 py-1 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-emerald-400 disabled:opacity-60"
                      >
                        {deletingPaymentId === h.id ? "..." : "sim"}
                      </button>
                      <button
                        onClick={() => setConfirmDeletePaymentId(null)}
                        className="rounded-md px-2 py-1 text-sm font-medium text-zinc-500 transition hover:bg-zinc-800 hover:text-red-400"
                      >
                        não
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDeletePaymentId(h.id)}
                      className="rounded-md px-2 py-1 text-sm font-medium text-zinc-500 transition hover:bg-zinc-800 hover:text-red-400"
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
        <form onSubmit={handleAddPayment} className="space-y-3 border-t border-zinc-800 pt-4">
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
              <DateField value={paidAt} onChange={setPaidAt} />
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
              className="flex-1 rounded-lg bg-[#3a2268] py-2 text-sm font-medium text-white transition hover:bg-[#6139ae] disabled:opacity-60"
            >
              {savingPayment ? "Salvando..." : "Registrar pagamento"}
            </button>
          </div>
        </form>
      ) : (
        <p className="border-t border-zinc-800 pt-4 text-sm text-emerald-400">Pago integralmente.</p>
      )}

      <div className="border-t border-zinc-800" />

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Detalhes da venda</h3>
        <form onSubmit={handleSaveEdit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Data">
              <DateField value={saleDate} onChange={setSaleDate} />
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
            usage={customerUsage}
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
              className="w-full rounded-lg bg-[#3a2268] py-2 text-sm font-medium text-white transition hover:bg-[#6139ae]"
            >
              Salvar alterações
            </button>
          )}
        </form>
      </div>

      <div className="border-t border-zinc-800" />

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
    </div>
  );
}
