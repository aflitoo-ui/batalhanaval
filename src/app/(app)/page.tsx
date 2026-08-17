"use client";

import { useEffect, useMemo, useState } from "react";

type Product = {
  id: number;
  name: string;
  defaultBuyPrice: number;
  defaultSellPrice: number;
  active: boolean;
};

type Sale = {
  id: number;
  saleDate: string;
  customerName: string;
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
  const [loading, setLoading] = useState(true);
  const [showNewSale, setShowNewSale] = useState(false);
  const [paymentSaleId, setPaymentSaleId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    const [salesRes, productsRes] = await Promise.all([fetch("/api/sales"), fetch("/api/products")]);
    const salesData = await salesRes.json();
    const productsData = await productsRes.json();
    setSales(salesData.sales || []);
    setProducts(productsData.products || []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter((s) => s.customerName.toLowerCase().includes(q));
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
                <div className="mt-3 flex items-center justify-end gap-3 border-t border-zinc-800 pt-2">
                  {confirmDeleteId === s.id ? (
                    <>
                      <span className="text-xs text-zinc-400">Excluir?</span>
                      <button
                        onClick={() => handleDeleteSale(s.id)}
                        className="text-xs font-medium text-red-400 hover:text-red-300"
                      >
                        sim
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs font-medium text-zinc-500 hover:text-zinc-300"
                      >
                        não
                      </button>
                    </>
                  ) : (
                    <>
                      {s.owed > 0 && (
                        <button
                          onClick={() => setPaymentSaleId(s.id)}
                          className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                        >
                          + pagamento
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmDeleteId(s.id)}
                        className="text-xs font-medium text-zinc-500 hover:text-red-400"
                      >
                        excluir
                      </button>
                    </>
                  )}
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
                    <td className="px-3 py-2 font-medium text-zinc-200">{s.productName}</td>
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
                        {confirmDeleteId === s.id ? (
                          <>
                            <span className="text-xs text-zinc-400">Excluir?</span>
                            <button
                              onClick={() => handleDeleteSale(s.id)}
                              className="text-xs font-medium text-red-400 hover:text-red-300"
                            >
                              sim
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-xs font-medium text-zinc-500 hover:text-zinc-300"
                            >
                              não
                            </button>
                          </>
                        ) : (
                          <>
                            {s.owed > 0 && (
                              <button
                                onClick={() => setPaymentSaleId(s.id)}
                                className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                              >
                                + pagamento
                              </button>
                            )}
                            <button
                              onClick={() => setConfirmDeleteId(s.id)}
                              className="text-xs font-medium text-zinc-500 hover:text-red-400"
                            >
                              excluir
                            </button>
                          </>
                        )}
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
          onClose={() => setShowNewSale(false)}
          onSaved={() => {
            setShowNewSale(false);
            load();
          }}
        />
      )}

      {paymentSaleId !== null && (
        <PaymentModal
          sale={sales.find((s) => s.id === paymentSaleId)!}
          onClose={() => setPaymentSaleId(null)}
          onSaved={() => {
            setPaymentSaleId(null);
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
  onClose,
  onSaved,
}: {
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saleDate, setSaleDate] = useState(todayISO());
  const [productId, setProductId] = useState<number | "">(products[0]?.id ?? "");
  const [customerName, setCustomerName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [buyPrice, setBuyPrice] = useState(String(products[0]?.defaultBuyPrice ?? ""));
  const [sellPrice, setSellPrice] = useState(String(products[0]?.defaultSellPrice ?? ""));
  const [initialPayment, setInitialPayment] = useState("");
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const qty = Number(quantity.replace(",", "."));
    const qp = Number(buyPrice.replace(",", "."));
    const qv = Number(sellPrice.replace(",", "."));
    const payment = initialPayment ? Number(initialPayment.replace(",", ".")) : 0;
    if (!productId || !customerName.trim() || !qty || Number.isNaN(qp) || Number.isNaN(qv)) {
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
        customerName: customerName.trim(),
        quantity: qty,
        unitBuyPrice: qp,
        unitSellPrice: qv,
        initialPayment: payment,
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
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="input"
            placeholder="Nome do cliente"
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

function PaymentModal({ sale, onClose, onSaved }: { sale: Sale; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      body: JSON.stringify({ amount: value, paidAt }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Erro ao salvar.");
      return;
    }
    onSaved();
  }

  return (
    <ModalShell title={`Pagamento — ${sale.customerName}`} onClose={onClose}>
      <p className="mb-3 text-sm text-zinc-400">
        Deve atualmente: <span className="font-medium text-red-400">{formatBRL(sale.owed)}</span>
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Valor pago">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input"
              inputMode="decimal"
              placeholder={String(sale.owed)}
              autoFocus
            />
          </Field>
          <Field label="Data">
            <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="input" />
          </Field>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
        >
          {saving ? "Salvando..." : "Registrar pagamento"}
        </button>
      </form>
    </ModalShell>
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
