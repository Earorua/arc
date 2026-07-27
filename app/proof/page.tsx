"use client";

import { ProofProfile } from "../components/proof/proof-profile";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { flagshipRole } from "../data/flagship-role";
import { useDemoState } from "../lib/use-demo-state";

export default function ProofPage() {
  const state = useDemoState();

  if (state === null) return <WorkspaceShell current="Proof" state={null} />;

  return (
    <WorkspaceShell current="Proof" state={state}>
      <ProofProfile proofs={state.proofs} skills={flagshipRole.skills} />
    </WorkspaceShell>
  );
}
