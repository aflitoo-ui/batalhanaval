"use client";

import { useEffect, useState } from "react";
import { useStandalone } from "@/lib/useStandalone";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};

// Vivia como banner fixo no topo de toda página (AppShell) — incomodava
// mais do que ajudava. Agora mora só aqui em "Sobre", como mais uma seção;
// quem quiser instalar sabe onde achar, sem ninguém ser interrompido à
// força. Só aparece em navegador comum de celular (nunca no PC, nunca já
// instalado) — md:hidden cobre a largura, isStandalone cobre "já é PWA".
export function InstallSection() {
  const isStandalone = useStandalone();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    setIsIos(/iPhone|iPad|iPod/.test(window.navigator.userAgent));

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    setDeferredPrompt(null);
  }

  // iOS não tem beforeinstallprompt — só dá pra ensinar o caminho manual,
  // sempre que for Safari/iOS. No Android/Chrome, só mostra depois que o
  // navegador de fato oferece o prompt nativo (critérios dele, não nossos).
  if (isStandalone) return null;
  if (!deferredPrompt && !isIos) return null;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 md:hidden">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-400">
        <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="6" y="2" width="12" height="20" rx="2" />
          <path d="M11 18h2" strokeLinecap="round" />
        </svg>
        Instale o STRIX
      </h2>
      <div className="space-y-2 text-sm leading-relaxed text-zinc-300">
        {isIos ? (
          <>
            <p>No Safari, adicione o STRIX à tela de início:</p>
            <ol className="space-y-0.5 text-zinc-400">
              <li>1. Toque em Compartilhar (⬆)</li>
              <li>2. Toque em &quot;Ver Mais&quot;</li>
              <li>3. &quot;Adicionar à Tela de Início&quot;</li>
            </ol>
          </>
        ) : (
          <>
            <p>Acesso mais rápido, direto na tela inicial, com navegação por abas.</p>
            <button
              onClick={install}
              className="mt-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
            >
              Instalar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
