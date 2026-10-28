"use client";

import Link from "next/link";
import { authClient } from "../lib/auth-client";
import { WorkspaceHeader } from "../components/workspace/workspace-header";
import { PlanHistory } from "../components/workspace/plan-history";
import "./history.css";

export default function HistoryPage() {
  const session = authClient.useSession();
  return <div className="workspace-shell">
    <WorkspaceHeader current="History" context="历史记录 · 查看已保存的计划与学习事件" />
    <main id="main-content" className="workspace-main">
      {session.isPending ? <p role="status">正在确认登录…</p> : session.data?.user
        ? <PlanHistory ownerId={session.data.user.id} />
        : <section className="workspace-intro"><h1>历史学习计划</h1><p>登录后查看你保存的学习历史。</p><Link href="/sign-in">登录</Link></section>}
    </main>
  </div>;
}
