"use client";

import { ProofProfile } from "../components/proof/proof-profile";
import { ProofWorkspace } from "../components/proof/proof-workspace";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { flagshipRole } from "../data/flagship-role";
import { useArcState } from "../lib/use-arc-state";
import { usePlanningWorkspace } from "../lib/use-planning-workspace";
import { useProofLedger } from "../lib/use-proof-ledger";

export default function ProofPage() {
  const arc = useArcState();
  const planning = usePlanningWorkspace();
  const { state } = arc;
  const proof = useProofLedger({
    planningWorkspace: planning.workspace,
    legacyProofs: state?.proofs ?? [],
  });

  if (state === null) return <WorkspaceShell current="Proof" recovery={arc.recovery} source={arc.source} state={null} />;

  return (
    <WorkspaceShell
      current="Proof"
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
      planningState={planning.workspace}
    >
      <ProofProfile projections={proof.projections} skills={flagshipRole.skills} />
      <ProofWorkspace
        canUpload={proof.source === "cloud"}
        createProof={proof.createProof}
        dailyUnits={planning.workspace?.dailyUnits.filter((unit) =>
          unit.planVersionId === planning.workspace?.activePlanVersionId) ?? []}
        projections={proof.projections}
        recovery={proof.recovery}
        retry={proof.retry}
        reviseProof={proof.reviseProof}
        setVisibility={proof.setVisibility}
        skills={flagshipRole.skills}
        source={proof.source}
        withdrawProof={proof.withdrawProof}
        workspace={proof.workspace}
      />
    </WorkspaceShell>
  );
}
