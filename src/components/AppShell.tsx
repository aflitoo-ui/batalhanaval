"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { CurrentUser } from "@/lib/auth";
import { useIdleLogout } from "@/lib/useIdleLogout";
import PullToRefresh from "@/components/PullToRefresh";

const IDLE_LOGOUT_MS = 10 * 60 * 1000;

const NAV = [
  { href: "/", label: "Vendas" },
  { href: "/produtos", label: "Produtos" },
  { href: "/clientes", label: "Clientes" },
  { href: "/relatorios", label: "Relatórios" },
];

const SUPPORT_URL = "https://t.me/nick_ki";

function SupportLink({ className }: { className: string }) {
  return (
    <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className={className}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M21.5 3.5 2.7 10.9c-1.3.5-1.3 1.2-.2 1.6l4.8 1.5 1.9 5.7c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.2-.4-1.7-1.4-1.3ZM8.8 13.5l9.5-6c.5-.3.9-.1.6.2l-8 7.4-.3 3.1-1.4-4.1Z" />
      </svg>
      Suporte
    </a>
  );
}

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
    return daysLeft > 0 ? `Seu acesso termina em: ${dias}.` : "Seu acesso termina hoje.";
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
  const [bannerVisible, setBannerVisible] = useState(false);
  useIdleLogout(IDLE_LOGOUT_MS);

  // Mostra o aviso de assinatura por só 5s e some sozinho — reaparece de
  // novo só no próximo login (a marca fica em sessionStorage, que o
  // LoginForm limpa a cada login bem-sucedido), não a cada navegação.
  useEffect(() => {
    if (daysLeft === undefined) return;
    if (sessionStorage.getItem("strix_banner_seen")) return;
    setBannerVisible(true);
    const t = setTimeout(() => {
      setBannerVisible(false);
      sessionStorage.setItem("strix_banner_seen", "1");
    }, 5000);
    return () => clearTimeout(t);
  }, [daysLeft]);
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
    <div className="min-h-screen bg-zinc-950 pt-[env(safe-area-inset-top)] text-zinc-100">
      {bannerVisible && (
        <div className="border-b border-amber-900/50 bg-amber-950/40 px-4 py-1.5 text-center text-sm text-amber-300">
          {subscriptionStatusMessage(subscriptionStatus, daysLeft ?? 0)}{" "}
          <Link href="/assinatura" className="font-medium underline underline-offset-2">
            {subscriptionStatus === "canceled" ? "Ver assinatura" : "Assinar agora"}
          </Link>
        </div>
      )}
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Link
                href="/"
                aria-label="Início"
                className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200"
              >
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path
                    d="M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
              <span className="text-lg font-bold tracking-tight text-[#946ce0]">STRIX</span>
            </div>
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
            <SupportLink className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200" />
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
              <div className="flex shrink-0 items-center gap-1">
                <SupportLink className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200" />
                <button
                  onClick={handleLogout}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200"
                >
                  Sair
                </button>
              </div>
            </div>
          </div>
        )}
      </header>
      <PullToRefresh>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </PullToRefresh>
    </div>
  );
}
