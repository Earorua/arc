"use client";

import { useState } from "react";
import type { DemoState } from "../../lib/demo-store";
import { isArcApiError } from "../../lib/cloud-client";
import { getRoleDisplayName } from "../../lib/personalized-plan";

export type MigrationStatus = "none" | "available" | "importing" | "imported" | "failed";
export type MigrationResolution = "reject" | "archive-import" | "activate-import";

export function MigrationBanner({
  state,
  status,
  onImport,
}: {
  state: DemoState;
  status: MigrationStatus;
  onImport: (resolution?: MigrationResolution) => Promise<void>;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [failed, setFailed] = useState(false);

  if (dismissed || status === "none" || status === "imported") return null;

  async function begin(resolution: MigrationResolution) {
    setPending(true);
    setFailed(false);
    try {
      await onImport(resolution);
    } catch (error) {
      if (isArcApiError(error) && error.code === "CONFLICT") {
        setConflict(true);
      } else {
        setFailed(true);
      }
    } finally {
      setPending(false);
    }
  }

  const completed = state.completedUnitIds.length;
  const proofs = state.proofs.length;
  const busy = pending || status === "importing";

  return (
    <aside className="migration-banner" aria-labelledby="migration-title">
      <p className="section-index">Device work found</p>
      <div className="migration-copy">
        <h2 id="migration-title">Continue this path in your Arc. account?</h2>
        <p>
          {getRoleDisplayName(state.setup.roleId)} · {completed} completed {completed === 1 ? "unit" : "units"} · {proofs} {proofs === 1 ? "proof" : "proofs"}
        </p>
        <small>Nothing moves until you choose. “Not now” keeps every local byte on this device.</small>
      </div>

      {conflict ? (
        <div className="migration-actions migration-conflict">
          <p>Your account already has an active goal. Choose which path remains active.</p>
          <button disabled={busy} onClick={() => void begin("archive-import")} type="button">
            Keep cloud goal; archive import
          </button>
          <button disabled={busy} onClick={() => void begin("activate-import")} type="button">
            Archive cloud goal; activate import
          </button>
        </div>
      ) : (
        <div className="migration-actions">
          <button disabled={busy} onClick={() => void begin("reject")} type="button">
            {status === "failed" || failed ? "Retry import" : busy ? "Importing…" : "Import to Arc."}
          </button>
          <button disabled={busy} onClick={() => setDismissed(true)} type="button">Not now</button>
        </div>
      )}
    </aside>
  );
}
