"use client";

import { useEffect, useMemo, useState } from "react";

type Sale = {
  id: number;
  saleDate: string;
  customerId: number | null;
  customerName: string | null;
  productName: string;
  quantity: number;
  unitBuyPrice: number;
  unitSellPrice: number;
  total: number;
  paid: number;
  owed: number;
  profit: number;
};

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type ProductAgg = { name: string; quantity: number; revenue: number; cost: number; profit: number; marginPct: number };
type CustomerAgg = { key: string; name: string; total: number; paid: number; owed: number; profit: number };

function aggregateByProduct(sales: Sale[]): ProductAgg[] {
  const map = new Map<string, ProductAgg>();
  for (const s of sales) {
    const cost = s.quantity * s.unitBuyPrice;
    const entry = map.get(s.productName) || { name: s.productName, quantity: 0, revenue: 0, cost: 0, profit: 0, marginPct: 0 };
    entry.quantity += s.quantity;
    entry.revenue += s.total;
    entry.cost += cost;
    entry.profit += s.profit;
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
    const entry = map.get(key) || { key, name: s.customerName || "-", total: 0, paid: 0, owed: 0, profit: 0 };
    entry.total += s.total;
    entry.paid += s.paid;
    entry.owed += s.owed;
    entry.profit += s.profit;
    map.set(key, entry);
  }
  return Array.from(map.values());
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="mb-4 text-sm font-semibold text-zinc-200">{title}</h2>
      {children}
    </div>
  );
}

type ProductSortKey = "quantity" | "revenue" | "profit" | "marginPct";
type CustomerSortKey = "total" | "profit" | "owed";

export default function RelatoriosPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [productSort, setProductSort] = useState<ProductSortKey>("quantity");
  const [customerSort, setCustomerSort] = useState<CustomerSortKey>("total");

  useEffect(() => {
    void (async () => {
      // Inclui vendas arquivadas — mês arquivado some da lista de Vendas do
      // dia a dia, mas o histórico financeiro real continua contando aqui.
      const res = await fetch("/api/sales?includeArchived=1");
      const data = await res.json();
      setSales(data.sales || []);
      setLoading(false);
    })();
  }, []);

  const products = useMemo(() => aggregateByProduct(sales), [sales]);
  const customers = useMemo(() => aggregateByCustomer(sales), [sales]);

  const topByQuantity = useMemo(
    () =>
      [...products]
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 6)
        .map((p) => ({ name: p.name, value: p.quantity })),
    [products]
  );

  const topByProfit = useMemo(
    () =>
      [...products]
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 6)
        .map((p) => ({ name: p.name, value: p.profit })),
    [products]
  );

  const sortedProducts = useMemo(() => [...products].sort((a, b) => b[productSort] - a[productSort]), [products, productSort]);
  const sortedCustomers = useMemo(() => [...customers].sort((a, b) => b[customerSort] - a[customerSort]), [customers, customerSort]);

  if (loading) {
    return <p className="text-sm text-zinc-500">Carregando...</p>;
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Produtos mais vendidos (quantidade)">
          <RankedBars items={topByQuantity} valueKey="quantity" formatValue={(n) => String(n)} color="#3987e5" />
        </Panel>
        <Panel title="Produtos com mais lucro">
          <RankedBars items={topByProfit} valueKey="profit" formatValue={formatBRL} color="#199e70" />
        </Panel>
      </div>

      <Panel title="Todos os produtos">
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
        <div className="overflow-x-auto">
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
      </Panel>

      <Panel title="Melhores clientes">
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
        <div className="overflow-x-auto">
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
                <tr key={c.key} className="border-b border-zinc-900 last:border-0">
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
      </Panel>
    </div>
  );
}
