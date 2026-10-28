"use client";

import { useState } from "react";
import Link from "next/link";

import { flagshipRole } from "../data/flagship-role";
import { PhaseRail } from "../components/workspace/phase-rail";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { useArcState } from "../lib/use-arc-state";
import { getRoleDisplayName, redistributePhaseWeeks } from "../lib/personalized-plan";
import { usePlanningWorkspace } from "../lib/use-planning-workspace";
import { authClient } from "../lib/auth-client";
import { resolveWorkspacePresentation } from "../lib/workspace-presentation";
import { AdaptivePath } from "../components/workspace/adaptive-path";
import { PlanDiffReview } from "../components/workspace/plan-diff-review";
import { PlanningLoadBoundary, PlanningVersionBoundary } from "../components/workspace/planning-version-boundary";

export default function PathPage() {
  const session = authClient.useSession();
  if (session.isPending) return <WorkspaceShell current="Path" state={null} />;
  return <SessionPathPage key={session.data?.user.id ?? "guest"} authenticated={Boolean(session.data?.user)} />;
}

function SessionPathPage({ authenticated }: { authenticated: boolean }) {
  const arc = useArcState();
  const { state } = arc;

  if (state === null) return <WorkspaceShell current="Path" recovery={arc.recovery} source={arc.source} state={null} />;

  if (authenticated || state.setup.roleId === flagshipRole.id) return <SourceAdaptivePath arc={arc} />;
  return <LegacyPath arc={arc} />;
}

function SourceAdaptivePath({ arc }: { arc: ReturnType<typeof useArcState> }) {
  const planning = usePlanningWorkspace();
  const [decisionMessage, setDecisionMessage] = useState<string | null>(null);
  const resolved = resolveWorkspacePresentation(planning, arc.state !== null && arc.source === "local" && arc.recovery === "none");
  if (resolved.kind === "unavailable") return <WorkspaceShell sourceUnresolved current="Path" recovery={arc.recovery} source={arc.source} state={arc.state} planningRecovery={planning.recovery}>
    <PlanningVersionBoundary />
  </WorkspaceShell>;
  if (resolved.kind === "loading" || resolved.kind === "retry") return <WorkspaceShell sourceUnresolved current="Path" recovery={arc.recovery} source={arc.source} state={arc.state} planningRecovery={planning.recovery}>
    <PlanningLoadBoundary loading={resolved.kind === "loading"} onRetry={planning.retry} />
  </WorkspaceShell>;
  if (resolved.kind === "legacy") return <LegacyPath arc={arc} />;
  const { workspace, blueprint, registry } = resolved;
  return <WorkspaceShell current="Path" roleName={blueprint.name} migration={arc.migration} migrationState={arc.localMigrationState} onDismissMigration={arc.dismissMigration} onImport={arc.importLocal} onRetry={arc.retry} recovery={arc.recovery} source={arc.source} state={arc.state} planningMigration={planning.migration} planningMigrationState={planning.source === "local" ? workspace : null} onDismissPlanningMigration={planning.dismissMigration} onImportPlanning={planning.importLocal} planningRecovery={planning.recovery} planningState={workspace}>
    <AdaptivePath blueprint={blueprint} registry={registry} workspace={workspace} />
    <p className="workspace-notice">想进一步调整节奏与重点？ <Link href="/coach">让学习规划师梳理路线 ↗</Link></p>
    {decisionMessage && <p className="workspace-notice" role="status">{decisionMessage}</p>}
    {workspace.pendingPlanVersionId && <PlanDiffReview registry={registry} workspace={workspace} recovery={planning.recovery} onAccept={planning.accept} onDiscard={planning.discard} onSuccess={setDecisionMessage} />}
  </WorkspaceShell>;
}

function LegacyPath({ arc }: { arc: ReturnType<typeof useArcState> }) {
  const state = arc.state!;
  const { roleId, targetWeeks, weeklyMinutes } = state.setup;
  const role = getRoleDisplayName(roleId);
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
        <p className="eyebrow">{role} · {targetWeeks} 周 · 每周 {weeklyMinutes} 分钟</p>
        <h1>学习路线</h1>
        <p>每个阶段只承担一个明确结果；时间变化时，后续路线重新分配但历史保持不变。</p>
      </section>
      <PhaseRail phases={phases} />
    </WorkspaceShell>
  );
}
