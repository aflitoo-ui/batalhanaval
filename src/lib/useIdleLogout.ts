"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;
const STORAGE_KEY = "strix_last_activity";

/**
 * Desloga sozinho depois de `timeoutMs` sem nenhuma interação do usuário —
 * segurança pra quem esquece a tela aberta.
 *
 * O setTimeout sozinho não é confiável no celular: o navegador pausa timers
 * de aba em segundo plano quando a tela bloqueia ou o app vai pra trás, então
 * ele pode nunca disparar enquanto isso. Por isso também grava o horário da
 * última atividade e confere o tempo real passado sempre que a aba volta a
 * ficar visível — se já estourou o prazo, desloga na hora, mesmo que o timer
 * não tenha rodado.
 */
export function useIdleLogout(timeoutMs: number) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function logout() {
      // Troca a tela primeiro, sem esperar a rede — só o front decide se
      // desloga (baseado no tempo parado), então não faz sentido a pessoa
      // continuar vendo a tela anterior por 1-2s enquanto o fetch abaixo
      // ainda não voltou. Avisa o servidor em segundo plano, sem bloquear.
      router.push("/login");
      router.refresh();
      void fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    }

    function markActivity() {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    }

    function elapsedTooLong() {
      const last = Number(localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(last) && last > 0 && Date.now() - last >= timeoutMs;
    }

    function resetTimer() {
      markActivity();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(logout, timeoutMs);
    }

    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (elapsedTooLong()) {
        logout();
      } else {
        resetTimer();
      }
    }

    if (elapsedTooLong()) {
      logout();
    } else {
      resetTimer();
    }

    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, resetTimer));
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeoutMs]);
}
