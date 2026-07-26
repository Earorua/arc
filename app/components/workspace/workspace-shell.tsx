import Link from "next/link";

const links = [["Today", "/today"], ["Path", "/path"], ["Stack", "/stack"], ["Proof", "/proof"]] as const;

export function WorkspaceShell({ current, children }: { current: string; children: React.ReactNode }) {
  return (
    <div className="workspace-shell">
      <header className="workspace-header" lang="en">
        <Link className="wordmark" href="/">Arc.</Link>
        <nav aria-label="Learning workspace">
          {links.map(([label, href]) => <Link aria-current={current === label ? "page" : undefined} href={href} key={href}>{label}</Link>)}
        </nav>
        <span className="workspace-context">AI Full-Stack · 06 / 18</span>
      </header>
      <main id="main-content" className="workspace-main">{children}</main>
    </div>
  );
}
