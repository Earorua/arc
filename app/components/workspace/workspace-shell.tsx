"use client";

import Link from "next/link";
import { AccountMenu } from "../account/account-menu";
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

const links = [["Today", "/today"], ["Path", "/path"], ["Stack", "/stack"], ["Proof", "/proof"]] as const;
type WorkspaceLabel = (typeof links)[number][0];

export function WorkspaceShell({
  current,
  children,
  migration = "none",
  migrationState,
  onDismissMigration,
  onImport,
  onRetry,
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
  recovery?: ArcRecoveryState;
  source?: ArcStateSource;
  state: DemoState | null;
}) {
  const isRestoring = state === null;
  const isCustomRole = state !== null && state.setup.roleId !== flagshipRole.id;
  const context = state === null
    ? "Restoring your plan…"
    : `${getRoleDisplayName(state.setup.roleId)} · ${state.setup.targetWeeks} weeks`;

  return (
    <div className="workspace-shell">
      <header className="workspace-header">
        <Link className="wordmark" href="/" lang="en">Arc.</Link>
        <nav aria-label="Learning workspace" lang="en">
          {links.map(([label, href]) => <Link aria-current={current === label ? "page" : undefined} href={href} key={href}>{label}</Link>)}
        </nav>
        <div className="workspace-meta">
          <span
            className="workspace-context"
            lang={isRestoring || state?.setup.roleId === flagshipRole.id ? "en" : undefined}
            title={context}
          >
            {context}
          </span>
          <AccountMenu />
        </div>
      </header>
      <main id="main-content" className="workspace-main">
        {isRestoring ? (
          <p className="workspace-restoring" role="status" lang="en">Restoring your plan…</p>
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
