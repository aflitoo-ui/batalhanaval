"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;

/** Desloga sozinho depois de `timeoutMs` sem nenhuma interação do usuário — segurança pra quem esquece a tela aberta. */
export function useIdleLogout(timeoutMs: number) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function logout() {
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      router.push("/login");
      router.refresh();
    }

    function resetTimer() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(logout, timeoutMs);
    }

    resetTimer();
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeoutMs]);
}
