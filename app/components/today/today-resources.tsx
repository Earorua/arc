"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";

const query = "(max-width: 760px)";
function subscribe(callback: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

/** A learner's explicit disclosure choice takes priority over responsive defaults. */
export function TodayResources({ children }: { children: ReactNode }) {
  const narrow = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? !narrow;
  return <details className="today-resource-disclosure" open={open}>
    <summary onClick={event => { event.preventDefault(); setChoice(!open); }}>学习资料</summary>
    {children}
  </details>;
}
