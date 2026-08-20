"use client";

import { useEffect, useState } from "react";

// Detecta o app instalado como atalho/PWA (sem chrome do navegador) —
// display-mode: standalone cobre Android/desktop, navigator.standalone é o
// jeito antigo (mas ainda necessário) do iOS Safari pra Add to Home Screen.
// Sempre começa em false (mesmo valor em todo SSR) pra não divergir do HTML
// gerado no servidor, e só liga depois de montar no cliente.
export function useStandalone() {
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(display-mode: standalone)");
    const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
    setStandalone(mql.matches || iosStandalone);

    const onChange = (e: MediaQueryListEvent) => setStandalone(e.matches || iosStandalone);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return standalone;
}
