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
    <WorkspaceHeader current="History" context="历史记录 · 查看已保存的计划与学习事件" />
    <main id="main-content" tabIndex={-1} className="workspace-main">
      {!hydrated || session.isPending ? <p role="status">正在确认登录…</p> : session.data?.user
        ? <PlanHistory ownerId={session.data.user.id} />
        : <AccountBoundary destination="/history" title="回看走过的学习路线" description="登录后查阅已保存的目标、计划与学习记录。">{null}</AccountBoundary>}
    </main>
  </div>;
}
