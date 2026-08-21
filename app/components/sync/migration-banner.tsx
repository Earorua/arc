"use client";

import { useState } from "react";
import type { PlanningWorkspace } from "../../contracts/planning";
import type { DemoState } from "../../lib/demo-store";
import { isArcApiError } from "../../lib/cloud-client";
import { getRoleDisplayName } from "../../lib/personalized-plan";
import type { PlanningRecoveryState } from "../../lib/use-planning-workspace";
import { CloudStatus } from "./cloud-status";

export type MigrationStatus = "none" | "available" | "importing" | "imported" | "failed";
export type MigrationResolution = "reject" | "archive-import" | "activate-import";

const levelLabels: Record<DemoState["setup"]["level"], string> = {
  new: "New",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

type V7MigrationBannerProps = {
  kind?: "v7-state";
  state: DemoState;
  status: MigrationStatus;
  onDismiss: () => void;
  onImport: (resolution?: MigrationResolution) => Promise<void>;
};

type AdaptiveMigrationBannerProps = {
  kind: "adaptive-plan";
  state: PlanningWorkspace;
  status: MigrationStatus;
  recovery?: PlanningRecoveryState;
  onDismiss: () => void;
  onImport: () => Promise<boolean | void>;
};

export function MigrationBanner(props: V7MigrationBannerProps | AdaptiveMigrationBannerProps) {
  if (props.kind === "adaptive-plan") return <AdaptiveMigrationBanner {...props} />;
  return <V7MigrationBanner {...props} />;
}

function AdaptiveMigrationBanner({ status, recovery = "none", onDismiss, onImport }: AdaptiveMigrationBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [failed, setFailed] = useState(false);

  if (dismissed || status === "none" || status === "imported") return null;
  const busy = pending || status === "importing";
  const errorMessage = conflict || recovery === "conflict"
    ? "Arc could not import because the cloud plan changed. Refresh and try again."
    : failed || status === "failed"
      ? "Import is unavailable. Retry when your connection recovers."
      : null;
  const statusMessage = busy ? "Importing adaptive planning history." : "Ready to import adaptive planning history.";

  async function begin() {
    setPending(true);
    setFailed(false);
    setConflict(false);
    try {
      const imported = await onImport();
      if (imported === false) return;
    } catch (error) {
      if (isArcApiError(error) && error.code === "CONFLICT") setConflict(true);
      else setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <aside className="migration-banner" aria-labelledby="adaptive-migration-title">
      <p className="section-index">Device work found</p>
      <div className="migration-copy">
        <h2 id="adaptive-migration-title">A complete adaptive plan exists on this device.</h2>
        <p>Importing replays its versioned learning history into this Arc account.</p>
        <small>Nothing moves until you choose. “Not now” keeps every local byte on this device.</small>
      </div>
      <div className="migration-actions">
        <p role={errorMessage ? "alert" : "status"} aria-live={errorMessage ? "assertive" : "polite"}>
          {errorMessage ?? statusMessage}
        </p>
        <button disabled={busy} onClick={() => void begin()} type="button">
          {busy ? "Importing…" : "Import"}
        </button>
        <button
          disabled={busy}
          onClick={() => {
            onDismiss();
            setDismissed(true);
          }}
          type="button"
        >
          Not now
        </button>
      </div>
    </aside>
  );
}

function V7MigrationBanner({
  state,
  status,
  onDismiss,
  onImport,
}: V7MigrationBannerProps) {
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
          {getRoleDisplayName(state.setup.roleId)} · {levelLabels[state.setup.level]} · {state.setup.weeklyMinutes} min/week · {state.setup.targetWeeks} weeks
        </p>
        <p className="migration-progress">
          {completed} completed {completed === 1 ? "unit" : "units"} · {proofs} {proofs === 1 ? "proof" : "proofs"}
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
          {status === "failed" || failed ? (
            <CloudStatus kind="import-failed" onAction={() => begin("reject")} />
          ) : (
            <button disabled={busy} onClick={() => void begin("reject")} type="button">
              {busy ? "Importing…" : "Import to Arc."}
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => {
              onDismiss();
              setDismissed(true);
            }}
            type="button"
          >
            Not now
          </button>
        </div>
      )}
    </aside>
  );
}
