"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AccessStatus = {
  allowed: boolean;
  status: "trialing" | "active" | "pending" | "past_due" | "canceled" | "expired" | "none";
  daysLeft?: number;
};

type Subscription = {
  id: number;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  planName: string;
  price: number;
};

type HistoryItem = { id: number; amount: number; status: string; paidAt: string | null };

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("pt-BR");
}

const STATUS_LABEL: Record<string, string> = {
  trialing: "Teste grátis",
  active: "Ativa",
  pending: "Aguardando pagamento",
  past_due: "Pagamento atrasado",
  canceled: "Cancelada",
  expired: "Expirada",
  none: "Sem assinatura",
};

export default function AssinaturaPage() {
  const [access, setAccess] = useState<AccessStatus | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/subscriptions/me");
    const data = await res.json();
    setAccess(data.access);
    setSubscription(data.subscription);
    setHistory(data.history || []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleSubscribe() {
    setError(null);
    setStarting(true);
    const res = await fetch("/api/subscriptions/checkout", { method: "POST" });
    const data = await res.json().catch(() => null);
    setStarting(false);
    if (!res.ok) {
      setError(data?.error || "Erro ao iniciar assinatura.");
      return;
    }
    window.location.href = data.checkoutUrl;
  }

  async function handleCancel() {
    setError(null);
    setCanceling(true);
    const res = await fetch("/api/subscriptions/cancel", { method: "POST" });
    const data = await res.json().catch(() => null);
    setCanceling(false);
    if (!res.ok) {
      setError(data?.error || "Erro ao cancelar.");
      return;
    }
    load();
  }

  if (loading) {
    return <div className="mx-auto max-w-xl px-4 py-10 text-sm text-zinc-500">Carregando...</div>;
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Minha assinatura</h1>
        {access?.allowed && (
          <Link href="/" className="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-300">
            voltar pro sistema
          </Link>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        {subscription ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-zinc-100">{subscription.planName}</p>
                <p className="text-sm text-zinc-500">{formatBRL(subscription.price)}/mês</p>
              </div>
              <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300">
                {STATUS_LABEL[subscription.status] || subscription.status}
              </span>
            </div>

            {subscription.status === "trialing" && access && (
              <p className="mt-3 text-sm text-amber-400">
                {access.daysLeft && access.daysLeft > 0
                  ? `${access.daysLeft} dia${access.daysLeft === 1 ? "" : "s"} restante${access.daysLeft === 1 ? "" : "s"} do seu teste grátis.`
                  : "Seu teste grátis termina hoje."}
              </p>
            )}

            {!access?.allowed && (
              <p className="mt-3 text-sm text-red-400">
                Seu acesso está bloqueado. Assine para continuar usando o STRIX.
              </p>
            )}

            {subscription.currentPeriodEnd && (
              <p className="mt-3 text-sm text-zinc-400">
                Próxima cobrança: <span className="text-zinc-200">{formatDate(subscription.currentPeriodEnd)}</span>
              </p>
            )}

            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

            <div className="mt-5 flex gap-3">
              {(subscription.status === "trialing" ||
                subscription.status === "expired" ||
                subscription.status === "canceled" ||
                subscription.status === "past_due") && (
                <button
                  onClick={handleSubscribe}
                  disabled={starting}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
                >
                  {starting ? "Abrindo pagamento..." : "Assinar agora"}
                </button>
              )}
              {subscription.status === "active" && (
                <button
                  onClick={handleCancel}
                  disabled={canceling}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-60"
                >
                  {canceling ? "Cancelando..." : "Cancelar assinatura"}
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-500">Nenhuma assinatura encontrada. Fale com o administrador.</p>
        )}
      </div>

      {history.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-200">Histórico de pagamentos</h2>
          <table className="w-full text-sm">
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-zinc-900 last:border-0">
                  <td className="py-1.5 text-zinc-400">{formatDate(h.paidAt)}</td>
                  <td className="py-1.5 text-zinc-300">{h.status}</td>
                  <td className="py-1.5 text-right text-zinc-200">{formatBRL(h.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
