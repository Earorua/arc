"use client";

import { useSyncExternalStore } from "react";

const eventName = "arc:evidence-navigation";
function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(eventName, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(eventName, listener);
  };
}

/** Keep evidence selection in browser history without fetching or mutating account data. */
export function useEvidenceQuery() {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  return new URLSearchParams(search);
}

export function navigateEvidence(path: "/stack" | "/proof", params: URLSearchParams, replace = false) {
  const query = params.toString();
  const href = `${path}${query ? `?${query}` : ""}`;
  if (`${window.location.pathname}${window.location.search}` === href) return;
  window.history[replace ? "replaceState" : "pushState"](window.history.state, "", href);
  window.dispatchEvent(new Event(eventName));
}
