"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { ResearchIssueCode, ResearchPublicFailureCategory } from "../../contracts/research";
import type { RoleResearchController } from "../../lib/use-role-research";

const issueCopy: Record<ResearchIssueCode, string> = {
  "invalid-schema": "The research needs a complete, consistent structure.",
  "invalid-graph": "The skill prerequisites need review.",
  "invalid-registry": "The learning units need review.",
  "missing-skill-source": "Some skills need supporting sources.",
  "missing-core-authority": "Core skills need stronger supporting sources.",
  "unsafe-url": "Some source links could not be used safely.",
  "unreferenced-url": "Some learning resources need a cited source.",
  "missing-free-alternative": "Some resources need a free alternative.",
  "missing-unit": "Some skills need an executable learning unit.",
  "minute-mismatch": "Some learning steps need consistent time estimates.",
  "unsafe-content": "Some research content could not be used safely.",
};
const failureCopy: Record<ResearchPublicFailureCategory, string> = {
  timeout: "Research took longer than expected.",
  "rate-limited": "Research is busy. Try again shortly.",
  "allowance-reached": "The current Research allowance has been reached.",
  "service-unavailable": "Research is temporarily unavailable.",
  "content-rejected": "This research could not be used safely.",
  "invalid-result": "This research did not produce a usable result.",
  internal: "Arc could not complete this research.",
};
const labels = { idle: "Research Beta", submitting: "Starting role research", queued: "Research is queued", researching: "Researching role skills and sources", validating: "Validating sources and learning units", ready: "Research ready", "needs-review": "Research needs review", failed: "Research unavailable" };

export function RoleResearchPanel({ controller, role, eligible, onStart, onUse, onFlagship }: {
  controller: RoleResearchController; role: string; eligible: boolean;
  onStart(): void; onUse(runId: string): void; onFlagship(): void;
}) {
  const { state, run, busy, error, requestId, restoring } = controller;
  const heading = useRef<HTMLHeadingElement>(null);
  const previous = useRef(state.kind);
  useEffect(() => {
    if (previous.current !== state.kind) heading.current?.focus();
    previous.current = state.kind;
  }, [state.kind]);
  const active = restoring || busy || ["submitting", "queued", "researching", "validating"].includes(state.kind);
  const canStart = eligible && !run && !active && role.trim().length >= 2 && role.trim().length <= 160
    && (!error || error.recovery === "retry" || error.recovery === "retry-or-flagship" || error.code === "INVALID_INPUT" || error.code === "NOT_FOUND");
  return <section className="role-research-panel" aria-label="Role research">
    <div role="status" aria-live="polite" aria-busy={active}>
      <h2 ref={heading} tabIndex={-1}>{restoring ? "Restoring role research" : labels[state.kind]}</h2>
      {state.kind === "idle" && !restoring && <p>Research Beta builds a source-backed skill audit and learning path for this role.</p>}
      {run?.state === "ready" && <div className="research-ready">
        <p>{run.role}</p><p>{run.summary}</p>
        <dl className="research-facts"><div><dt>Skills</dt><dd>{run.skillCount} skills</dd></div><div><dt>Sources</dt><dd>{run.sourceCount} sources</dd></div><div><dt>Observed</dt><dd><time dateTime={run.observedAt}>{run.observedAt}</time></dd></div></dl>
        <p>Quality checks passed</p>
      </div>}
    </div>
    {run?.state === "needs-review" && <div role="alert"><ul>{run.quality.issueCodes.map((issue) => <li key={issue}>{issueCopy[issue]}</li>)}</ul></div>}
    {run?.state === "failed" && <p role="alert">{failureCopy[run.failureCategory]}</p>}
    {error && !["needs-review", "failed"].includes(run?.state ?? "") && <p role="alert">{error.message}</p>}
    {requestId && error && <p className="research-request-id">Request ID: {requestId}</p>}
    <div className="setup-actions research-actions">
      {canStart && <button className="setup-next research-action" onClick={onStart} type="button">Research this role</button>}
      {run?.state === "ready" && <button className="setup-next research-action" disabled={busy} onClick={() => onUse(run.id)} type="button">Use this research</button>}
      {run && (run.state === "needs-review" || run.state === "failed") && run.retryable && eligible && <button className="setup-next research-action" disabled={busy} onClick={() => void controller.retry()} type="button">Retry research</button>}
      {error?.recovery === "refresh" && <button className="text-action research-action" disabled={busy} onClick={() => void controller.refresh()} type="button">Refresh research</button>}
      {error?.recovery === "sign-in" && <Link className="text-action research-action" href="/sign-in">Sign in</Link>}
      <button className="text-action research-action" onClick={onFlagship} type="button">Use Flagship</button>
    </div>
  </section>;
}
