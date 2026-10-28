"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const locationEvents = ["popstate", "hashchange", "arc:page-query", "arc:evidence-navigation"];
function subscribe(listener: () => void) {
  for (const event of locationEvents) window.addEventListener(event, listener);
  return () => { for (const event of locationEvents) window.removeEventListener(event, listener); };
}
const snapshot = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;
const serverSnapshot = () => "";

/** Keep login links current when a page changes its selection without remounting the header. */
export function useAccountLocation() {
  const pathname = usePathname();
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot) || pathname || "/today";
}
