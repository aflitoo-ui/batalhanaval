"use client";

import { useEffect, useMemo, useState } from "react";

type Customer = {
  id: number;
  name: string;
  phone: string | null;
  active: boolean;
  createdAt: string;
};

type SaleDate = { customerId: number | null; saleDate: string };

const INACTIVE_DAYS_THRESHOLD = 30;

function daysSince(iso: string) {
  const d = new Date(iso.split("T")[0] + "T00:00:00");
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");
  return Math.round((today.getTime() - d.getTime()) / 86400000);
}

export default function ClientesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<SaleDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const activeCount = customers.filter((c) => c.active).length;

  // Não classifica "sumiu" sozinho — só mostra fatos (última compra há
  // quantos dias, ou nunca comprou) pra você julgar quem precisa de atenção.
  const inactiveCustomers = useMemo(() => {
    const lastPurchaseByCustomer = new Map<number, string>();
    for (const s of sales) {
      if (s.customerId == null) continue;
      const current = lastPurchaseByCustomer.get(s.customerId);
      if (!current || s.saleDate > current) lastPurchaseByCustomer.set(s.customerId, s.saleDate);
    }
    return customers
      .filter((c) => c.active)
      .map((c) => {
        const last = lastPurchaseByCustomer.get(c.id);
        // Cliente que nunca comprou usa a data de cadastro como referência —
        // um cliente recém-criado não teve tempo de "ficar inativo" ainda.
        const daysInactive = last ? daysSince(last) : daysSince(c.createdAt);
        return { customer: c, days: last ? daysInactive : null, daysInactive };
      })
      .filter((entry) => entry.daysInactive >= INACTIVE_DAYS_THRESHOLD)
      .sort((a, b) => b.daysInactive - a.daysInactive);
  }, [customers, sales]);

  async function load() {
    const [customersRes, salesRes] = await Promise.all([
      fetch("/api/customers"),
      fetch("/api/sales?includeArchived=1"),
    ]);
    const customersData = await customersRes.json();
    const salesData = await salesRes.json();
    setCustomers(customersData.customers || []);
    setSales(salesData.sales || []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Preencha o nome do cliente.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), phone: phone.trim() || undefined }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Erro ao salvar.");
      return;
    }
    setName("");
    setPhone("");
    load();
  }

  async function toggleActive(c: Customer) {
    await fetch(`/api/customers/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !c.active }),
    });
    load();
  }

  function startEdit(c: Customer) {
    setConfirmDeleteId(null);
    setEditError(null);
    setEditId(c.id);
    setEditName(c.name);
    setEditPhone(c.phone || "");
  }

  async function handleSaveEdit(c: Customer) {
    setEditError(null);
    if (!editName.trim()) {
      setEditError("Preencha o nome do cliente.");
      return;
    }
    setEditSaving(true);
    const res = await fetch(`/api/customers/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), phone: editPhone.trim() || null }),
    });
    const data = await res.json().catch(() => null);
    setEditSaving(false);
    if (!res.ok) {
      setEditError(data?.error || "Erro ao salvar.");
      return;
    }
    setEditId(null);
    load();
  }

  async function handleDelete(c: Customer) {
    setDeleteError(null);
    const res = await fetch(`/api/customers/${c.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setDeleteError(data?.error || "Erro ao excluir.");
      setConfirmDeleteId(null);
      return;
    }
    setConfirmDeleteId(null);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-2">
        <h1 className="text-xl font-bold text-zinc-100">Clientes</h1>
        {!loading && (
          <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-200">
            {customers.length} {customers.length === 1 ? "cliente" : "clientes"}
            {activeCount !== customers.length && ` (${activeCount} ativo${activeCount === 1 ? "" : "s"})`}
          </span>
        )}
      </div>

      {!loading && inactiveCustomers.length > 0 && (
        <div className="rounded-lg border border-amber-900/50 bg-amber-950/20">
          <button
            onClick={() => setShowInactive((v) => !v)}
            className="flex w-full items-center justify-between gap-2 p-4 text-left"
          >
            <h2 className="text-sm font-semibold text-amber-400">
              Clientes inativos ({inactiveCustomers.length}) — sem comprar há {INACTIVE_DAYS_THRESHOLD}+ dias
            </h2>
            <span className={`shrink-0 text-amber-400 transition-transform ${showInactive ? "rotate-180" : ""}`}>▾</span>
          </button>
          {showInactive && (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto px-4 pb-4">
              {inactiveCustomers.map(({ customer, days }) => (
                <li key={customer.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-amber-300">{customer.name}</span>
                  <span className="text-xs text-zinc-400">{days === null ? "nunca comprou" : `última compra: há ${days} dias`}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <form
        onSubmit={handleAdd}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-48 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            placeholder="Nome do cliente"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Telefone (opcional)</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-40 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            placeholder="(00) 00000-0000"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
        >
          Adicionar cliente
        </button>
        {error && <p className="w-full text-sm text-red-400">{error}</p>}
      </form>

      {deleteError && (
        <p className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-400">{deleteError}</p>
      )}

      {loading ? (
        <p className="py-6 text-center text-sm text-zinc-500">Carregando...</p>
      ) : customers.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">Nenhum cliente cadastrado ainda.</p>
      ) : (
        <>
          {/* Cartões — telas pequenas */}
          <div className="space-y-3 md:hidden">
            {customers.map((c) => (
              <div key={c.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                {editId === c.id ? (
                  <div className="space-y-2">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} className="input" autoFocus />
                    <input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="input"
                      placeholder="Telefone (opcional)"
                    />
                    {editError && <p className="text-xs text-red-400">{editError}</p>}
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => handleSaveEdit(c)}
                        disabled={editSaving}
                        className="rounded-md px-2 py-1 text-sm font-medium text-emerald-400 transition hover:bg-zinc-800 hover:text-emerald-300 disabled:opacity-60"
                      >
                        salvar
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="rounded-md px-2 py-1 text-sm font-medium text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
                      >
                        cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-amber-400">{c.name}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.active ? "bg-emerald-950 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                        }`}
                      >
                        {c.active ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    {c.phone && <p className="mt-1 text-sm text-zinc-400">{c.phone}</p>}
                    <div className="mt-3 flex items-center justify-end gap-3 border-t border-zinc-800 pt-2">
                      {confirmDeleteId === c.id ? (
                        <>
                          <span className="text-xs text-zinc-400">Excluir?</span>
                          <button
                            onClick={() => handleDelete(c)}
                            className="rounded-md px-2 py-1 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-emerald-400"
                          >
                            sim
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-md px-2 py-1 text-sm font-medium text-zinc-500 transition hover:bg-zinc-800 hover:text-red-400"
                          >
                            não
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(c)}
                            className="rounded-md px-2 py-1 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
                          >
                            editar
                          </button>
                          <button
                            onClick={() => toggleActive(c)}
                            className="rounded-md px-2 py-1 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
                          >
                            {c.active ? "desativar" : "reativar"}
                          </button>
                          <button
                            onClick={() => {
                              setDeleteError(null);
                              setConfirmDeleteId(c.id);
                            }}
                            className="rounded-md px-2 py-1 text-sm font-medium text-zinc-500 transition hover:bg-zinc-800 hover:text-red-400"
                          >
                            excluir
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Tabela — telas médias pra cima */}
          <div className="hidden overflow-x-auto rounded-lg border border-zinc-800 md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Telefone</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) =>
                  editId === c.id ? (
                    <tr key={c.id} className="border-b border-zinc-900 bg-zinc-900/40 last:border-0">
                      <td className="px-4 py-2">
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} className="input" autoFocus />
                      </td>
                      <td className="px-4 py-2">
                        <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="input" />
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            c.active ? "bg-emerald-950 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                          }`}
                        >
                          {c.active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          {editError && <span className="text-xs text-red-400">{editError}</span>}
                          <button
                            onClick={() => handleSaveEdit(c)}
                            disabled={editSaving}
                            className="rounded-md px-2 py-1 text-sm font-medium text-emerald-400 transition hover:bg-zinc-800 hover:text-emerald-300 disabled:opacity-60"
                          >
                            salvar
                          </button>
                          <button
                            onClick={() => setEditId(null)}
                            className="rounded-md px-2 py-1 text-sm font-medium text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
                          >
                            cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={c.id} className="border-b border-zinc-900 last:border-0">
                      <td className="px-4 py-2 font-medium text-amber-400">{c.name}</td>
                      <td className="px-4 py-2 text-zinc-300">{c.phone || "-"}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            c.active ? "bg-emerald-950 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                          }`}
                        >
                          {c.active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          {confirmDeleteId === c.id ? (
                            <>
                              <span className="text-xs text-zinc-400">Excluir?</span>
                              <button
                                onClick={() => handleDelete(c)}
                                className="rounded-md px-2 py-1 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-emerald-400"
                              >
                                sim
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="rounded-md px-2 py-1 text-sm font-medium text-zinc-500 transition hover:bg-zinc-800 hover:text-red-400"
                              >
                                não
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(c)}
                                className="rounded-md px-2 py-1 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
                              >
                                editar
                              </button>
                              <button
                                onClick={() => toggleActive(c)}
                                className="rounded-md px-2 py-1 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
                              >
                                {c.active ? "desativar" : "reativar"}
                              </button>
                              <button
                                onClick={() => {
                                  setDeleteError(null);
                                  setConfirmDeleteId(c.id);
                                }}
                                className="rounded-md px-2 py-1 text-sm font-medium text-zinc-500 transition hover:bg-zinc-800 hover:text-red-400"
                              >
                                excluir
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
