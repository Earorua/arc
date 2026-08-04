"use client";

import { flagshipRole } from "../data/flagship-role";
import { PhaseRail } from "../components/workspace/phase-rail";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { useArcState } from "../lib/use-arc-state";
import { formatWeeklyBudget, getRoleDisplayName, redistributePhaseWeeks } from "../lib/personalized-plan";

export default function PathPage() {
  const arc = useArcState();
  const { state } = arc;

  if (state === null) return <WorkspaceShell current="Path" recovery={arc.recovery} source={arc.source} state={null} />;

  const { roleId, targetWeeks, weeklyMinutes } = state.setup;
  const role = getRoleDisplayName(roleId);
  const budget = formatWeeklyBudget(weeklyMinutes);
  const phases = redistributePhaseWeeks(flagshipRole.phases, targetWeeks);

  return (
    <WorkspaceShell
      current="Path"
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
        <p className="eyebrow" lang="en">{role} · {targetWeeks} weeks · {budget}</p>
        <h1 lang="en">Your precise path.</h1>
        <p>每个阶段只承担一个明确结果；时间变化时，后续路线重新分配但历史保持不变。</p>
      </section>
      <PhaseRail phases={phases} />
    </WorkspaceShell>
  );
}
