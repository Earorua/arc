import Link from "next/link";
import lettering from "./arc-lettering.json";

export function ArcWordmark() {
  return (
    <svg className="arc-wordmark" aria-hidden="true" focusable="false" width="72" height="30" viewBox={lettering.viewBox} fill="currentColor">
      <path d={lettering.a} />
      <circle {...lettering.waypoint} fill={`var(--accent, ${lettering.waypoint.fill})`} />
      <path d={lettering.r} />
      <path d={lettering.c} />
      <circle {...lettering.period} />
    </svg>
  );
}

export function ArcHomeLink({ current = false, className = "" }: { current?: boolean; className?: string }) {
  return (
    <Link className={`wordmark arc-home-link${className ? ` ${className}` : ""}`} href="/" aria-label="Arc. home" aria-current={current ? "page" : undefined} lang="en">
      <ArcWordmark />
    </Link>
  );
}
