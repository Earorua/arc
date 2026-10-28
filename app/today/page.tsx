"use client";

import Link from "next/link";
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
import { AccountBoundary } from "../components/account/account-boundary";
import { WorkspaceHeader } from "../components/workspace/workspace-header";

export default function TodayPage() {
  const session = authClient.useSession();
  if (session.isPending) return <WorkspaceShell current="Today" state={null} />;
  if (!session.data?.user) return <div className="workspace-shell"><WorkspaceHeader current="Today" /><main id="main-content" tabIndex={-1} className="workspace-main"><AccountBoundary destination="/today" title="从今天的一项任务开始" description="登录后继续你的任务、学习步骤与作品积累。">{null}</AccountBoundary></main></div>;
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
  const state = arc.state!;
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const budget = assessTodayBudget(flagshipRole.today, state.setup.weeklyMinutes);

  const complete = async (unit: typeof flagshipRole.today) => {
    const saved = await arc.completeUnit(unit);

    if (!saved) {
      setCompletionError("完成记录未能保存，请检查浏览器存储设置后重试。");
      return false;
    }

    setCompletionError(null);
    setCompleted(true);
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
          <Link href="/setup?mode=edit&section=time">调整学习时间</Link>。
        </p>
      )}
      {completionError && arc.recovery === "none" && (
        <p className="workspace-notice" role="alert">
          {completionError}
        </p>
      )}
      <TodaySession onComplete={complete} unit={flagshipRole.today} />
      {completed && <p className="workspace-notice" role="status">任务已完成。<Link href={`/proof?compose=1&unit=${encodeURIComponent(flagshipRole.today.id)}&returnTo=%2Ftoday`}>添加作品证据 ↗</Link></p>}
    </WorkspaceShell>
  );
}
