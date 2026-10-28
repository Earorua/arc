"use client";

import { useSyncExternalStore } from "react";

const changed = "arc:page-query";
function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(changed, listener);
  return () => { window.removeEventListener("popstate", listener); window.removeEventListener(changed, listener); };
}

/** Selection belongs in the address so reload and browser Back restore the view. */
export function usePageQuery() {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  return new URLSearchParams(search);
}

export function updatePageQuery(values: Record<string, string | null>, replace = false) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(values)) {
    if (value === null) params.delete(key); else params.set(key, value);
  }
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history[replace ? "replaceState" : "pushState"](window.history.state, "", url);
  window.dispatchEvent(new Event(changed));
}
