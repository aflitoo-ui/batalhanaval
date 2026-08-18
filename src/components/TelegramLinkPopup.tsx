"use client";

import { useEffect, useState } from "react";

type LinkStatus =
  | { linked: true }
  | { linked: false; dismissed: true }
  | { linked: false; dismissed: false; deepLink: string | null };

// Gating vem do servidor (GET /api/account/telegram-link), não de
// sessionStorage — diferente do aviso de assinatura em AppShell, que some
// sozinho depois de alguns segundos e só reaparece no próximo login. Esse
// popup fica visível até o usuário vincular (o que só some no próximo
// carregamento, já que o clique em "Vincular" não é acompanhado em tempo
// real) ou dispensar de vez.
export default function TelegramLinkPopup() {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [dismissedThisSession, setDismissedThisSession] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/account/telegram-link");
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data) setStatus(data);
    })();
  }, []);

  async function handleDismiss() {
    setDismissedThisSession(true);
    await fetch("/api/account/telegram-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    }).catch(() => {});
  }

  if (!status || status.linked || status.dismissed || dismissedThisSession) return null;
  if (!status.deepLink) return null; // TELEGRAM_BOT_USERNAME não configurado — nada pra mostrar

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-base font-bold text-zinc-100">Vincular Telegram</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Vincule seu Telegram pra ser avisado por lá antes do seu acesso terminar — sem precisar
          compartilhar telefone, só o Telegram mesmo.
        </p>
        <p className="mt-2 text-sm font-medium text-emerald-400">🎁 Ganhe +5 dias de acesso ao vincular.</p>
        <a
          href={status.deepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block w-full rounded-lg bg-[#3c1a7b] py-2 text-center font-medium text-white transition hover:bg-[#5224a8]"
        >
          Vincular Telegram
        </a>
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
