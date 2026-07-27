"use client";

import { ProofProfile } from "../components/proof/proof-profile";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { flagshipRole } from "../data/flagship-role";
import { useArcState } from "../lib/use-arc-state";

export default function ProofPage() {
  const arc = useArcState();
  const { state } = arc;

  if (state === null) return <WorkspaceShell current="Proof" source={arc.source} state={null} />;

  return (
    <WorkspaceShell
      current="Proof"
      migration={arc.migration}
      migrationState={arc.localMigrationState}
      onImport={arc.importLocal}
      onRetry={arc.retry}
      source={arc.source}
      state={state}
    >
      <ProofProfile proofs={state.proofs} skills={flagshipRole.skills} />
    </WorkspaceShell>
  );
}
