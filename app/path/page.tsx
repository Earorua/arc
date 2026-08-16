"use client";

import { flagshipRole } from "../data/flagship-role";
import { PhaseRail } from "../components/workspace/phase-rail";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { useArcState } from "../lib/use-arc-state";
import { formatWeeklyBudget, getRoleDisplayName, redistributePhaseWeeks } from "../lib/personalized-plan";
import { usePlanningWorkspace } from "../lib/use-planning-workspace";
import { parsePlanningWorkspaceAtRepositoryBoundary } from "../contracts/planning";
import { AdaptivePath } from "../components/workspace/adaptive-path";

export default function PathPage() {
  const arc = useArcState();
  const { state } = arc;

  if (state === null) return <WorkspaceShell current="Path" recovery={arc.recovery} source={arc.source} state={null} />;

  if (state.setup.roleId === flagshipRole.id) return <FlagshipAdaptivePath arc={arc} />;
  return <LegacyPath arc={arc} />;
}

function FlagshipAdaptivePath({ arc }: { arc: ReturnType<typeof useArcState> }) {
  const planning = usePlanningWorkspace();
  let workspace = null;
  try { workspace = planning.workspace ? parsePlanningWorkspaceAtRepositoryBoundary(planning.workspace) : null; } catch { workspace = null; }
  if (!workspace) return <LegacyPath arc={arc} />;
  return <WorkspaceShell current="Path" migration={arc.migration} migrationState={arc.localMigrationState} onDismissMigration={arc.dismissMigration} onImport={arc.importLocal} onRetry={arc.retry} recovery={arc.recovery} source={arc.source} state={arc.state} planningMigration={planning.migration} planningMigrationState={planning.source === "local" ? workspace : null} onDismissPlanningMigration={planning.dismissMigration} onImportPlanning={planning.importLocal} planningRecovery={planning.recovery}>
    <AdaptivePath workspace={workspace} />
  </WorkspaceShell>;
}

function LegacyPath({ arc }: { arc: ReturnType<typeof useArcState> }) {
  const state = arc.state!;
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
