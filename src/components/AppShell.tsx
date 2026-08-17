"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { CurrentUser } from "@/lib/auth";

const NAV = [
  { href: "/", label: "Vendas" },
  { href: "/produtos", label: "Produtos" },
  { href: "/relatorios", label: "Relatórios" },
];

function subscriptionStatusMessage(status: string | undefined, daysLeft: number) {
  const dias = `${daysLeft} dia${daysLeft === 1 ? "" : "s"}`;
  if (status === "canceled") {
    return daysLeft > 0
      ? `Sua assinatura foi cancelada e o acesso termina em ${dias}.`
      : "Sua assinatura cancelada termina hoje.";
  }
  if (status === "active") {
    return daysLeft > 0 ? `Sua assinatura vence em ${dias}.` : "Sua assinatura vence hoje.";
  }
  if (status === "granted") {
    return daysLeft > 0 ? `Seu acesso liberado termina em ${dias}.` : "Seu acesso liberado termina hoje.";
  }
  // trialing (padrão)
  return daysLeft > 0 ? `Você tem ${dias} restante${daysLeft === 1 ? "" : "s"} de teste grátis.` : "Seu teste grátis termina hoje.";
}

export default function AppShell({
  user,
  daysLeft,
  subscriptionStatus,
  children,
}: {
  user: CurrentUser;
  daysLeft?: number;
  subscriptionStatus?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const nav =
    user.role === "admin"
      ? [...NAV, { href: "/usuarios", label: "Usuários" }, { href: "/admin/assinaturas", label: "Assinaturas" }]
      : [...NAV, { href: "/assinatura", label: "Minha assinatura" }];

  // Fecha o menu mobile sozinho quando a rota muda (clicou num link).
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {daysLeft !== undefined && (
        <div className="border-b border-amber-900/50 bg-amber-950/40 px-4 py-1.5 text-center text-sm text-amber-300">
          {subscriptionStatusMessage(subscriptionStatus, daysLeft)}{" "}
          <Link href="/assinatura" className="font-medium underline underline-offset-2">
            {subscriptionStatus === "canceled" ? "Ver assinatura" : "Assinar agora"}
          </Link>
        </div>
      )}
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold tracking-tight">STRIX</span>
            <nav className="hidden gap-1 md:flex">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    pathname === item.href
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <span className="text-sm text-zinc-500">{user.email}</span>
            <button
              onClick={handleLogout}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200"
            >
              Sair
            </button>
          </div>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Abrir menu"
            className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-300 hover:bg-zinc-900 md:hidden"
          >
            {menuOpen ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-zinc-800 px-4 py-3 md:hidden">
            <nav className="flex flex-col gap-1">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                    pathname === item.href
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-3">
              <span className="truncate text-sm text-zinc-500">{user.email}</span>
              <button
                onClick={handleLogout}
                className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200"
              >
                Sair
              </button>
            </div>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
