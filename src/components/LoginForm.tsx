"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EyeIcon } from "./EyeIcon";

// Login não é mais um e-mail (ver src/lib/schemas.ts) — impede digitar
// caracteres que lembrem um.
function sanitizeLogin(value: string) {
  return value.replace(/@/g, "").replace(/\.com/gi, "");
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

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
            <label className="mb-1 block text-sm font-medium text-zinc-300">Login</label>
            <div className="relative">
              <input
                ref={emailRef}
                type="text"
                required
                autoFocus
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(sanitizeLogin(e.target.value))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 pr-9 text-zinc-100 outline-none focus:border-[#946ce0]"
              />
              {email && (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Limpar login"
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
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 pr-9 text-zinc-100 outline-none focus:border-[#946ce0]"
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-zinc-500 hover:text-zinc-300"
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
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
        <Link
          href="/cadastro"
          className="mt-4 block text-center text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
        >
          Tenho um convite — criar conta
        </Link>
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
