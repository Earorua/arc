"use client";

import { AccountBoundary } from "../components/account/account-boundary";
import { authClient } from "../lib/auth-client";
import { useHydrated } from "../lib/use-hydrated";
import { WorkspaceHeader } from "../components/workspace/workspace-header";
import { PlanHistory } from "../components/workspace/plan-history";
import "./history.css";

export default function HistoryPage() {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  return <div className="workspace-shell">
    <WorkspaceHeader current="History" context="History · Saved plans and learning activity" />
    <main id="main-content" tabIndex={-1} className="workspace-main">
      {!hydrated || session.isPending ? <p role="status">Checking your session…</p> : session.data?.user
        ? <PlanHistory ownerId={session.data.user.id} />
        : <AccountBoundary destination="/history" title="Revisit your learning journey" description="Sign in to review your saved goals, plans, and learning history.">{null}</AccountBoundary>}
    </main>
  </div>;
}
