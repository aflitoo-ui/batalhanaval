"use client";

import { useEffect, useMemo, useState } from "react";

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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function VendasPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewSale, setShowNewSale] = useState(false);
  const [paymentSaleId, setPaymentSaleId] = useState<number | null>(null);
  const [editSaleId, setEditSaleId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    const [salesRes, productsRes, customersRes] = await Promise.all([
      fetch("/api/sales"),
      fetch("/api/products"),
      fetch("/api/customers"),
    ]);
    const salesData = await salesRes.json();
    const productsData = await productsRes.json();
    const customersData = await customersRes.json();
    setSales(salesData.sales || []);
    setProducts(productsData.products || []);
    setCustomers(customersData.customers || []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter((s) => (s.customerName || "").toLowerCase().includes(q));
  }, [sales, search]);

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

  async function handleDeleteSale(id: number) {
    await fetch(`/api/sales/${id}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    load();
  }

  function RowActions({ s }: { s: Sale }) {
    if (confirmDeleteId === s.id) {
      return (
        <>
          <span className="text-xs text-zinc-400">Excluir?</span>
          <button onClick={() => handleDeleteSale(s.id)} className="text-xs font-medium text-red-400 hover:text-red-300">
            sim
          </button>
          <button
            onClick={() => setConfirmDeleteId(null)}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-300"
          >
            não
          </button>
        </>
      );
    }
    return (
      <>
        <button
          onClick={() => setPaymentSaleId(s.id)}
          className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
        >
          pagamentos
        </button>
        <button
          onClick={() => setEditSaleId(s.id)}
          className="text-xs font-medium text-zinc-400 hover:text-zinc-200"
        >
          editar
        </button>
        <button
          onClick={() => setConfirmDeleteId(s.id)}
          className="text-xs font-medium text-zinc-500 hover:text-red-400"
        >
          excluir
        </button>
      </>
    );
  }

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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total vendido" value={formatBRL(totals.total)} />
        <SummaryCard label="Recebido" value={formatBRL(totals.paid)} tone="emerald" />
        <SummaryCard label="A receber" value={formatBRL(totals.owed)} tone="red" />
        <SummaryCard label="Lucro" value={formatBRL(totals.profit)} tone="emerald" />
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por cliente..."
        className="input max-w-xs"
      />

      {loading ? (
        <p className="py-6 text-center text-sm text-zinc-500">Carregando...</p>
      ) : filteredSales.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">
          {sales.length === 0 ? "Nenhuma venda lançada ainda." : "Nenhuma venda encontrada para essa busca."}
        </p>
      ) : (
        <>
          {/* Cartões — telas pequenas */}
          <div className="space-y-3 md:hidden">
            {filteredSales.map((s) => (
              <div key={s.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-amber-400">{s.customerName}</p>
                    <p className="text-xs text-zinc-500">
                      {formatDate(s.saleDate)} · {s.productName} · {s.quantity}x
                    </p>
                  </div>
                  <p className="text-right text-sm font-medium text-zinc-100">{formatBRL(s.total)}</p>
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
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-500">Lucro</p>
                    <p className="text-zinc-200">{formatBRL(s.profit)}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-end gap-3 border-t border-zinc-800 pt-2">
                  <RowActions s={s} />
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
                  <th className="px-3 py-2 text-right">QP</th>
                  <th className="px-3 py-2 text-right">QV</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Pagou</th>
                  <th className="px-3 py-2 text-right">Deve</th>
                  <th className="px-3 py-2 text-right">Lucro</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((s) => (
                  <tr key={s.id} className="border-b border-zinc-900 last:border-0 hover:bg-zinc-900/50">
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
                    <td className="px-3 py-2 text-right text-zinc-200">{formatBRL(s.total)}</td>
                    <td className="px-3 py-2 text-right text-emerald-400">{formatBRL(s.paid)}</td>
                    <td className="px-3 py-2 text-right font-medium text-red-400">
                      {s.owed > 0 ? formatBRL(s.owed) : "-"}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-200">{formatBRL(s.profit)}</td>
                    <td className="px-3 py-2 text-amber-400">{s.customerName}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <RowActions s={s} />
                      </div>
                    </td>
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
            load();
          }}
        />
      )}

      {editSaleId !== null && (
        <EditSaleModal
          sale={sales.find((s) => s.id === editSaleId)!}
          products={products.filter((p) => p.active)}
          customers={customers.filter((c) => c.active)}
          onCustomerCreated={(c) => setCustomers((prev) => [...prev, c])}
          onClose={() => setEditSaleId(null)}
          onSaved={() => {
            setEditSaleId(null);
            load();
          }}
        />
      )}

      {paymentSaleId !== null && (
        <PaymentsModal
          sale={sales.find((s) => s.id === paymentSaleId)!}
          onClose={() => setPaymentSaleId(null)}
          onSaved={() => {
            setPaymentSaleId(null);
            load();
          }}
          onRefresh={load}
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-100">{title}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
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
    if (!productId || !customer || !qty || Number.isNaN(qp) || Number.isNaN(qv)) {
      setError("Preencha todos os campos corretamente — selecione ou crie um cliente.");
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
        <Field label="Cliente">
          <CustomerPicker
            customers={customers}
            value={customer}
            onChange={setCustomer}
            onCustomerCreated={onCustomerCreated}
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Quantidade">
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} className="input" inputMode="decimal" />
          </Field>
          <Field label="Quanto você pagou?">
            <input value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} className="input" inputMode="decimal" />
          </Field>
          <Field label="A quanto você vende?">
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

function EditSaleModal({
  sale,
  products,
  customers,
  onCustomerCreated,
  onClose,
  onSaved,
}: {
  sale: Sale;
  products: Product[];
  customers: Customer[];
  onCustomerCreated: (c: Customer) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saleDate, setSaleDate] = useState(sale.saleDate.slice(0, 10));
  const [productId, setProductId] = useState<number>(sale.productId);
  const [customer, setCustomer] = useState<Customer | null>(
    sale.customerId ? { id: sale.customerId, name: sale.customerName || "", phone: null, active: true } : null
  );
  const [quantity, setQuantity] = useState(String(sale.quantity));
  const [buyPrice, setBuyPrice] = useState(String(sale.unitBuyPrice));
  const [sellPrice, setSellPrice] = useState(String(sale.unitSellPrice));
  const [notes, setNotes] = useState(sale.notes || "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Produto pode ter sido desativado desde a venda — garante que continue
  // aparecendo como opção pra não perder a referência ao editar outra coisa.
  const productOptions = products.some((p) => p.id === sale.productId)
    ? products
    : [{ id: sale.productId, name: sale.productName, defaultBuyPrice: 0, defaultSellPrice: 0, active: false }, ...products];

  // Mesma lógica pro cliente: se ele foi desativado depois da venda, garante
  // que continue aparecendo como opção selecionável.
  const customerOptions =
    sale.customerId && !customers.some((c) => c.id === sale.customerId)
      ? [{ id: sale.customerId, name: sale.customerName || "", phone: null, active: false }, ...customers]
      : customers;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const qty = Number(quantity.replace(",", "."));
    const qp = Number(buyPrice.replace(",", "."));
    const qv = Number(sellPrice.replace(",", "."));
    if (!productId || !customer || !qty || Number.isNaN(qp) || Number.isNaN(qv)) {
      setError("Preencha todos os campos corretamente — selecione ou crie um cliente.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/sales/${sale.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saleDate,
        productId,
        customerId: customer.id,
        quantity: qty,
        unitBuyPrice: qp,
        unitSellPrice: qv,
        notes: notes.trim() || null,
      }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error || "Erro ao salvar.");
      return;
    }
    onSaved();
  }

  return (
    <ModalShell title={`Editar venda — ${sale.customerName || ""}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Data">
            <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className="input" />
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
        <Field label="Cliente">
          <CustomerPicker
            customers={customerOptions}
            value={customer}
            onChange={setCustomer}
            onCustomerCreated={onCustomerCreated}
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Quantidade">
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} className="input" inputMode="decimal" />
          </Field>
          <Field label="Quanto você pagou?">
            <input value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} className="input" inputMode="decimal" />
          </Field>
          <Field label="A quanto você vende?">
            <input value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} className="input" inputMode="decimal" />
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
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
        >
          {saving ? "Salvando..." : "Salvar alterações"}
        </button>
      </form>
    </ModalShell>
  );
}

function PaymentsModal({
  sale,
  onClose,
  onSaved,
  onRefresh,
}: {
  sale: Sale;
  onClose: () => void;
  onSaved: () => void;
  onRefresh: () => void;
}) {
  const [history, setHistory] = useState<PaymentEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayISO());
  const [paymentNotes, setPaymentNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(amount.replace(",", "."));
    if (!value || value <= 0) {
      setError("Informe um valor válido.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/sales/${sale.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: value, paidAt, notes: paymentNotes.trim() || undefined }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Erro ao salvar.");
      return;
    }
    onSaved();
  }

  async function handleDeletePayment(id: number) {
    setDeletingId(id);
    await fetch(`/api/payments/${id}`, { method: "DELETE" });
    setDeletingId(null);
    setConfirmDeleteId(null);
    await loadHistory();
    onRefresh();
  }

  return (
    <ModalShell title={`Pagamentos — ${sale.customerName || ""}`} onClose={onClose}>
      <div className="mb-3 grid grid-cols-3 gap-2 text-sm">
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
      </div>

      <div className="mb-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Histórico</h3>
        {loadingHistory ? (
          <p className="text-sm text-zinc-500">Carregando...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum pagamento registrado ainda.</p>
        ) : (
          <ul className="max-h-48 space-y-1.5 overflow-y-auto">
            {history.map((h) => (
              <li key={h.id} className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">{formatDate(h.paidAt)}</span>
                  <span className="text-emerald-400">{formatBRL(h.amount)}</span>
                  {confirmDeleteId === h.id ? (
                    <span className="flex items-center gap-1.5">
                      <span className="text-xs text-zinc-500">Remover?</span>
                      <button
                        onClick={() => handleDeletePayment(h.id)}
                        disabled={deletingId === h.id}
                        className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-60"
                      >
                        {deletingId === h.id ? "..." : "sim"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs font-medium text-zinc-500 hover:text-zinc-300"
                      >
                        não
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(h.id)}
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
        <form onSubmit={handleSubmit} className="space-y-3 border-t border-zinc-800 pt-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Valor pago">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input"
                inputMode="decimal"
                placeholder="0"
                autoFocus
              />
            </Field>
            <Field label="Data">
              <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="input" />
            </Field>
          </div>
          <Field label="Observação (opcional)">
            <input
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              className="input"
            />
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Registrar pagamento"}
          </button>
        </form>
      ) : (
        <p className="border-t border-zinc-800 pt-3 text-sm text-emerald-400">Pago integralmente.</p>
      )}
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

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setCreateError(null);
          if (value) onChange(null);
        }}
        onClick={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
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
              onClick={() => {
                onChange(c);
                setQuery(c.name);
                setOpen(false);
              }}
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
      {createError && <p className="mt-1 text-xs text-red-400">{createError}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
      {children}
    </label>
  );
}
