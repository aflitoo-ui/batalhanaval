"use client";

import { useEffect, useRef, useState } from "react";

const MAX_PULL = 90;
const THRESHOLD = 65;

// Sobe a árvore a partir do toque original: se ele começou dentro de um
// painel com scroll próprio (ex.: lista de inativos em Clientes) que ainda
// não está no topo dele mesmo, o gesto pertence a esse painel, não à página.
// Um toque dentro de qualquer modal (ModalShell, popup do Telegram) é sempre
// excluído, mesmo com o painel no topo — puxar pra baixo ali nunca deveria
// recarregar a página inteira por trás, só rolar o próprio modal (ou nada).
function startedInsideScrolledPanel(target: EventTarget | null) {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    if (el.getAttribute("role") === "dialog") return true;
    if (el.scrollHeight > el.clientHeight) {
      const style = getComputedStyle(el);
      if ((style.overflowY === "auto" || style.overflowY === "scroll") && el.scrollTop > 0) {
        return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

// PWA standalone mode no iOS remove toda a chrome do Safari, incluindo o
// puxar-pra-atualizar nativo. Isso recria esse gesto com touch events puros
// (sem lib) e só dispara window.location.reload() — não há uma camada de
// dados compartilhada entre as páginas pra invalidar de outro jeito.
export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const draggingRef = useRef(false);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY > 0 || refreshing || startedInsideScrolledPanel(e.target)) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (startY.current === null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0 || window.scrollY > 0) {
        if (draggingRef.current) {
          draggingRef.current = false;
          setDragging(false);
          setPull(0);
        }
        return;
      }
      // Só rouba o gesto do scroll normal depois de confirmar que é um puxão
      // pra baixo no topo — senão quebra o scroll do resto da página.
      draggingRef.current = true;
      setDragging(true);
      e.preventDefault();
      const next = Math.min(MAX_PULL, Math.sqrt(delta) * 6);
      pullRef.current = next;
      setPull(next);
    }

    function onTouchEnd() {
      if (draggingRef.current && pullRef.current >= THRESHOLD) {
        setRefreshing(true);
        setPull(MAX_PULL);
        window.location.reload();
      } else {
        setPull(0);
      }
      startY.current = null;
      draggingRef.current = false;
      setDragging(false);
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [refreshing]);

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed left-0 right-0 top-0 z-50 flex justify-center overflow-hidden"
        style={{ height: pull, transition: dragging ? "none" : "height 0.2s ease-out" }}
      >
        <div
          className="mt-3 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#3a2268]"
          style={{
            opacity: Math.min(1, pull / THRESHOLD),
            transform: refreshing ? undefined : `rotate(${pull * 3}deg)`,
            borderTopColor: "transparent",
            animation: refreshing ? "strix-ptr-spin 0.6s linear infinite" : undefined,
          }}
        />
      </div>
      <style>{`@keyframes strix-ptr-spin { to { transform: rotate(360deg); } }`}</style>
      {children}
    </>
  );
}
