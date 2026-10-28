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
    <nav className="workspace-primary-nav" aria-label="学习工作区">
      {primaryLinks.map(([key, label, href]) => <Link key={key} href={href} aria-current={current === key ? "page" : undefined}>{label}</Link>)}
    </nav>
    <div className="workspace-meta"><AccountMenu /></div>
    <div className="workspace-context-row">
      <span className="workspace-context" title={context}>{context ?? "你的学习工作区"}</span>
      <nav className="workspace-secondary-nav" aria-label="学习工具">
        <Link href="/coach" aria-current={current === "Coach" ? "page" : undefined}>规划师</Link>
        <Link href="/history" aria-current={current === "History" ? "page" : undefined}>历史计划{current === "History" && <span className="readonly-tag">只读</span>}</Link>
      </nav>
    </div>
  </header>;
}
