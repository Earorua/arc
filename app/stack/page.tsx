"use client";

import Link from "next/link";
import { AccountBoundary } from "../components/account/account-boundary";
import { WorkspaceHeader } from "../components/workspace/workspace-header";
import { StackBrowser } from "../components/stack/stack-browser";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { flagshipBlueprint } from "../data/flagship-blueprint";
import { useArcState } from "../lib/use-arc-state";
import { usePlanningWorkspace } from "../lib/use-planning-workspace";
import { useProofLedger } from "../lib/use-proof-ledger";
import { resolveWorkspacePresentation } from "../lib/workspace-presentation";
import { PlanningLoadBoundary, PlanningVersionBoundary } from "../components/workspace/planning-version-boundary";
import { authClient } from "../lib/auth-client";
import { useHydrated } from "../lib/use-hydrated";
import { setupHref, signInHref } from "../lib/navigation-context";
import { useAccountLocation } from "../components/account/use-account-location";

export default function StackPage() {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  const pending = !hydrated || session.isPending;
  if (pending || !session.data?.user) return <div className="workspace-shell">
    <WorkspaceHeader current="Stack" />
    <main id="main-content" tabIndex={-1} className="workspace-main"><AccountBoundary destination="/stack" title="Sign in to explore your skills and resources" description="Bring role requirements, recommended resources, and learning progress into your path.">{null}</AccountBoundary></main>
  </div>;
  return <SessionStackPage key={session.data.user.id} ownerKey={`user:${session.data.user.id}`} />;
}

function StackSignInBoundary() {
  const href = signInHref(typeof window === "undefined" ? "/stack" : `/stack${window.location.search}`, true);
  return <div className="workspace-shell">
    <WorkspaceHeader current="Stack" />
    <main id="main-content" tabIndex={-1} className="workspace-main">
      <h1>Sign in again to continue</h1>
      <p className="lede" role="status">Your session has expired. Sign in again to view your skills and resources.</p>
      <Link className="primary-action" href={href}>Sign in again</Link>
    </main>
  </div>;
}

function EmptyAccountStack() {
  const location = useAccountLocation();
  return <div className="workspace-shell">
    <WorkspaceHeader current="Stack" />
    <main id="main-content" tabIndex={-1} className="workspace-main">
      <p className="eyebrow">Your account · Skills and resources</p>
      <h1>Skills and resources</h1>
      <p className="lede">Create a learning path to view the skills and sources saved to your account.</p>
      <Link className="primary-action" href={setupHref(location)}>Create a learning path →</Link>
    </main>
  </div>;
}

function SessionStackPage({ ownerKey }: { ownerKey: string }) {
  const arc = useArcState();
  const planning = usePlanningWorkspace({ cloudOnly: true });
  const { state } = arc;
  const resolved = resolveWorkspacePresentation(planning);
  const workspace = resolved.kind === "adaptive" ? resolved.workspace : null;
  const blueprint = resolved.kind === "adaptive" ? resolved.blueprint : flagshipBlueprint;
  const proof = useProofLedger({ planningWorkspace: workspace, legacyProofs: resolved.kind === "legacy" ? state?.proofs ?? [] : [], skillIds: blueprint.skills.map(({ id }) => id) });
  const evidence = proof.workspace?.versions.map((version) => ({
    proofId: version.proofId,
    versionId: version.id,
    title: version.title,
  })) ?? [];

  if ([arc.recovery, planning.recovery, proof.recovery].includes("session-expired")) return <StackSignInBoundary />;
  // This account surface never substitutes device history or a public sample for a saved plan.
  if (planning.cloudGoalMissing || resolved.kind === "legacy") return <EmptyAccountStack />;
  if (state === null) return <WorkspaceShell current="Stack" recovery={arc.recovery} source={arc.source} state={null} />;
  if (resolved.kind !== "adaptive") return <WorkspaceShell current="Stack" sourceUnresolved recovery={arc.recovery} source={arc.source} state={state}>
    {resolved.kind === "unavailable" ? <PlanningVersionBoundary /> : <PlanningLoadBoundary loading={resolved.kind === "loading"} onRetry={planning.retry} />}
  </WorkspaceShell>;

  return (
    <WorkspaceShell
      current="Stack"
      roleName={blueprint.name}
      migration={arc.migration}
      migrationState={arc.localMigrationState}
      onDismissMigration={arc.dismissMigration}
      onImport={arc.importLocal}
      onRetry={arc.retry}
      recovery={arc.recovery}
      source={arc.source}
      state={state}
      planningMigration={planning.migration}
      planningMigrationState={planning.source === "local" ? planning.workspace : null}
      onDismissPlanningMigration={planning.dismissMigration}
      onImportPlanning={planning.importLocal}
      planningRecovery={planning.recovery}
      planningState={workspace}
    >
      <section className="workspace-intro">
        <p className="eyebrow">Role resources · {blueprint.version}</p>
        <h1>Skills and resources</h1>
        <p>Understand why each skill matters and find your next learning resource.</p>
      </section>
      {(proof.source === "offline-cloud" || proof.recovery === "unavailable") && (
        <p className="workspace-notice" role="status">Cloud proof status is temporarily unavailable. Only available skill evidence is shown.</p>
      )}
      {proof.recovery === "conflict" && (
        <p className="workspace-notice" role="status">Your proof changed elsewhere. Open Proof and reload before making changes.</p>
      )}
      <StackBrowser key={workspace?.goalId} ownerKey={`${ownerKey}:${workspace?.goalId}`} blueprint={blueprint} evidence={evidence} evidenceReady={proof.source !== "restoring"} projections={proof.projections} planningWorkspace={workspace} />
    </WorkspaceShell>
  );
}
