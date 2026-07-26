import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header" lang="en">
      <Link className="wordmark" href="/" aria-label="Arc. home">Arc.</Link>
      <nav className="public-nav" aria-label="Public navigation">
        <Link href="/method">Method</Link>
        <Link href="/intelligence">Intelligence</Link>
      </nav>
      <Link className="header-cta" href="/setup">Build my path</Link>
    </header>
  );
}
