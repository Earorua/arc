"use client";

import { WorkspaceHeader, type WorkspaceDestination } from "./workspace-header";
import { MigrationBanner } from "../sync/migration-banner";
import { CloudStatus } from "../sync/cloud-status";
import { flagshipRole } from "../../data/flagship-role";
import type { DemoState } from "../../lib/demo-store";
import { getRoleDisplayName } from "../../lib/personalized-plan";
import type {
  ArcMigrationResolution,
  ArcMigrationState,
  ArcRecoveryState,
  ArcStateSource,
} from "../../lib/use-arc-state";
import type { PlanningMigrationState, PlanningRecoveryState } from "../../lib/use-planning-workspace";
import type { PlanningWorkspace } from "../../contracts/planning";

type WorkspaceLabel = Extract<WorkspaceDestination, "Today" | "Path" | "Stack" | "Proof">;

export function WorkspaceShell({
  current,
  children,
  migration = "none",
  migrationState,
  onDismissMigration,
  onImport,
  onRetry,
  planningMigration = "none",
  planningMigrationState,
  onDismissPlanningMigration,
  onImportPlanning,
  planningRecovery = "none",
  planningState,
  roleName,
  sourceUnresolved = false,
  recovery = "none",
  source = "local",
  state,
}: {
  current: WorkspaceLabel;
  children?: React.ReactNode;
  migration?: ArcMigrationState;
  migrationState?: DemoState | null;
  onDismissMigration?: () => void;
  onImport?: (resolution?: ArcMigrationResolution) => Promise<void>;
  onRetry?: () => Promise<void>;
  planningMigration?: PlanningMigrationState;
  planningMigrationState?: PlanningWorkspace | null;
  onDismissPlanningMigration?: () => void;
  onImportPlanning?: () => Promise<boolean>;
  planningRecovery?: PlanningRecoveryState;
  planningState?: PlanningWorkspace | null;
  roleName?: string;
  sourceUnresolved?: boolean;
  recovery?: ArcRecoveryState;
  source?: ArcStateSource;
  state: DemoState | null;
}) {
  const isRestoring = state === null;
  const isCustomRole = sourceUnresolved || planningState ? false : state !== null && state.setup.roleId !== flagshipRole.id;
  const context = sourceUnresolved ? "正在读取学习计划…" : planningState
    ? `${roleName ?? "学习计划"} · ${planningState.target.targetWeeks} 周`
    : state === null
    ? "正在恢复学习计划…"
    : `${getRoleDisplayName(state.setup.roleId)} · ${state.setup.targetWeeks} 周`;

  return (
    <div className="workspace-shell">
      <WorkspaceHeader current={current} context={context} />
      <main id="main-content" tabIndex={-1} className="workspace-main">
        {isRestoring ? (
          <p className="workspace-restoring" role="status">正在恢复你的学习计划…</p>
        ) : (
          <>
            {onDismissMigration && onImport && migrationState && (
              <MigrationBanner
                onDismiss={onDismissMigration}
                onImport={onImport}
                state={migrationState}
                status={migration}
              />
            )}
            {onDismissPlanningMigration && onImportPlanning && planningMigrationState && (
              <MigrationBanner
                kind="adaptive-plan"
                onDismiss={onDismissPlanningMigration}
                onImport={onImportPlanning}
                recovery={planningRecovery}
                state={planningMigrationState}
                status={planningMigration}
              />
            )}
            {recovery === "session-expired" ? (
              <CloudStatus kind="session-expired" />
            ) : source === "offline-cloud" && (
              <CloudStatus kind="offline" onAction={onRetry} />
            )}
            {isCustomRole && (
              <p className="workspace-banner">
                当前内容使用 AI 原生全栈旗舰样本；Product Intelligence 后续研究并替换该岗位内容。
              </p>
            )}
            {children}
          </>
        )}
      </main>
    </div>
  );
}
