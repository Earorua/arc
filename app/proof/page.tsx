"use client";

import Link from "next/link";
import { ProofProfile } from "../components/proof/proof-profile";
import { ProofWorkspace } from "../components/proof/proof-workspace";
import { ProofContextReturn } from "../components/proof/proof-context-return";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { flagshipBlueprint } from "../data/flagship-blueprint";
import { useArcState } from "../lib/use-arc-state";
import { usePlanningWorkspace } from "../lib/use-planning-workspace";
import { useProofLedger } from "../lib/use-proof-ledger";
import { proofSelectableDailyUnits, resolveWorkspacePresentation } from "../lib/workspace-presentation";
import { PlanningLoadBoundary, PlanningVersionBoundary } from "../components/workspace/planning-version-boundary";
import { authClient } from "../lib/auth-client";
import { AccountBoundary } from "../components/account/account-boundary";
import { WorkspaceHeader } from "../components/workspace/workspace-header";
import { useHydrated } from "../lib/use-hydrated";
import { setupHref } from "../lib/navigation-context";
import { useAccountLocation } from "../components/account/use-account-location";

export default function ProofPage() {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  if (!hydrated || session.isPending || !session.data?.user) return <div className="workspace-shell">
    <WorkspaceHeader current="Proof" />
    <main id="main-content" tabIndex={-1} className="workspace-main"><AccountBoundary destination="/proof" title="Sign in to save proof of your work" description="Save your work to your account and track each revision as your skills grow.">{null}</AccountBoundary></main>
  </div>;
  return <SessionProofPage key={session.data.user.id} ownerKey={`user:${session.data.user.id}`} />;
}

function SessionProofPage({ ownerKey }: { ownerKey: string }) {
  const arc = useArcState();
  const planning = usePlanningWorkspace();
  if (arc.source === "restoring" || planning.source === "restoring") return <WorkspaceShell current="Proof" state={null} />;
  const confirmedMissing = planning.cloudGoalMissing && !planning.workspace && !planning.sourceContext
    && arc.source === "local" && arc.recovery === "none" && ["none", "unavailable"].includes(planning.recovery);
  if (confirmedMissing) return <EmptyAccountProof />;
  return <ProofGoalPage ownerKey={ownerKey} arc={arc} planning={planning} />;
}

function EmptyAccountProof() {
  const location = useAccountLocation();
  return <div className="workspace-shell">
    <WorkspaceHeader current="Proof" />
    <main id="main-content" tabIndex={-1} className="workspace-main">
      <p className="eyebrow">Your account · Proof</p>
      <h1>Proof</h1>
      <p className="lede">Create a learning path, then save work that supports your learning goals.</p>
      <ProofContextReturn />
      <Link className="primary-action" href={setupHref(location)}>Create a learning path →</Link>
    </main>
  </div>;
}

function ProofGoalPage({ ownerKey, arc, planning }: { ownerKey: string; arc: ReturnType<typeof useArcState>; planning: ReturnType<typeof usePlanningWorkspace> }) {
  const { state } = arc;
  const resolved = resolveWorkspacePresentation(planning, state !== null && arc.source === "local" && arc.recovery === "none");
  const workspace = resolved.kind === "adaptive" ? resolved.workspace : null;
  const blueprint = resolved.kind === "adaptive" ? resolved.blueprint : flagshipBlueprint;
  const proof = useProofLedger({
    planningWorkspace: workspace,
    legacyProofs: resolved.kind === "legacy" ? state?.proofs ?? [] : [],
    skillIds: blueprint.skills.map(({ id }) => id),
  });

  if (state === null) return <WorkspaceShell current="Proof" recovery={arc.recovery} source={arc.source} state={null} />;
  if (resolved.kind !== "adaptive" && resolved.kind !== "legacy") return <WorkspaceShell current="Proof" sourceUnresolved recovery={arc.recovery} source={arc.source} state={state}>
    <ProofContextReturn />
    {resolved.kind === "unavailable" ? <PlanningVersionBoundary /> : <PlanningLoadBoundary loading={resolved.kind === "loading"} onRetry={planning.retry} />}
  </WorkspaceShell>;

  return (
    <WorkspaceShell
      current="Proof"
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
      <section className="workspace-intro"><p className="eyebrow">Your work and skill evidence</p><h1>Proof</h1><p>Review your submitted work, add revisions, and choose who can see each item.</p></section>
      <ProofWorkspace
        ownerKey={ownerKey}
        profile={<ProofProfile projections={proof.projections} skills={blueprint.skills} />}
        canUpload={proof.source === "cloud"}
        createProof={proof.createProof}
        dailyUnits={proofSelectableDailyUnits(workspace)}
        projections={proof.projections}
        recovery={proof.recovery}
        retry={proof.retry}
        reviseProof={proof.reviseProof}
        setVisibility={proof.setVisibility}
        skills={blueprint.skills}
        source={proof.source}
        withdrawProof={proof.withdrawProof}
        workspace={proof.workspace}
      />
    </WorkspaceShell>
  );
}
