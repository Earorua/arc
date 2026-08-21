"use client";

import { useState } from "react";

export function PlanningVersionBoundary() {
  return (
    <section className="planning-version-recovery" role="alert">
      <p className="section-index">Plan version unavailable.</p>
      <h2>Arc cannot safely read this saved plan with the current learning catalogue.</h2>
      <p>Arc kept this saved plan unchanged so its learning history is not rewritten.</p>
      <p>A compatible rebuild is not available in this Phase 2 build.</p>
    </section>
  );
}

export function PlanningLoadBoundary({ loading, onRetry }: { loading: boolean; onRetry: () => Promise<void> }) {
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try { await onRetry(); }
    catch { /* The controller owns the private-safe recovery state. */ }
    finally { setRetrying(false); }
  };

  return (
    <section className="planning-version-recovery" role={loading ? "status" : "alert"}>
      <p className="section-index">{loading ? "Restoring adaptive plan." : "Adaptive plan temporarily unavailable."}</p>
      <h2>{loading ? "Arc is checking your saved planning history." : "Arc cannot confirm your saved cloud plan right now."}</h2>
      <p>The legacy completion flow stays closed until Arc can safely determine the adaptive plan state.</p>
      {!loading && <button disabled={retrying} onClick={() => void retry()} type="button">{retrying ? "Retrying…" : "Retry adaptive plan"}</button>}
    </section>
  );
}
