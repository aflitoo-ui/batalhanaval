"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Login não é mais um e-mail (ver src/lib/schemas.ts) — impede digitar
// caracteres que lembrem um, pra ninguém acabar escolhendo um login no
// formato antigo por hábito.
function sanitizeLogin(value: string) {
  return value.replace(/@/g, "").replace(/\.com/gi, "");
}

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("c") || "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao criar conta.");
        setLoading(false);
        return;
      }
      sessionStorage.removeItem("strix_banner_seen");
      localStorage.setItem("strix_last_activity", String(Date.now()));
      router.push("/");
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setLoading(false);
    }
  }

  if (!code) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="mb-4 text-2xl font-bold tracking-tight text-[#946ce0]">STRIX</h1>
          <p className="text-sm text-zinc-400">
            Esse link de cadastro está incompleto. Peça pra quem te convidou mandar o link de novo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-2xl font-bold tracking-tight text-[#946ce0]">STRIX</h1>
        <p className="mb-8 text-center text-sm text-zinc-500">Você foi convidado — crie sua conta.</p>
        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">Login</label>
            <input
              type="text"
              required
              autoFocus
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(sanitizeLogin(e.target.value))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-[#946ce0]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">Senha</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-[#946ce0]"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#3c1a7b] py-2 font-medium text-white transition hover:bg-[#5224a8] disabled:opacity-60"
          >
            {loading ? "Criando conta..." : "Criar conta"}
          </button>
        </form>
      </div>
    </div>
  );
}
