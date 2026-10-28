"use client";
import { useCallback, useSyncExternalStore } from "react";

const eventName = "arc:coach-draft";
const memory = new Map<string, string>();
function subscribe(listener: () => void) {
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}
export function useCoachDraft(owner: string | null, goal: string | null) {
  const key = `arc-coach-draft-v1:${JSON.stringify([owner, goal])}`;
  const read = useCallback(() => {
    if (memory.has(key)) return memory.get(key)!;
    try { return (sessionStorage.getItem(key) ?? "").slice(0, 6000); }
    catch { return memory.get(key) ?? ""; }
  }, [key]);
  const value = useSyncExternalStore(subscribe, read, () => "");
  const setValue = useCallback((next: string) => {
    const safe = next.slice(0, 6000);
    try { sessionStorage.setItem(key, safe); memory.delete(key); }
    catch { memory.set(key, safe); }
    window.dispatchEvent(new Event(eventName));
  }, [key]);
  return [value, setValue] as const;
}
