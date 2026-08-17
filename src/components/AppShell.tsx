"use client";

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
  // trialing (padrão)
  return daysLeft > 0 ? `Teste grátis: ${dias} restante${daysLeft === 1 ? "" : "s"}.` : "Seu teste grátis termina hoje.";
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
  const nav =
    user.role === "admin"
      ? [...NAV, { href: "/usuarios", label: "Usuários" }, { href: "/admin/assinaturas", label: "Assinaturas" }]
      : [...NAV, { href: "/assinatura", label: "Minha assinatura" }];

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
            <nav className="flex gap-1">
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
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-500">{user.email}</span>
            <button
              onClick={handleLogout}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200"
            >
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
