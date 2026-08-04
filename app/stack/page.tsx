"use client";

import { StackBrowser } from "../components/stack/stack-browser";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { flagshipRole } from "../data/flagship-role";
import { useArcState } from "../lib/use-arc-state";

export default function StackPage() {
  const arc = useArcState();
  const { state } = arc;

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
    >
      <section className="workspace-intro">
        <p className="eyebrow" lang="en">Role intelligence · {flagshipRole.version}</p>
        <h1 lang="en">The complete stack.</h1>
        <p>岗位重要度与结论置信度分开显示；每条结论都能回到来源。</p>
      </section>
      <StackBrowser skills={flagshipRole.skills} />
    </WorkspaceShell>
  );
}
