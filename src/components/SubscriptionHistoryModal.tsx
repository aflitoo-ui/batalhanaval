"use client";

import { useEffect, useState } from "react";

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

const STATUS_LABEL: Record<string, string> = {
  trialing: "Teste grátis",
  active: "Ativa",
  granted: "Liberada",
  pending: "Aguardando pagamento",
  past_due: "Inadimplente",
  canceled: "Cancelada",
  expired: "Expirada",
};

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function SubscriptionHistoryModal({ userId, onClose }: { userId: number; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/admin/subscriptions/${userId}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Erro ao carregar histórico.");
        setLoading(false);
        return;
      }
      setEmail(data.email);
      setSubscription(data.subscription);
      setHistory(data.history || []);
      setLoading(false);
    })();
  }, [userId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
    >
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="truncate text-base font-bold text-zinc-100">{email || "Histórico"}</h2>
          <button onClick={onClose} className="shrink-0 text-zinc-500 hover:text-zinc-300">
            ✕
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500">Carregando...</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : !subscription ? (
          <p className="text-sm text-zinc-500">Esse usuário não tem assinatura.</p>
        ) : (
          <>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-200">{subscription.planName}</p>
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-300">
                  {STATUS_LABEL[subscription.status] || subscription.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">{formatBRL(subscription.price)}/mês</p>
              {subscription.currentPeriodEnd && (
                <p className="mt-2 text-xs text-zinc-400">
                  Próxima cobrança: <span className="text-zinc-200">{formatDate(subscription.currentPeriodEnd)}</span>
                </p>
              )}
            </div>

            <h3 className="mb-2 mt-4 text-sm font-semibold text-zinc-200">
              Histórico de pagamentos {history.length > 0 && `(${history.length})`}
            </h3>
            {history.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhum pagamento registrado ainda.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b border-zinc-800 last:border-0">
                      <td className="py-1.5 text-zinc-400">{formatDate(h.paidAt)}</td>
                      <td className="py-1.5 text-zinc-300">{h.status}</td>
                      <td className="py-1.5 text-right text-zinc-200">{formatBRL(h.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
