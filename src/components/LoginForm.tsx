"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const EMAIL_SUFFIX = "@cliente.com";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState(EMAIL_SUFFIX);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // A maioria dos clientes loga como "usuario@cliente.com" — deixa o
  // domínio pronto e o cursor antes do "@" pra só digitar o usuário. Quem
  // usa outro domínio (ex: o próprio dono) apaga com o botão "×" ao lado.
  function focusEmailStart(el: HTMLInputElement) {
    if (el.value === EMAIL_SUFFIX) {
      requestAnimationFrame(() => el.setSelectionRange(0, 0));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao entrar.");
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-center text-2xl font-bold tracking-tight text-[#946ce0]">STRIX</h1>
        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">E-mail</label>
            <div className="relative">
              <input
                ref={emailRef}
                type="text"
                inputMode="email"
                required
                autoFocus
                autoComplete="off"
                value={email}
                onFocus={(e) => focusEmailStart(e.currentTarget)}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 pr-9 text-zinc-100 outline-none focus:border-[#946ce0]"
              />
              {email && (
                <button
                  type="button"
                  aria-label="Limpar e-mail"
                  onClick={() => {
                    setEmail("");
                    emailRef.current?.focus();
                  }}
                  className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-zinc-500 hover:text-zinc-300"
                >
                  ×
                </button>
              )}
            </div>
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
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
        <a
          href="https://t.me/nick_ki"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block text-center text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
        >
          Problemas para entrar? Fale com o suporte
        </a>
      </div>
    </div>
  );
}
