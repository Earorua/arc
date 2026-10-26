"use client";

import Link from "next/link";
import { authClient } from "../lib/auth-client";
import { AccountMenu } from "../components/account/account-menu";
import { PlanHistory } from "../components/workspace/plan-history";
import "./history.css";

export default function HistoryPage() {
  const session = authClient.useSession();
  return <div className="workspace-shell">
    <header className="workspace-header"><Link className="wordmark" href="/">Arc.</Link><nav aria-label="Learning workspace"><Link href="/today">Today</Link><Link href="/path">Path</Link><Link href="/history" aria-current="page">History</Link></nav><div className="workspace-meta"><AccountMenu /></div></header>
    <main id="main-content" className="workspace-main">
      {session.isPending ? <p role="status">正在确认登录…</p> : session.data?.user
        ? <PlanHistory ownerId={session.data.user.id} />
        : <section className="workspace-intro"><h1>历史学习计划</h1><p>登录后查看你保存的学习历史。</p><Link href="/sign-in">登录</Link></section>}
    </main>
  </div>;
}
