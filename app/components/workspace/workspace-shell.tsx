import Link from "next/link";

const links = [["Today", "/today"], ["Path", "/path"], ["Stack", "/stack"], ["Proof", "/proof"]] as const;
type WorkspaceLabel = (typeof links)[number][0];

export function WorkspaceShell({
  current,
  children,
  context = "AI-Native Full-Stack Engineer · 18 weeks",
}: {
  current: WorkspaceLabel;
  children: React.ReactNode;
  context?: string;
}) {
  return (
    <div className="workspace-shell">
      <header className="workspace-header" lang="en">
        <Link className="wordmark" href="/">Arc.</Link>
        <nav aria-label="Learning workspace">
          {links.map(([label, href]) => <Link aria-current={current === label ? "page" : undefined} href={href} key={href}>{label}</Link>)}
        </nav>
        <span className="workspace-context" title={context}>{context}</span>
      </header>
      <main id="main-content" className="workspace-main">{children}</main>
    </div>
  );
}
