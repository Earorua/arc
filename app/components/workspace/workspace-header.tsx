"use client";

import Link from "next/link";
import { AccountMenu } from "../account/account-menu";

const primaryLinks = [
  ["Today", "今日学习", "/today"], ["Path", "学习路线", "/path"],
  ["Stack", "技能与资料", "/stack"], ["Proof", "作品证据", "/proof"],
] as const;
export type WorkspaceDestination = (typeof primaryLinks)[number][0] | "Coach" | "History";

export function WorkspaceHeader({ current, context }: { current: WorkspaceDestination; context?: string }) {
  return <header className="workspace-header">
    <Link className="wordmark" href="/" lang="en" aria-label="Arc. 首页">Arc.</Link>
    <nav className="workspace-primary-nav workspace-bottom-nav" aria-label="学习工作区">
      {primaryLinks.map(([key, label, href]) => <Link key={key} href={href} aria-current={current === key ? "page" : undefined}>{label}</Link>)}
    </nav>
    <div className="workspace-meta"><AccountMenu /></div>
    <div className="workspace-context-row">
      <span className="workspace-context workspace-goal" title={context}>{context ?? "你的学习工作区"}</span>
      <details className="workspace-tools">
        <summary>工具</summary>
        <nav className="workspace-tools-menu" aria-label="学习工具">
          <Link href="/coach" aria-current={current === "Coach" ? "page" : undefined}>学习规划</Link>
          <Link href="/history" aria-current={current === "History" ? "page" : undefined}>历史计划</Link>
          <Link href="/setup?mode=edit&section=time">编辑时间</Link>
          <Link href="/setup?mode=create">新建路线</Link>
        </nav>
      </details>
    </div>
  </header>;
}
