"use client";

import Link from "next/link";
import { AccountMenu } from "../account/account-menu";
import { WorkspaceHelp } from "../agents/workspace-help";

const primaryLinks = [
  ["Today", "Today", "/today"], ["Path", "Path", "/path"],
  ["Stack", "Stack", "/stack"], ["Proof", "Proof", "/proof"],
] as const;
export type WorkspaceDestination = (typeof primaryLinks)[number][0] | "Coach" | "History";

export function WorkspaceHeader({ current, context }: { current: WorkspaceDestination; context?: string }) {
  return <header className="workspace-header">
    <Link className="wordmark" href="/" lang="en" aria-label="Arc. Home">Arc.</Link>
    <nav className="workspace-primary-nav workspace-bottom-nav" aria-label="Learning workspace">
      {primaryLinks.map(([key, label, href]) => <Link key={key} href={href} aria-current={current === key ? "page" : undefined}>{label}</Link>)}
    </nav>
    <div className="workspace-meta"><AccountMenu /></div>
    <div className="workspace-context-row">
      <span className="workspace-context workspace-goal" title={context}>{context ?? "Your learning workspace"}</span>
      <div className="workspace-context-actions"><WorkspaceHelp />
      {current === "Path" && <details className="workspace-tools">
        <summary>Manage plan</summary>
        <nav className="workspace-tools-menu" aria-label="Learning tools">
            <Link href="/history">Plan history</Link>
            <Link href="/setup?mode=edit&section=time">Edit availability</Link>
            <Link href="/setup?mode=create">New path</Link>
        </nav>
      </details>}
      </div>
    </div>
  </header>;
}
