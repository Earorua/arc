"use client";
import { useEffect } from "react";

/** Generation is request-bound; never imply that it continues after navigation. */
export function useGenerationLeaveGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warning = "规划仍在生成，离开会中断本次生成。输入草稿会保留。确定离开吗？";
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const traverse = (event: Event) => {
      const destination = event as Event & { navigationType?: string; destination?: { sameDocument?: boolean; url?: string } };
      if (destination.navigationType !== "traverse" || !destination.destination?.sameDocument || !event.cancelable) return;
      const target = new URL(destination.destination.url ?? window.location.href);
      if (target.pathname === window.location.pathname && target.search === window.location.search) return;
      if (!window.confirm(warning)) event.preventDefault();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.download) return;
      const target = new URL(anchor.href, window.location.href);
      if (target.pathname === window.location.pathname && target.search === window.location.search) return;
      if (!window.confirm(warning)) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    navigation?.addEventListener("navigate", traverse);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", click, true); navigation?.removeEventListener("navigate", traverse); };
  }, [active]);
}
