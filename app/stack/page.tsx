"use client";

import { StackBrowser } from "../components/stack/stack-browser";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { flagshipBlueprint } from "../data/flagship-blueprint";
import { useArcState } from "../lib/use-arc-state";
import { usePlanningWorkspace } from "../lib/use-planning-workspace";
import { useProofLedger } from "../lib/use-proof-ledger";

export default function StackPage() {
  const arc = useArcState();
  const planning = usePlanningWorkspace();
  const { state } = arc;
  const proof = useProofLedger({ planningWorkspace: planning.workspace, legacyProofs: state?.proofs ?? [] });
  const evidence = proof.workspace?.versions.map((version) => ({
    proofId: version.proofId,
    versionId: version.id,
    title: version.title,
  })) ?? [];

  if (state === null) return <WorkspaceShell current="Stack" recovery={arc.recovery} source={arc.source} state={null} />;

  return (
    <WorkspaceShell
      current="Stack"
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
      <section className="workspace-intro">
        <p className="eyebrow" lang="en">Role intelligence · {flagshipBlueprint.version}</p>
        <h1 lang="en">The complete stack.</h1>
        <p>岗位重要度与学习证据分开呈现；每条学习建议都能回到经过验证的来源。</p>
      </section>
      {(proof.source === "offline-cloud" || proof.recovery === "unavailable") && (
        <p className="workspace-notice" role="status">Cloud proof status is temporarily unavailable; Stack is showing only evidence Arc can resolve safely.</p>
      )}
      {proof.recovery === "conflict" && (
        <p className="workspace-notice" role="status">Proof evidence changed in another session. Open Proof and reload before making evidence changes.</p>
      )}
      <StackBrowser blueprint={flagshipBlueprint} evidence={evidence} projections={proof.projections} />
    </WorkspaceShell>
  );
}
