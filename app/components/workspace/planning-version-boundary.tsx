"use client";

import { useState } from "react";
import { WorkspaceLoading } from "./workspace-loading";

export function PlanningVersionBoundary() {
  return (
    <section className="planning-version-recovery" role="alert">
      <p className="section-index">This plan is temporarily unavailable</p>
      <h2>This plan’s content version is unavailable</h2>
      <p>Your plan and learning history are preserved and unchanged.</p>
      <p>This version cannot be converted automatically yet. Please try again later.</p>
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

  if (loading) return <WorkspaceLoading />;

  return (
    <section className="planning-version-recovery" role="alert">
      <p className="section-index">Learning plan unavailable</p>
      <h2>Your saved plan could not be confirmed</h2>
      <p>Continue learning once your plan is confirmed. Your existing records are preserved.</p>
      <button disabled={retrying} onClick={() => void retry()} type="button">{retrying ? "Retrying…" : "Reload plan"}</button>
    </section>
  );
}
