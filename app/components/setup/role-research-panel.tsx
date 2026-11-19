"use client";

import Link from "next/link";
import { signInHref } from "../../lib/navigation-context";
import { useAccountLocation } from "../account/use-account-location";
import { useEffect, useRef } from "react";
import type { ResearchIssueCode, ResearchPublicFailureCategory } from "../../contracts/research";
import type { RoleResearchController } from "../../lib/use-role-research";
import { isFlagshipRoleInput } from "./setup-flow";

const issueCopy: Record<ResearchIssueCode, string> = {
  "invalid-schema": "The research structure needs more detail and consistency.",
  "invalid-graph": "Skill prerequisites need review.",
  "invalid-registry": "Learning units need review.",
  "missing-skill-source": "Some skills need supporting sources.",
  "missing-core-authority": "Core skills need more reliable supporting sources.",
  "unsafe-url": "Some source links cannot be used safely.",
  "unreferenced-url": "Some learning resources are missing citations.",
  "missing-free-alternative": "Some resources need free alternatives.",
  "unverified-free-access": "Free access to some learning materials still needs confirmation.",
  "unverified-source-authority": "Some learning materials need verified university or official publisher sources.",
  "missing-unit": "Some skills are missing actionable learning units.",
  "minute-mismatch": "Time estimates for some learning steps need review.",
  "unsafe-content": "Some research content cannot be used safely.",
};
const failureCopy: Record<ResearchPublicFailureCategory, string> = {
  timeout: "Research took longer than expected.",
  "rate-limited": "The research service is busy. Try again shortly.",
  "allowance-reached": "Your research allowance for this period has been used.",
  "service-unavailable": "The research service is temporarily unavailable.",
  "content-rejected": "These research results cannot be used safely.",
  "invalid-result": "These research results did not pass validation, so no new plan was created. Existing plans and learning records are unaffected.",
  internal: "Arc could not complete this research.",
};
const researchStages = [
  ["submitting", "Submit research"], ["queued", "Queued"], ["researching", "Research skills and sources"],
  ["validating", "Validate learning content"], ["ready", "Ready"],
] as const;
const localizedErrors: Record<string, string> = {
  "Sign in to use Arc research.": "Sign in to use role research.",
  "Research input is invalid.": "The research input is invalid. Check the role name.",
  "Research run was not found.": "This research run was not found.",
  "Research state changed. Refresh and try again.": "The research status has changed. Refresh and try again.",
  "Too many research requests. Try again shortly.": "Too many research requests. Try again shortly.",
  "The current Research allowance has been reached.": "Your research allowance for this period has been used.",
  "Research needs review before it can be used.": "The research results need review before use.",
  "Research is temporarily unavailable.": "The research service is temporarily unavailable.",
  "Arc could not complete this research request.": "Arc could not complete this research request.",
  "Arc returned an invalid research response.": "The research response was invalid. Check its status shortly.",
};
const labels = { idle: "Role research · Beta", submitting: "Submitting research", queued: "Research queued", researching: "Researching skills and sources", validating: "Validating sources and learning units", ready: "Research ready", "needs-review": "Research needs review", failed: "Research not completed" };

export function RoleResearchPanel({ controller, role, eligible, onStart, onUse, onFlagship }: {
  controller: RoleResearchController; role: string; eligible: boolean;
  onStart(): void; onUse(runId: string): void; onFlagship?: () => void;
}) {
  const location = useAccountLocation();
  const { state, run, busy, error, requestId, restoring, recoveryUncertain, replacementPending } = controller;
  const heading = useRef<HTMLHeadingElement>(null);
  const announcementKey = `${state.kind}:${restoring}:${recoveryUncertain}:${replacementPending}`;
  const previous = useRef(announcementKey);
  useEffect(() => {
    if (previous.current !== announcementKey) heading.current?.focus();
    previous.current = announcementKey;
  }, [announcementKey]);
  const active = restoring || busy || ["submitting", "queued", "researching", "validating"].includes(state.kind);
  const backgroundAccepted = run?.backgroundAccepted === true
    && (run.state === "queued" || run.state === "researching" || run.state === "validating");
  const canStart = eligible && !run && !active && !replacementPending && role.trim().length >= 2 && role.trim().length <= 160
    && !isFlagshipRoleInput(role)
    && (!error || error.recovery === "retry" || error.recovery === "retry-or-flagship" || error.code === "INVALID_INPUT" || error.code === "NOT_FOUND");
  const headingText = replacementPending ? "Start new research?"
    : state.kind === "submitting" ? labels.submitting
      : recoveryUncertain && restoring ? "Checking previous research…"
      : recoveryUncertain ? "The previous research status is still unconfirmed."
        : restoring ? "Restoring research status" : labels[state.kind];
  const terminal = run?.state === "needs-review" || run?.state === "failed";
  const showError = error && (error.name === "LocalResearchStorageError" || !recoveryUncertain && !terminal);
  return <section className="role-research-panel" aria-label="Role research">
    <div role="status" aria-live="polite" aria-busy={active}>
      <h2 ref={heading} tabIndex={-1}>{headingText}</h2>
      {!restoring && !recoveryUncertain && !replacementPending && researchStages.some(([kind]) => kind === state.kind) && <ol className="research-stages" aria-label="Research stages">{researchStages.map(([kind, label]) => <li key={kind} aria-current={state.kind === kind ? "step" : undefined}><span>{label}</span></li>)}</ol>}
      {backgroundAccepted && <p>Research is running in the background. You can leave this page and return to check progress.</p>}
      {state.kind === "idle" && !restoring && <p>Role research uses accessible sources to build a skills list and learning path for you.</p>}
      {recoveryUncertain && <p>Previous research may still be running and incurring charges. Starting again may incur another charge.</p>}
      {run?.state === "ready" && <div className="research-ready">
        <p>{run.role}</p><p>{run.summary}</p>
        <dl className="research-facts"><div><dt>Skills</dt><dd>{run.skillCount} skills</dd></div><div><dt>Sources</dt><dd>{run.sourceCount} sources</dd></div><div><dt>Sources observed</dt><dd><time dateTime={run.observedAt}>{run.observedAt}</time></dd></div></dl>
        <p>Quality checks passed</p>
      </div>}
    </div>
    {run?.state === "needs-review" && <div role="alert"><ul>{run.quality.issueCodes.map((issue) => <li key={issue}>{issueCopy[issue]}</li>)}</ul></div>}
    {run?.state === "failed" && <p role="alert">{failureCopy[run.failureCategory]}</p>}
    {showError && <p role="alert">{error.name === "LocalResearchStorageError" ? "Arc could not save recovery information on this device. Allow device storage and try again." : localizedErrors[error.message] ?? error.message}</p>}
    {requestId && showError && <details className="research-diagnostics"><summary>Details</summary><p className="research-request-id">Request ID: {requestId}</p></details>}
    <div className="setup-actions research-actions">
      {canStart && <button className="setup-next research-action" onClick={onStart} type="button">Research this role</button>}
      {run?.state === "ready" && <button className="setup-next research-action" disabled={busy} onClick={() => onUse(run.id)} type="button">Use research results</button>}
      {run && !recoveryUncertain && !replacementPending && (run.state === "needs-review" || run.state === "failed") && run.retryable && eligible && <button className="setup-next research-action" disabled={busy} onClick={() => void controller.retry()} type="button">Retry research</button>}
      {replacementPending && <button className="setup-next research-action" disabled={busy} onClick={() => void controller.confirmReplacement()} type="button">Start new research</button>}
      {replacementPending && <button className="text-action research-action" disabled={busy} onClick={controller.cancelReplacement} type="button">Keep checking previous research</button>}
      {recoveryUncertain && !replacementPending && <button className="text-action research-action" disabled={busy} onClick={() => void controller.refresh()} type="button">Check research status</button>}
      {!recoveryUncertain && error?.recovery === "refresh" && <button className="text-action research-action" disabled={busy} onClick={() => void controller.refresh()} type="button">Refresh research status</button>}
      {error?.recovery === "sign-in" && <Link className="text-action research-action" href={signInHref(location, true)}>Sign in</Link>}
      {onFlagship && <button className="text-action research-action" onClick={onFlagship} type="button">Use curated path</button>}
    </div>
  </section>;
}
