"use client";

import { useEffect, useState } from "react";
import { loadDemoState, type DemoState } from "./demo-store";

export function useDemoState(): DemoState | null {
  const [state, setState] = useState<DemoState | null>(null);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => setState(loadDemoState()), 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  return state;
}
