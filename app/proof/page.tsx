"use client";

import { useEffect, useState } from "react";
import { ProofProfile } from "../components/proof/proof-profile";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { flagshipRole } from "../data/flagship-role";
import { createDemoState, loadDemoState, type DemoState } from "../lib/demo-store";

export default function ProofPage() {
  const [state, setState] = useState<DemoState>(createDemoState());

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      setState(loadDemoState());
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  return (
    <WorkspaceShell current="Proof">
      <ProofProfile proofs={state.proofs} skills={flagshipRole.skills} />
    </WorkspaceShell>
  );
}
