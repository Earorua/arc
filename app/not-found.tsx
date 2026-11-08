import Link from "next/link";

export default function NotFound() {
  return <main className="reading-page not-found-page" id="main-content" tabIndex={-1} lang="en">
    <Link className="wordmark" href="/" aria-label="Arc. home" lang="en">Arc.</Link>
    <p className="section-index">404 · Page not found</p>
    <h1>We couldn&apos;t find this page.</h1>
    <p className="lede">The link may have changed. Return to today&apos;s learning or start again from home.</p>
    <div className="not-found-actions"><Link className="primary-action" href="/today">Back to today</Link><Link className="text-action" href="/">Back to home</Link></div>
  </main>;
}
