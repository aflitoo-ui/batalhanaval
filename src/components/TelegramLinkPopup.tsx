"use client";

import { useCallback, useEffect, useState } from "react";

type LinkStatus = { linked: true } | { linked: false; dismissed: boolean; deepLink: string | null };

// De propósito, não existe dispensa permanente — nem "não tenho Telegram"
// impede o popup de voltar no próximo login. É uma decisão consciente: dá
// pra fechar (✕, Esc, clique fora ou "não tenho Telegram") e seguir usando
// o sistema normalmente na hora, mas como vincular resolve tanto avisos
// quanto redefinição de senha, vale insistir a cada login em vez de deixar
// a pessoa escapar disso de vez. O dismiss é persistido no servidor
// (telegram_popup_dismissed) pra sobreviver a um F5/nova aba dentro do
// mesmo login — sem isso, fechar só durava até a próxima navegação, e o
// popup voltava a cada troca de página, não só a cada login (o login reseta
// esse campo pra false, é isso que faz ele voltar da próxima vez).
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

  const dismiss = useCallback(() => {
    setClosedThisSession(true);
    void fetch("/api/account/telegram-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    });
  }, []);

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
      if (e.key === "Escape") dismiss();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dismiss]);

  if (!status || status.linked || status.dismissed || closedThisSession) return null;
  if (!status.deepLink) return null; // TELEGRAM_BOT_USERNAME não configurado — nada pra mostrar

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && dismiss()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 pb-[env(safe-area-inset-bottom)] pt-[calc(env(safe-area-inset-top)+1rem)]"
    >
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h2 className="text-base font-bold text-zinc-100">Vincular Telegram</h2>
          <button
            onClick={dismiss}
            aria-label="Fechar"
            className="shrink-0 text-zinc-500 hover:text-zinc-300"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-sm text-zinc-400">
          Vincule seu Telegram: avisos de vencimento e redefinição de senha chegam direto por lá.
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
          onClick={dismiss}
          className="mt-3 w-full text-center text-sm text-zinc-500 hover:text-zinc-300"
        >
          Não tenho Telegram
        </button>
      </div>
    </div>
  );
}
