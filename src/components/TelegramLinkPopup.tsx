"use client";

import { useEffect, useState } from "react";

type LinkStatus =
  | { linked: true }
  | { linked: false; dismissed: true }
  | { linked: false; dismissed: false; deepLink: string | null };

// Gating vem do servidor (GET /api/account/telegram-link), não de
// sessionStorage — diferente do aviso de assinatura em AppShell, que some
// sozinho depois de alguns segundos e só reaparece no próximo login. Esse
// popup fica visível até o usuário vincular ou dispensar de vez — mas
// sempre dá pra fechar na hora (botão ✕, Esc, clique fora) sem que isso
// conte como "não tenho Telegram" (isso só a ação explícita faz).
export default function TelegramLinkPopup() {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [closedThisSession, setClosedThisSession] = useState(false);
  const [waitingLink, setWaitingLink] = useState(false);

  async function load() {
    const res = await fetch("/api/account/telegram-link");
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (data) setStatus(data);
    return data as LinkStatus | null;
  }

  useEffect(() => {
    void load();
  }, []);

  // Depois de clicar em "Vincular Telegram", o usuário some pra outra aba
  // (o Telegram) e volta — não tem como saber em tempo real quando ele
  // aperta "Iniciar" lá, então rechecamos assim que a aba volta a ficar
  // visível (e a cada alguns segundos enquanto isso) até confirmar o
  // vínculo, mesmo padrão já usado na tela de assinatura pra detectar
  // pagamento aprovado sem precisar de F5.
  useEffect(() => {
    if (!waitingLink) return;
    let cancelled = false;

    async function check() {
      const data = await load();
      if (!cancelled && data?.linked) setWaitingLink(false);
    }

    const interval = setInterval(check, 4000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [waitingLink]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setClosedThisSession(true);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  async function handleDismiss() {
    setClosedThisSession(true);
    await fetch("/api/account/telegram-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    }).catch(() => {});
  }

  if (!status || status.linked || status.dismissed || closedThisSession) return null;
  if (!status.deepLink) return null; // TELEGRAM_BOT_USERNAME não configurado — nada pra mostrar

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && setClosedThisSession(true)}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
    >
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h2 className="text-base font-bold text-zinc-100">Vincular Telegram</h2>
          <button
            onClick={() => setClosedThisSession(true)}
            aria-label="Fechar"
            className="shrink-0 text-zinc-500 hover:text-zinc-300"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-sm text-zinc-400">
          Vincule seu Telegram: avisos de vencimento e redefinição de senha chegam direto por lá — sem
          compartilhar telefone.
        </p>
        <p className="mt-2 text-sm font-medium text-emerald-400">🎁 Ganhe +5 dias de acesso ao vincular.</p>
        <a
          href={status.deepLink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setWaitingLink(true)}
          className="mt-4 block w-full rounded-lg bg-[#3c1a7b] py-2 text-center font-medium text-white transition hover:bg-[#5224a8]"
        >
          Vincular Telegram
        </a>
        {waitingLink && <p className="mt-2 text-center text-xs text-zinc-500">Aguardando confirmação...</p>}
        <button
          onClick={handleDismiss}
          className="mt-3 w-full text-center text-sm text-zinc-500 hover:text-zinc-300"
        >
          Não tenho Telegram
        </button>
      </div>
    </div>
  );
}
