"use client";

import { WorkspaceHeader, type WorkspaceDestination } from "./workspace-header";
import { WorkspaceLoading } from "./workspace-loading";
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
  const context = sourceUnresolved ? undefined : planningState
    ? `${roleName ?? "Learning plan"} · ${planningState.target.targetWeeks} weeks`
    : state === null
    ? undefined
    : `${getRoleDisplayName(state.setup.roleId)} · ${state.setup.targetWeeks} weeks`;

  return (
    <div className="workspace-shell">
      <WorkspaceHeader current={current} context={context} />
      <main id="main-content" tabIndex={-1} className="workspace-main">
        {isRestoring ? (
          <WorkspaceLoading />
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
                This path currently uses the AI-native full-stack sample. Role research will replace it with content for your chosen role.
              </p>
            )}
            {children}
          </>
        )}
      </main>
    </div>
  );
}
