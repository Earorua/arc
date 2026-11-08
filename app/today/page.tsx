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
import { useHydrated } from "../lib/use-hydrated";
import { resolveWorkspacePresentation } from "../lib/workspace-presentation";
import { AdaptiveTodaySession } from "../components/today/adaptive-today-session";
import { PlanningLoadBoundary, PlanningVersionBoundary } from "../components/workspace/planning-version-boundary";
import { AccountBoundary } from "../components/account/account-boundary";
import { WorkspaceHeader } from "../components/workspace/workspace-header";

export default function TodayPage() {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  if (!hydrated || session.isPending) return <WorkspaceShell current="Today" state={null} />;
  if (!session.data?.user) return <div className="workspace-shell"><WorkspaceHeader current="Today" /><main id="main-content" tabIndex={-1} className="workspace-main"><AccountBoundary destination="/today" title="Start with one task today" description="Sign in to continue your tasks, learning steps, and portfolio.">{null}</AccountBoundary></main></div>;
  return <SessionTodayPage key={session.data?.user.id ?? "guest"} authenticated={Boolean(session.data?.user)} />;
}

function SessionTodayPage({ authenticated }: { authenticated: boolean }) {
  const arc = useArcState();
  const planning = usePlanningWorkspace();
  const { state } = arc;

  if (state === null) return <WorkspaceShell current="Today" recovery={arc.recovery} source={arc.source} state={null} />;

  if (authenticated || state.setup.roleId === flagshipRole.id) return <SourceAdaptiveToday arc={arc} planning={planning} />;
  return <LegacyToday arc={arc} />;
}

function SourceAdaptiveToday({ arc, planning }: { arc: ReturnType<typeof useArcState>; planning: ReturnType<typeof usePlanningWorkspace> }) {
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
      setCompletionError("Your progress could not be saved. Check your browser storage settings and try again.");
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
          This unit takes about {budget.estimatedMinutes} min, exceeding your weekly budget of {budget.weeklyMinutes} min by {budget.shortfallMinutes} min. {" "}
          <Link href="/setup?mode=edit&section=time">Adjust study time</Link>.
        </p>
      )}
      {completionError && arc.recovery === "none" && (
        <p className="workspace-notice" role="alert">
          {completionError}
        </p>
      )}
      <TodaySession onComplete={complete} unit={flagshipRole.today} />
      {completed && <p className="workspace-notice" role="status">Task complete. <Link href={`/proof?compose=1&unit=${encodeURIComponent(flagshipRole.today.id)}&returnTo=%2Ftoday`}>Add proof ↗</Link></p>}
    </WorkspaceShell>
  );
}
