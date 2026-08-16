"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TodaySession } from "../components/today/today-session";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { flagshipRole } from "../data/flagship-role";
import { assessTodayBudget } from "../lib/personalized-plan";
import { useArcState } from "../lib/use-arc-state";
import { usePlanningWorkspace } from "../lib/use-planning-workspace";
import { parsePlanningWorkspaceAtRepositoryBoundary } from "../contracts/planning";
import { AdaptiveTodaySession } from "../components/today/adaptive-today-session";

export default function TodayPage() {
  const arc = useArcState();
  const { state } = arc;

  if (state === null) return <WorkspaceShell current="Today" recovery={arc.recovery} source={arc.source} state={null} />;

  if (state.setup.roleId === flagshipRole.id) return <FlagshipAdaptiveToday arc={arc} />;
  return <LegacyToday arc={arc} />;
}

function FlagshipAdaptiveToday({ arc }: { arc: ReturnType<typeof useArcState> }) {
  const planning = usePlanningWorkspace();
  let workspace = null;
  try { workspace = planning.workspace ? parsePlanningWorkspaceAtRepositoryBoundary(planning.workspace) : null; } catch { workspace = null; }
  if (!workspace) return <LegacyToday arc={arc} />;
  return <WorkspaceShell current="Today" migration={arc.migration} migrationState={arc.localMigrationState} onDismissMigration={arc.dismissMigration} onImport={arc.importLocal} onRetry={arc.retry} recovery={arc.recovery} source={arc.source} state={arc.state} planningMigration={planning.migration} planningMigrationState={planning.source === "local" ? workspace : null} onDismissPlanningMigration={planning.dismissMigration} onImportPlanning={planning.importLocal} planningRecovery={planning.recovery}>
    <AdaptiveTodaySession accept={planning.accept} discard={planning.discard} record={planning.record} recovery={planning.recovery} workspace={workspace} />
  </WorkspaceShell>;
}

function LegacyToday({ arc }: { arc: ReturnType<typeof useArcState> }) {
  const router = useRouter();
  const state = arc.state!;
  const [completionError, setCompletionError] = useState<string | null>(null);
  const budget = assessTodayBudget(flagshipRole.today, state.setup.weeklyMinutes);

  const complete = async (unit: typeof flagshipRole.today) => {
    const saved = await arc.completeUnit(unit);

    if (!saved) {
      setCompletionError("完成记录未能保存，请检查浏览器存储设置后重试。");
      return false;
    }

    setCompletionError(null);
    router.push("/proof");
    return true;
  };

  return (
    <WorkspaceShell
      current="Today"
      migration={arc.migration}
      migrationState={arc.localMigrationState}
      onDismissMigration={arc.dismissMigration}
      onImport={arc.importLocal}
      onRetry={arc.retry}
      recovery={arc.recovery}
      source={arc.source}
      state={state}
    >
      {!budget.fits && (
        <p className="workspace-notice" role="status">
          本单元预计{budget.estimatedMinutes}分钟，超出当前每周{budget.weeklyMinutes}分钟预算{budget.shortfallMinutes}分钟；
          <Link href="/setup">返回 Setup 调整预算</Link>。
        </p>
      )}
      {completionError && arc.recovery === "none" && (
        <p className="workspace-notice" role="alert">
          {completionError}
        </p>
      )}
      <TodaySession onComplete={complete} unit={flagshipRole.today} />
    </WorkspaceShell>
  );
}
