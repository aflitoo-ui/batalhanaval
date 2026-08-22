"use client";

import { useEffect, useState } from "react";
import { useStandalone } from "@/lib/useStandalone";

const DISMISS_KEY = "strix_install_dismissed_at";
// iOS não expõe nenhuma forma de saber se o site já tem ícone na tela
// inicial — quem instalou mas volta a abrir pelo Safari (em vez do ícone)
// não tem como ser diferenciado de quem nunca instalou. Um dismiss
// permanente arriscava enterrar o convite pra quem ainda não instalou; um
// dismiss só até o próximo login incomodava demais quem já instalou.
// Meio-termo: some por alguns dias, reaparece depois.
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};

// Só aparece em navegador comum de celular (nunca no PC, nunca já
// instalado) — md:hidden cobre a largura, isStandalone cobre "já é PWA".
// beforeinstallprompt também dispara no Chrome de desktop, então sem o
// md:hidden esse banner vazaria pra quem usa pelo computador.
export function InstallBanner() {
  const isStandalone = useStandalone();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY));
    setDismissed(Boolean(dismissedAt) && Date.now() - dismissedAt < SNOOZE_MS);
    setIsIos(/iPhone|iPad|iPod/.test(window.navigator.userAgent));

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    setDeferredPrompt(null);
  }

  // iOS não tem beforeinstallprompt — só dá pra ensinar o caminho manual,
  // sempre que for Safari/iOS. No Android/Chrome, só mostra depois que o
  // navegador de fato oferece o prompt nativo (critérios dele, não nossos).
  if (isStandalone || dismissed) return null;
  if (!deferredPrompt && !isIos) return null;

  return (
    <div className="mx-4 mt-3 flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3 md:hidden">
      <div className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="6" y="2" width="12" height="20" rx="2" />
          <path d="M11 18h2" strokeLinecap="round" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-100">Instale o STRIX</p>
        {isIos ? (
          <ol className="mt-1 space-y-0.5 text-xs text-zinc-400">
            <li>1. Toque em Compartilhar (⬆)</li>
            <li>2. Toque em &quot;Ver Mais&quot;</li>
            <li>3. &quot;Adicionar à Tela de Início&quot;</li>
          </ol>
        ) : (
          <>
            <p className="mt-0.5 text-xs text-zinc-400">
              Acesso mais rápido, direto na tela inicial, com navegação por abas.
            </p>
            <button
              onClick={install}
              className="mt-2 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
            >
              Instalar
            </button>
          </>
        )}
      </div>
      <button onClick={dismiss} aria-label="Dispensar" className="flex-none text-zinc-500 hover:text-zinc-300">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
