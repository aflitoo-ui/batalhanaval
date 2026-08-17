"use client";

import { useEffect, useMemo, useState } from "react";

type User = {
  id: number;
  email: string;
  role: "admin" | "user";
  active: boolean;
  createdAt: string;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}

export function UsuariosClient() {
  const [users, setUsers] = useState<User[]>([]);
  const [subStatusByUser, setSubStatusByUser] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);
  const [resetId, setResetId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.email.toLowerCase().includes(q));
  }, [users, search]);

  async function load() {
    const [usersRes, subsRes] = await Promise.all([fetch("/api/users"), fetch("/api/admin/subscriptions")]);
    const usersData = await usersRes.json();
    const subsData = await subsRes.json().catch(() => null);
    setUsers(usersData.users || []);
    const map: Record<number, string> = {};
    for (const s of subsData?.subscriptions || []) {
      if (s.status) map[s.userId] = s.status;
    }
    setSubStatusByUser(map);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || password.length < 8) {
      setError("Informe um e-mail válido e senha com pelo menos 8 caracteres.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error || "Erro ao criar usuário.");
      return;
    }
    setEmail("");
    setPassword("");
    load();
  }

  async function toggleActive(u: User) {
    setRowError(null);
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !u.active }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setRowError({ id: u.id, message: data?.error || "Erro ao atualizar." });
      return;
    }
    load();
  }

  async function toggleGrant(u: User) {
    setRowError(null);
    const isGranted = subStatusByUser[u.id] === "granted";
    const res = await fetch(`/api/admin/subscriptions/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: isGranted ? "revoke" : "grant" }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setRowError({ id: u.id, message: data?.error || "Erro ao atualizar." });
      return;
    }
    load();
  }

  async function handleDelete(u: User) {
    setRowError(null);
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setRowError({ id: u.id, message: data?.error || "Erro ao excluir." });
      setConfirmDeleteId(null);
      return;
    }
    setConfirmDeleteId(null);
    load();
  }

  async function handleResetPassword(u: User) {
    setRowError(null);
    if (resetPassword.length < 8) {
      setRowError({ id: u.id, message: "Senha deve ter pelo menos 8 caracteres." });
      return;
    }
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: resetPassword }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setRowError({ id: u.id, message: data?.error || "Erro ao atualizar." });
      return;
    }
    setResetId(null);
    setResetPassword("");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-zinc-100">Usuários</h1>
      <p className="text-sm text-zinc-500">
        Cada usuário tem seus próprios produtos, vendas e clientes — ninguém vê os dados de outro.
      </p>

      <form
        onSubmit={handleCreate}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">E-mail</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input w-56"
            placeholder="cliente@exemplo.com"
            type="email"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Senha</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input w-44"
            placeholder="mínimo 8 caracteres"
            type="text"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
        >
          Criar usuário
        </button>
        {error && <p className="w-full text-sm text-red-400">{error}</p>}
      </form>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por e-mail..."
        className="input max-w-xs"
      />

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[24%]" />
            <col className="w-[9%]" />
            <col className="w-[11%]" />
            <col className="w-[13%]" />
            <col className="w-[11%]" />
            <col className="w-[32%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-2">E-mail</th>
              <th className="px-4 py-2">Papel</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Desde</th>
              <th className="px-4 py-2">Acesso</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                  Carregando...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                  Nenhum usuário encontrado para essa busca.
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => (
                <tr key={u.id} className="border-b border-zinc-900 last:border-0">
                  <td className="truncate px-4 py-2 font-medium text-zinc-200">{u.email}</td>
                  <td className="px-4 py-2 text-zinc-300">{u.role === "admin" ? "Admin" : "Usuário"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.active ? "bg-emerald-950 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      {u.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-zinc-400">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-2 text-zinc-400">
                    {u.role === "admin" ? "-" : subStatusByUser[u.id] === "granted" ? "Liberado" : "Pago"}
                  </td>
                  <td className="px-4 py-2">
                    {u.role === "admin" ? (
                      <span className="text-xs text-zinc-600">você</span>
                    ) : confirmDeleteId === u.id ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="text-xs text-zinc-400">Excluir de vez (perde os dados)?</span>
                        <button
                          onClick={() => handleDelete(u)}
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
                      </div>
                    ) : resetId === u.id ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <input
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                          className="input w-32 py-1"
                          placeholder="nova senha"
                          autoFocus
                        />
                        <button
                          onClick={() => handleResetPassword(u)}
                          className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                        >
                          salvar
                        </button>
                        <button
                          onClick={() => {
                            setResetId(null);
                            setResetPassword("");
                          }}
                          className="text-xs font-medium text-zinc-500 hover:text-zinc-300"
                        >
                          cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          onClick={() => toggleGrant(u)}
                          className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                        >
                          {subStatusByUser[u.id] === "granted" ? "revogar liberação" : "liberar acesso"}
                        </button>
                        <button
                          onClick={() => setResetId(u.id)}
                          className="text-xs font-medium text-zinc-400 hover:text-zinc-200"
                        >
                          redefinir senha
                        </button>
                        <button
                          onClick={() => toggleActive(u)}
                          className={`text-xs font-medium ${
                            u.active ? "text-zinc-500 hover:text-red-400" : "text-zinc-400 hover:text-emerald-400"
                          }`}
                        >
                          {u.active ? "desativar" : "reativar"}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(u.id)}
                          className="text-xs font-medium text-zinc-500 hover:text-red-400"
                        >
                          excluir
                        </button>
                      </div>
                    )}
                    {rowError && rowError.id === u.id && (
                      <p className="mt-1 text-right text-xs text-red-400">{rowError.message}</p>
                    )}
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
