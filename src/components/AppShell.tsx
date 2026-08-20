"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { CurrentUser } from "@/lib/auth";
import { useIdleLogout } from "@/lib/useIdleLogout";
import { useStandalone } from "@/lib/useStandalone";
import PullToRefresh from "@/components/PullToRefresh";
import TelegramLinkPopup from "@/components/TelegramLinkPopup";

const TAB_ICONS: Record<string, React.ReactNode> = {
  "/": (
    <path
      d="M3 4h2l2.6 12.4a2 2 0 0 0 2 1.6h7.4a2 2 0 0 0 2-1.6L21 8H6M10 20a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Zm7-.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  "/produtos": (
    <path
      d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3ZM4 7.5 12 12l8-4.5M12 12v9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  "/clientes": (
    <path
      d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M14.5 14.2c2.5.3 4.5 2.4 4.5 5.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  "/relatorios": <path d="M4 20V10M10 20V4M16 20v-7M20 20H4" strokeLinecap="round" strokeLinejoin="round" />,
  account: (
    <path d="M12 8a3.2 3.2 0 1 0 0 6.4A3.2 3.2 0 0 0 12 8ZM5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" strokeLinecap="round" strokeLinejoin="round" />
  ),
  admin: (
    <path
      d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3ZM9 12l2 2 4-4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

function TabIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
      {TAB_ICONS[name]}
    </svg>
  );
}

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
  const isStandalone = useStandalone();
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
  const businessNav = user.role === "admin" ? NAV : [...NAV, { href: "/assinatura", label: "Minha assinatura" }];
  // No web-app instalado, Vendas/Produtos/Clientes/Relatórios já são as
  // abas da barra de baixo — repeti-las aqui dentro do menu "Conta" é
  // redundante, então só sobra o que não está lá (ex: Minha assinatura).
  // No navegador normal (sem barra de baixo) o menu continua completo.
  const menuPanelNav = isStandalone ? businessNav.filter((item) => !NAV.some((n) => n.href === item.href)) : businessNav;
  const adminNav =
    user.role === "admin"
      ? [
          { href: "/usuarios", label: "Usuários" },
          { href: "/admin/assinaturas", label: "Assinaturas" },
          { href: "/admin/convites", label: "Apadrinhamento" },
          { href: "/admin/log", label: "Log" },
        ]
      : [];

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
      {/* Admin já tem canal de alerta próprio fixo (TELEGRAM_CHAT_ID via env) —
          esse popup é só pra clientes vincularem o Telegram deles. */}
      {user.role !== "admin" && <TelegramLinkPopup />}
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
            <Link href="/" aria-label="Início" className="group flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition group-hover:bg-zinc-900 group-hover:text-zinc-200">
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path
                    d="M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/strix-wordmark.png" alt="STRIX" className="h-4 w-auto opacity-90 transition group-hover:opacity-100" />
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              {businessNav.map((item) => (
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
              {adminNav.length > 0 && <div className="mx-1 h-5 w-px bg-zinc-800" />}
              {adminNav.map((item) => (
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
            className={`flex h-9 w-9 items-center justify-center rounded-md text-zinc-300 hover:bg-zinc-900 md:hidden ${
              isStandalone ? "hidden" : ""
            }`}
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
              {menuPanelNav.map((item) => (
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
              {adminNav.length > 0 && <div className="my-2 border-t border-zinc-800" />}
              {adminNav.map((item) => (
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
        <main className={`mx-auto max-w-6xl px-4 py-6 ${isStandalone ? "pb-[calc(64px+env(safe-area-inset-bottom))]" : ""}`}>
          {children}
        </main>
      </PullToRefresh>
      {isStandalone && (
        <nav
          role="navigation"
          aria-label="Navegação principal"
          className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
          {NAV.map((item) => {
            // Com o menu "Conta" aberto, ele é quem está em foco — a aba de
            // rota (ex: Relatórios) não deveria continuar acesa junto,
            // senão parece que duas abas estão ativas ao mesmo tempo.
            const active = pathname === item.href && !menuOpen;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
                  active ? "text-[#8148e9]" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <TabIcon name={item.href} />
                {item.label}
              </Link>
            );
          })}
          {user.role === "admin" ? (
            // Admin não tem uma página única — "Admin" abre o menu com
            // Usuários/Assinaturas/Log pra escolher.
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
                menuOpen ? "text-[#8148e9]" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <TabIcon name="admin" />
              Admin
            </button>
          ) : (
            // Igual às outras abas: navega direto pra página de assinatura,
            // sem menu suspenso no meio do caminho.
            <Link
              href="/assinatura"
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
                pathname === "/assinatura" ? "text-[#8148e9]" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <TabIcon name="account" />
              Conta
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
