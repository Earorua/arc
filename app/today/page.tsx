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
import { authClient } from "../lib/auth-client";
import { resolveWorkspacePresentation } from "../lib/workspace-presentation";
import { AdaptiveTodaySession } from "../components/today/adaptive-today-session";
import { PlanningLoadBoundary, PlanningVersionBoundary } from "../components/workspace/planning-version-boundary";

export default function TodayPage() {
  const session = authClient.useSession();
  if (session.isPending) return <WorkspaceShell current="Today" state={null} />;
  return <SessionTodayPage key={session.data?.user.id ?? "guest"} authenticated={Boolean(session.data?.user)} />;
}

function SessionTodayPage({ authenticated }: { authenticated: boolean }) {
  const arc = useArcState();
  const { state } = arc;

  if (state === null) return <WorkspaceShell current="Today" recovery={arc.recovery} source={arc.source} state={null} />;

  if (authenticated || state.setup.roleId === flagshipRole.id) return <SourceAdaptiveToday arc={arc} />;
  return <LegacyToday arc={arc} />;
}

function SourceAdaptiveToday({ arc }: { arc: ReturnType<typeof useArcState> }) {
  const planning = usePlanningWorkspace();
  const resolved = resolveWorkspacePresentation(planning, arc.state !== null && arc.source === "local" && arc.recovery === "none");
  if (resolved.kind === "unavailable") return <WorkspaceShell sourceUnresolved current="Today" recovery={arc.recovery} source={arc.source} state={arc.state} planningRecovery={planning.recovery}>
    <PlanningVersionBoundary />
  </WorkspaceShell>;
  if (resolved.kind === "loading" || resolved.kind === "retry") return <WorkspaceShell sourceUnresolved current="Today" recovery={arc.recovery} source={arc.source} state={arc.state} planningRecovery={planning.recovery}>
    <PlanningLoadBoundary loading={resolved.kind === "loading"} onRetry={planning.retry} />
  </WorkspaceShell>;
  if (resolved.kind === "legacy") return <LegacyToday arc={arc} />;
  const { workspace, blueprint, registry } = resolved;
  return <WorkspaceShell current="Today" roleName={blueprint.name} migration={arc.migration} migrationState={arc.localMigrationState} onDismissMigration={arc.dismissMigration} onImport={arc.importLocal} onRetry={arc.retry} recovery={arc.recovery} source={arc.source} state={arc.state} planningMigration={planning.migration} planningMigrationState={planning.source === "local" ? workspace : null} onDismissPlanningMigration={planning.dismissMigration} onImportPlanning={planning.importLocal} planningRecovery={planning.recovery} planningState={workspace}>
    <AdaptiveTodaySession blueprint={blueprint} registry={registry} accept={planning.accept} discard={planning.discard} record={planning.record} recovery={planning.recovery} workspace={workspace} />
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
