"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

// Keep the server and first client render aligned even if an external session store resolves early.
export function useHydrated() {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
