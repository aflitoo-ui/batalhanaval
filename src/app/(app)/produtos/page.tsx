"use client";

import { useEffect, useState } from "react";

type Product = {
  id: number;
  name: string;
  defaultBuyPrice: number;
  defaultSellPrice: number;
  active: boolean;
};

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ProdutosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editBuyPrice, setEditBuyPrice] = useState("");
  const [editSellPrice, setEditSellPrice] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/products");
    const data = await res.json();
    setProducts(data.products || []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const buy = Number(buyPrice.replace(",", "."));
    const sell = Number(sellPrice.replace(",", "."));
    if (!name.trim() || Number.isNaN(buy) || Number.isNaN(sell)) {
      setError("Preencha nome e preços válidos.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), defaultBuyPrice: buy, defaultSellPrice: sell }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Erro ao salvar.");
      return;
    }
    setName("");
    setBuyPrice("");
    setSellPrice("");
    load();
  }

  async function toggleActive(p: Product) {
    await fetch(`/api/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    load();
  }

  function startEdit(p: Product) {
    setConfirmDeleteId(null);
    setEditError(null);
    setEditId(p.id);
    setEditName(p.name);
    setEditBuyPrice(String(p.defaultBuyPrice));
    setEditSellPrice(String(p.defaultSellPrice));
  }

  async function handleSaveEdit(p: Product) {
    setEditError(null);
    const buy = Number(editBuyPrice.replace(",", "."));
    const sell = Number(editSellPrice.replace(",", "."));
    if (!editName.trim() || Number.isNaN(buy) || Number.isNaN(sell)) {
      setEditError("Preencha nome e preços válidos.");
      return;
    }
    setEditSaving(true);
    const res = await fetch(`/api/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), defaultBuyPrice: buy, defaultSellPrice: sell }),
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

  async function handleDelete(p: Product) {
    setDeleteError(null);
    const res = await fetch(`/api/products/${p.id}`, { method: "DELETE" });
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
      <h1 className="text-xl font-bold text-zinc-100">Produtos</h1>

      <form
        onSubmit={handleAdd}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-40 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            placeholder="Ex: Água"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Preço de compra</label>
          <input
            value={buyPrice}
            onChange={(e) => setBuyPrice(e.target.value)}
            className="w-32 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            placeholder="0,00"
            inputMode="decimal"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Preço de venda</label>
          <input
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
            className="w-32 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            placeholder="0,00"
            inputMode="decimal"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
        >
          Adicionar produto
        </button>
        {error && <p className="w-full text-sm text-red-400">{error}</p>}
      </form>

      {deleteError && (
        <p className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-400">{deleteError}</p>
      )}

      {loading ? (
        <p className="py-6 text-center text-sm text-zinc-500">Carregando...</p>
      ) : products.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">Nenhum produto cadastrado ainda.</p>
      ) : (
        <>
          {/* Cartões — telas pequenas */}
          <div className="space-y-3 md:hidden">
            {products.map((p) => (
              <div key={p.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                {editId === p.id ? (
                  <div className="space-y-2">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} className="input" autoFocus />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={editBuyPrice}
                        onChange={(e) => setEditBuyPrice(e.target.value)}
                        className="input"
                        inputMode="decimal"
                        placeholder="Compra"
                      />
                      <input
                        value={editSellPrice}
                        onChange={(e) => setEditSellPrice(e.target.value)}
                        className="input"
                        inputMode="decimal"
                        placeholder="Venda"
                      />
                    </div>
                    {editError && <p className="text-xs text-red-400">{editError}</p>}
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => handleSaveEdit(p)}
                        disabled={editSaving}
                        className="text-xs font-medium text-emerald-400 hover:text-emerald-300 disabled:opacity-60"
                      >
                        salvar
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="text-xs font-medium text-zinc-500 hover:text-zinc-300"
                      >
                        cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-zinc-200">{p.name}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.active ? "bg-emerald-950 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                        }`}
                      >
                        {p.active ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-[11px] text-zinc-500">Compra</p>
                        <p className="text-zinc-300">{formatBRL(p.defaultBuyPrice)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-zinc-500">Venda</p>
                        <p className="text-zinc-300">{formatBRL(p.defaultSellPrice)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-3 border-t border-zinc-800 pt-2">
                      {confirmDeleteId === p.id ? (
                        <>
                          <span className="text-xs text-zinc-400">Excluir?</span>
                          <button
                            onClick={() => handleDelete(p)}
                            className="text-xs font-medium text-zinc-400 hover:text-emerald-400"
                          >
                            sim
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="ml-2 text-xs font-medium text-zinc-500 hover:text-red-400"
                          >
                            não
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(p)}
                            className="text-xs font-medium text-zinc-400 hover:text-zinc-200"
                          >
                            editar
                          </button>
                          <button
                            onClick={() => toggleActive(p)}
                            className="text-xs font-medium text-zinc-400 hover:text-zinc-200"
                          >
                            {p.active ? "desativar" : "reativar"}
                          </button>
                          <button
                            onClick={() => {
                              setDeleteError(null);
                              setConfirmDeleteId(p.id);
                            }}
                            className="text-xs font-medium text-zinc-500 hover:text-red-400"
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
              <th className="px-4 py-2">Produto</th>
              <th className="px-4 py-2">Compra</th>
              <th className="px-4 py-2">Venda</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
              {products.map((p) =>
                editId === p.id ? (
                  <tr key={p.id} className="border-b border-zinc-900 bg-zinc-900/40 last:border-0">
                    <td className="px-4 py-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="input"
                        autoFocus
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editBuyPrice}
                        onChange={(e) => setEditBuyPrice(e.target.value)}
                        className="input"
                        inputMode="decimal"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editSellPrice}
                        onChange={(e) => setEditSellPrice(e.target.value)}
                        className="input"
                        inputMode="decimal"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.active ? "bg-emerald-950 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                        }`}
                      >
                        {p.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        {editError && <span className="text-xs text-red-400">{editError}</span>}
                        <button
                          onClick={() => handleSaveEdit(p)}
                          disabled={editSaving}
                          className="text-xs font-medium text-emerald-400 hover:text-emerald-300 disabled:opacity-60"
                        >
                          salvar
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="text-xs font-medium text-zinc-500 hover:text-zinc-300"
                        >
                          cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} className="border-b border-zinc-900 last:border-0">
                    <td className="px-4 py-2 font-medium text-zinc-200">{p.name}</td>
                    <td className="px-4 py-2 text-zinc-300">{formatBRL(p.defaultBuyPrice)}</td>
                    <td className="px-4 py-2 text-zinc-300">{formatBRL(p.defaultSellPrice)}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.active ? "bg-emerald-950 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                        }`}
                      >
                        {p.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        {confirmDeleteId === p.id ? (
                          <>
                            <span className="text-xs text-zinc-400">Excluir?</span>
                            <button
                              onClick={() => handleDelete(p)}
                              className="text-xs font-medium text-zinc-400 hover:text-emerald-400"
                            >
                              sim
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="ml-2 text-xs font-medium text-zinc-500 hover:text-red-400"
                            >
                              não
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(p)}
                              className="text-xs font-medium text-zinc-400 hover:text-zinc-200"
                            >
                              editar
                            </button>
                            <button
                              onClick={() => toggleActive(p)}
                              className="text-xs font-medium text-zinc-400 hover:text-zinc-200"
                            >
                              {p.active ? "desativar" : "reativar"}
                            </button>
                            <button
                              onClick={() => {
                                setDeleteError(null);
                                setConfirmDeleteId(p.id);
                              }}
                              className="text-xs font-medium text-zinc-500 hover:text-red-400"
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
