"use client";

import { ProofProfile } from "../components/proof/proof-profile";
import { ProofWorkspace } from "../components/proof/proof-workspace";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { flagshipBlueprint } from "../data/flagship-blueprint";
import { useArcState } from "../lib/use-arc-state";
import { usePlanningWorkspace } from "../lib/use-planning-workspace";
import { useProofLedger } from "../lib/use-proof-ledger";
import { proofSelectableDailyUnits, resolveWorkspacePresentation } from "../lib/workspace-presentation";
import { PlanningLoadBoundary, PlanningVersionBoundary } from "../components/workspace/planning-version-boundary";
import { authClient } from "../lib/auth-client";

export default function ProofPage() {
  const session = authClient.useSession();
  if (session.isPending) return <WorkspaceShell current="Proof" state={null} />;
  return <SessionProofPage key={session.data?.user.id ?? "guest"} />;
}

function SessionProofPage() {
  const arc = useArcState();
  const planning = usePlanningWorkspace();
  const { state } = arc;
  const resolved = resolveWorkspacePresentation(planning);
  const workspace = resolved.kind === "adaptive" ? resolved.workspace : null;
  const blueprint = resolved.kind === "adaptive" ? resolved.blueprint : flagshipBlueprint;
  const proof = useProofLedger({
    planningWorkspace: workspace,
    legacyProofs: resolved.kind === "legacy" ? state?.proofs ?? [] : [],
    skillIds: blueprint.skills.map(({ id }) => id),
  });

  if (state === null) return <WorkspaceShell current="Proof" recovery={arc.recovery} source={arc.source} state={null} />;
  if (resolved.kind !== "adaptive" && resolved.kind !== "legacy") return <WorkspaceShell current="Proof" sourceUnresolved recovery={arc.recovery} source={arc.source} state={state}>
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
      <ProofProfile projections={proof.projections} skills={blueprint.skills} />
      <ProofWorkspace
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
