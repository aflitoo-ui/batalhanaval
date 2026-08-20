"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useIdleLogout } from "@/lib/useIdleLogout";

const IDLE_LOGOUT_MS = 10 * 60 * 1000;

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
  daysLeft: number | null;
};

type HistoryItem = { id: number; amount: number; status: string; paidAt: string | null };

type TelegramStatus = { linked: true } | { linked: false; dismissed: boolean; deepLink: string | null };

type InviteStatus = { credits: number; invites: { code: string; createdAt: string }[] };

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
  granted: "Liberada",
  pending: "Aguardando pagamento",
  past_due: "Pagamento atrasado",
  canceled: "Cancelada",
  expired: "Expirada",
  none: "Sem assinatura",
};

const HISTORY_STATUS_LABEL: Record<string, string> = {
  approved: "Pago",
  refunded: "Reembolsado",
  chargeback: "Estorno",
};

export default function AssinaturaPage() {
  const router = useRouter();
  useIdleLogout(IDLE_LOGOUT_MS);
  const [access, setAccess] = useState<AccessStatus | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsCpfCnpj, setNeedsCpfCnpj] = useState(false);
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [needsBillingEmail, setNeedsBillingEmail] = useState(false);
  const [billingEmailInput, setBillingEmailInput] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [waitingPayment, setWaitingPayment] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [inviteStatus, setInviteStatus] = useState<InviteStatus | null>(null);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/subscriptions/me");
    const data = await res.json();
    setAccess(data.access);
    setSubscription(data.subscription);
    setHistory(data.history || []);
    setLoading(false);
    return data.subscription as Subscription | null;
  }

  async function loadTelegramStatus() {
    const res = await fetch("/api/account/telegram-link");
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    if (data) setTelegramStatus(data);
  }

  async function loadInviteStatus() {
    const res = await fetch("/api/account/invite");
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    if (data) setInviteStatus(data);
  }

  useEffect(() => {
    void load();
    void loadTelegramStatus();
    void loadInviteStatus();
  }, []);

  async function handleGenerateInvite() {
    setInviteError(null);
    setGeneratingInvite(true);
    const res = await fetch("/api/account/invite", { method: "POST" });
    const data = await res.json().catch(() => null);
    setGeneratingInvite(false);
    if (!res.ok) {
      setInviteError(data?.error || "Erro ao gerar convite.");
      return;
    }
    void loadInviteStatus();
  }

  function handleCopyInvite(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  }

  // Depois de abrir a fatura numa aba nova, fica de olho sozinho — o
  // pagamento acontece lá fora (Asaas) e só sabemos que confirmou quando o
  // webhook atualizar o banco, então rechecamos periodicamente (e assim que
  // o usuário volta pra essa aba) até o status virar "active" ou desistir
  // depois de uns minutos.
  useEffect(() => {
    if (!waitingPayment) return;
    let cancelled = false;
    let attempts = 0;

    async function poll() {
      attempts++;
      const sub = await load();
      if (cancelled) return;
      if (sub?.status === "active") {
        setWaitingPayment(false);
        setInfo("Pagamento confirmado! Sua assinatura está ativa.");
      } else if (attempts >= 40) {
        setWaitingPayment(false);
      }
    }

    const interval = setInterval(poll, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [waitingPayment]);

  async function handleSubscribe(opts: { force?: boolean; skipBillingEmail?: boolean } = {}) {
    setError(null);
    setInfo(null);
    if (needsCpfCnpj && cpfCnpj.replace(/\D/g, "").length < 11) {
      setError("Informe um CPF ou CNPJ válido.");
      return;
    }
    if (needsBillingEmail && !opts.skipBillingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmailInput.trim())) {
      setError("Informe um e-mail válido, ou escolha não informar.");
      return;
    }
    setStarting(true);
    const res = await fetch("/api/subscriptions/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(needsCpfCnpj ? { cpfCnpj } : {}),
        ...(needsBillingEmail
          ? opts.skipBillingEmail
            ? { skipBillingEmail: true }
            : { billingEmail: billingEmailInput.trim() }
          : {}),
        ...(opts.force ? { force: true } : {}),
      }),
    });
    const data = await res.json().catch(() => null);
    setStarting(false);
    if (!res.ok) {
      if (data?.code === "cpf_cnpj_required") {
        setNeedsCpfCnpj(true);
        setError(needsCpfCnpj ? "CPF/CNPJ inválido — confira os números." : null);
        return;
      }
      if (data?.code === "billing_email_required") {
        setNeedsBillingEmail(true);
        setError(null);
        return;
      }
      setError(data?.error || "Erro ao iniciar assinatura.");
      return;
    }
    window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
    setInfo("Abrimos a fatura em uma nova aba. Depois de pagar, o acesso libera sozinho aqui.");
    setWaitingPayment(true);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
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
      <div className="flex items-start justify-between">
        <div>
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
            <h1 className="text-xl font-bold text-zinc-100">Minha assinatura</h1>
          </div>
          {access?.allowed && (
            <Link href="/" className="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-300">
              voltar pro sistema
            </Link>
          )}
        </div>
        <div className="flex items-center gap-1">
          <a
            href="https://t.me/nick_ki"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200"
          >
            Suporte
          </a>
          <button
            onClick={handleLogout}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200"
          >
            Sair
          </button>
        </div>
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

            {subscription.daysLeft !== null && (
              <p className="mt-3 text-sm text-amber-400">
                {(() => {
                  const d = subscription.daysLeft!;
                  const dias = d > 0 ? `${d} dia${d === 1 ? "" : "s"}` : null;
                  if (subscription.status === "trialing") {
                    return dias ? `Você tem ${dias} restante${d === 1 ? "" : "s"} de teste grátis.` : "Seu teste grátis termina hoje.";
                  }
                  if (subscription.status === "canceled") {
                    return dias
                      ? `Assinatura cancelada — o acesso termina em ${dias}.`
                      : "Assinatura cancelada — o acesso termina hoje.";
                  }
                  if (subscription.status === "granted") {
                    return dias ? `Acesso liberado — termina em ${dias}.` : "Acesso liberado — termina hoje.";
                  }
                  if (subscription.status === "pending") {
                    return dias
                      ? `Fatura gerada — seu acesso continua liberado por ${dias}. Pague antes disso pra não perder o acesso.`
                      : "Fatura gerada — seu acesso termina hoje se não pagar.";
                  }
                  // active
                  return dias ? `Vence em ${dias}.` : "Vence hoje.";
                })()}
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

            {needsCpfCnpj && (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-zinc-400">CPF ou CNPJ (necessário pra gerar o pagamento)</label>
                <input
                  value={cpfCnpj}
                  onChange={(e) => setCpfCnpj(e.target.value)}
                  className="input max-w-xs"
                  placeholder="Só números"
                  inputMode="numeric"
                  autoFocus
                />
              </div>
            )}

            {needsBillingEmail && (
              <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <p className="text-xs text-zinc-400">
                  Esse e-mail é só pra Asaas te mandar a fatura de pagamento (boleto/Pix/cartão). Se preferir não
                  informar, você não recebe a fatura por e-mail — o pagamento continua funcionando normalmente,
                  você só acompanha por aqui.
                </p>
                <label className="mb-1 mt-2 block text-xs font-medium text-zinc-400">E-mail pra fatura (opcional)</label>
                <input
                  value={billingEmailInput}
                  onChange={(e) => setBillingEmailInput(e.target.value)}
                  className="input max-w-xs"
                  placeholder="seuemail@exemplo.com"
                  inputMode="email"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleSubscribe({ skipBillingEmail: true })}
                  disabled={starting}
                  className="mt-2 block text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-300 disabled:opacity-60"
                >
                  Prefiro não informar
                </button>
              </div>
            )}

            {info && <p className="mt-3 text-sm text-emerald-400">{info}</p>}
            {waitingPayment && <p className="mt-1 text-xs text-zinc-500">Checando pagamento...</p>}
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

            <div className="mt-5 flex gap-3">
              {(subscription.status === "trialing" ||
                subscription.status === "granted" ||
                subscription.status === "expired" ||
                subscription.status === "canceled" ||
                subscription.status === "past_due" ||
                subscription.status === "pending") && (
                <div>
                  <button
                    onClick={() => handleSubscribe()}
                    disabled={starting}
                    className="rounded-lg bg-[#946ce0] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#a883e8] disabled:opacity-60"
                  >
                    {starting
                      ? "Abrindo pagamento..."
                      : subscription.status === "pending"
                        ? "Continuar pagamento"
                        : "Assinar agora"}
                  </button>
                  {subscription.status === "pending" && (
                    <button
                      onClick={() => handleSubscribe({ force: true })}
                      disabled={starting}
                      className="mt-3 block py-1 text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-300 disabled:opacity-60"
                    >
                      Link não funciona? Gerar um novo
                    </button>
                  )}
                </div>
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

      {telegramStatus && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-1 text-sm font-semibold text-zinc-200">Telegram</h2>
          {telegramStatus.linked ? (
            <>
              <p className="text-sm text-zinc-400">✅ Telegram vinculado — você recebe avisos por lá.</p>
              <p className="mt-2 text-xs text-zinc-500">
                Quer vincular outro Telegram?{" "}
                <a
                  href="https://t.me/nick_ki"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-zinc-300"
                >
                  Fale com o suporte
                </a>
                .
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-400">
                Vincule seu Telegram: avisos de vencimento e redefinição de senha chegam direto por lá.
              </p>
              <p className="mt-2 text-sm font-medium text-emerald-400">🎁 Ganhe +5 dias de acesso ao vincular.</p>
              {telegramStatus.deepLink && (
                <a
                  href={telegramStatus.deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block rounded-lg bg-[#946ce0] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#a883e8]"
                >
                  Vincular Telegram
                </a>
              )}
            </>
          )}
        </div>
      )}

      {inviteStatus && (inviteStatus.credits > 0 || inviteStatus.invites.length > 0) && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-1 text-sm font-semibold text-zinc-200">Convide um amigo</h2>
          <p className="text-sm text-zinc-400">
            Você tem {inviteStatus.credits} convite{inviteStatus.credits === 1 ? "" : "s"} disponíve
            {inviteStatus.credits === 1 ? "l" : "is"}.
          </p>

          {inviteStatus.invites.map((inv) => (
            <button
              key={inv.code}
              onClick={() => handleCopyInvite(inv.code)}
              className="mt-3 flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-left transition hover:bg-zinc-900"
            >
              <code className="flex-1 truncate text-sm text-zinc-200">{inv.code}</code>
              <span className="shrink-0 rounded-md bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-200">
                {copiedCode === inv.code ? "Copiado!" : "Copiar"}
              </span>
            </button>
          ))}

          {inviteStatus.credits > 0 && (
            <button
              onClick={handleGenerateInvite}
              disabled={generatingInvite}
              className="mt-3 rounded-lg bg-[#946ce0] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#a883e8] disabled:opacity-60"
            >
              {generatingInvite ? "Gerando..." : "Gerar código de convite"}
            </button>
          )}
          {inviteError && <p className="mt-2 text-xs text-red-400">{inviteError}</p>}
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-200">Histórico de assinaturas</h2>
          <table className="w-full text-sm">
            <tbody>
              {(showAllHistory ? history : history.slice(0, 8)).map((h) => (
                <tr key={h.id} className="border-b border-zinc-900 last:border-0">
                  <td className="py-1.5 text-zinc-400">{formatDate(h.paidAt)}</td>
                  <td className="py-1.5 text-zinc-300">
                    {h.status === "telegram_bonus" ? "🎁 Bônus Telegram" : HISTORY_STATUS_LABEL[h.status] || h.status}
                  </td>
                  <td className="py-1.5 text-right text-zinc-200">
                    {h.status === "telegram_bonus" ? `+${h.amount}d` : formatBRL(h.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.length > 8 && (
            <button
              onClick={() => setShowAllHistory((v) => !v)}
              className="mt-3 text-xs font-medium text-zinc-500 transition hover:text-zinc-300"
            >
              {showAllHistory ? "Mostrar menos" : `Ver histórico completo (${history.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
