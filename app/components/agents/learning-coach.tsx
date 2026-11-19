"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PublicAgentRun } from "../../contracts/agents";
import { agentClient } from "../../lib/agent-client";
import { usePlanningWorkspace } from "../../lib/use-planning-workspace";
import { resolveWorkspacePresentation } from "../../lib/workspace-presentation";
import { PlanDiffReview } from "../workspace/plan-diff-review";
import { AnswerText } from "./agent-companion";
import { useLearningAgents } from "./agent-context";
import { WorkspaceHeader } from "../workspace/workspace-header";
import { learnerAvailability } from "./agent-availability";
import { useCoachDraft } from "../../lib/use-coach-draft";
import { useGenerationLeaveGuard } from "../../lib/use-generation-leave-guard";
import { safeReturnTo, setupHref, signInHref } from "../../lib/navigation-context";
import { updatePageQuery, usePageQuery } from "../../lib/use-page-query";
import { useAccountLocation } from "../account/use-account-location";

export function LearningCoach() {
  const agents = useLearningAgents();
  const location = useAccountLocation();
  if (agents.authPending || !agents.authenticated) return <div className="workspace-shell"><WorkspaceHeader current="Coach" context="Learning coach" /><main id="main-content" tabIndex={-1} className="workspace-main">
    <section className="account-boundary">
      <p className="section-index">Path tools</p>
      <h1>Adjust learning plan</h1>
      <p className="account-boundary-description">Sign in to review suggestions based on your goal, skills, and available time.</p>
      {agents.authPending ? <p className="coach-lede" role="status">Checking your account…</p> : <>
        <div className="account-boundary-actions"><Link className="coach-primary" href={signInHref(location)}>Sign in <span aria-hidden="true">↗</span></Link><Link href="/showcase">Explore the sample</Link></div>
        <p className="account-device-note">Your learning records stay on this device. After signing in, you can choose whether to import them into your account.</p>
      </>}
    </section>
  </main></div>;
  return <div className="workspace-shell"><WorkspaceHeader current="Coach" context={agents.workspace?.roleName ?? "Learning coach"} /><CoachGoal location={location} key={JSON.stringify([agents.accountId, agents.workspace?.goalId ?? null])} /></div>;
}
function CoachGoal({ location }: { location: string }) {
  const agents = useLearningAgents();
  const query = usePageQuery();
  const returnTo = safeReturnTo(query.get("returnTo"), "/path");
  const planning = usePlanningWorkspace({ cloudOnly: true });
  const sessionExpired = planning.recovery === "session-expired";
  const [message, setMessage] = useCoachDraft(agents.accountId, agents.workspace?.goalId ?? null);
  const [localRun, setLocalRun] = useState<PublicAgentRun | null>(null);
  const [requestOpenFor, setRequestOpenFor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false), [applying, setApplying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const generation = useRef<{ controller: AbortController; selection: string | null; runId: string | null } | null>(null);
  const workspace = agents.workspace;
  const { handoff, refresh, setHandoff } = agents;
  const history = workspace?.history.filter(run => run.kind === "planner") ?? [];
  const latest = history.at(-1) ?? null;
  const currentLocalRun = localRun?.kind === "planner" ? localRun : null;
  const latestRun = currentLocalRun && (!latest || currentLocalRun.createdAt >= latest.createdAt) ? currentLocalRun : latest;
  const selectedRunId = query.get("run");
  // URL identifiers select only runs already owned by this account and goal.
  // Never use an unverified query identifier as a poll or apply target.
  const run = selectedRunId !== null
    ? (currentLocalRun?.id === selectedRunId ? currentLocalRun : history.find(item => item.id === selectedRunId) ?? null)
    : latestRun;
  const selectionMissing = selectedRunId !== null && !run && !agents.loading;
  const hasAdvice = run?.status === "complete" && Boolean(run.advice);
  const pollingId = !sessionExpired && run && (run.status === "starting" || run.status === "running") ? run.id : null;
  useGenerationLeaveGuard(submitting || Boolean(pollingId));
  const resolved = resolveWorkspacePresentation(planning);
  const pending = resolved.kind === "adaptive" && Boolean(resolved.workspace.pendingPlanVersionId);
  const enabled = Boolean(!sessionExpired && workspace?.enabled && workspace.authenticated && workspace.goalId && workspace.baseVersionId);
  const stale = Boolean(run && (run.baseVersionId !== workspace?.baseVersionId || run.revision !== workspace?.revision));
  const applied = Boolean(run && planning.workspace?.events.some(event => event.mutationId === `agent-proposal-${run.id}`));

  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    const selectionChanged = () => {
      const attempt = generation.current;
      if (!attempt || (window.location.pathname === "/coach" && new URLSearchParams(window.location.search).get("run") === attempt.selection)) return;
      generation.current = null; attempt.controller.abort(); setSubmitting(false);
      if (attempt.runId) setLocalRun(current => current?.id === attempt.runId ? null : current);
    };
    window.addEventListener("popstate", selectionChanged);
    window.addEventListener("arc:page-query", selectionChanged);
    return () => {
      controller.abort(); generation.current?.controller.abort(); generation.current = null;
      window.removeEventListener("popstate", selectionChanged);
      window.removeEventListener("arc:page-query", selectionChanged);
    };
  }, []);
  useEffect(() => {
    let current = true;
    queueMicrotask(() => { if (current && handoff) { setMessage(handoff.slice(0, 6000)); setHandoff(""); } });
    return () => { current = false; };
  }, [handoff, setHandoff, setMessage]);
  useEffect(() => {
    if (!pollingId || submitting) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      try {
        const next = await agentClient.poll(pollingId, controller.signal);
        if (controller.signal.aborted) return;
        setLocalRun(next); setError(null); failures = 0;
        if (next.status !== "starting" && next.status !== "running") { await refresh(); return; }
      } catch (e) {
        if (controller.signal.aborted) return;
        failures += 1; setError(e instanceof Error ? e.message : "Planning progress is temporarily unavailable.");
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), Math.min(15000, 3000 * (failures + 1)));
    };
    timer = setTimeout(() => void poll(), 1500);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [pollingId, refresh, submitting]);
  const start = async () => {
    if (!enabled || !workspace?.goalId || !workspace.baseVersionId || workspace.revision === null
      || submitting || generation.current || pollingId || pending || !message.trim()) return;
    const attempt = { controller: new AbortController(), selection: selectedRunId, runId: null as string | null };
    generation.current = attempt;
    const signal = attempt.controller.signal;
    const current = () => generation.current === attempt && !signal.aborted;
    setSubmitting(true); setError(null); setNotice(null);
    try {
      const next = await agentClient.start({ requestId: crypto.randomUUID(), goalId: workspace.goalId,
        baseVersionId: workspace.baseVersionId, revision: workspace.revision, message: message.trim(), page: "coach", deep: true }, signal,
        started => { if (current()) {
          attempt.runId = started.id; attempt.selection = started.id;
          setLocalRun(started); updatePageQuery({ run: started.id }, true);
        } });
      if (!current()) return;
      attempt.runId = next.id; attempt.selection = next.id;
      setLocalRun(next); updatePageQuery({ run: next.id }, true); agents.setHandoff(""); await agents.refresh();
    } catch (e) {
      if (!current()) return;
      setError(e instanceof Error ? e.message : "Planning did not finish. Try again later.");
      await agents.refresh();
    } finally { if (current()) { generation.current = null; setSubmitting(false); } }
  };
  const stage = async () => {
    if (!run || sessionExpired || applying || stale || pending || applied) return;
    const signal = lifetime.current?.signal;
    setApplying(true); setError(null);
    try {
      await agentClient.apply(run.id);
      if (signal?.aborted) return;
      await planning.retry(signal); await agents.refresh();
      if (!signal?.aborted) setNotice("Your proposed plan is saved. Review the changes and choose whether to apply them.");
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "Could not prepare the proposed plan. Try again later."); }
    finally { if (!signal?.aborted) setApplying(false); }
  };
  const recover = async () => {
    if (refreshing) return;
    const signal = lifetime.current?.signal;
    setRefreshing(true);
    try { await planning.retry(signal); await agents.refresh(); }
    finally { if (!signal?.aborted) setRefreshing(false); }
  };
  const unavailable = agents.loading ? "Loading your learning goal…" : agents.error ?? (enabled ? null : learnerAvailability(workspace?.reason));
  const completedTaskCount = resolved.kind === "adaptive"
    ? new Set(resolved.workspace.events.flatMap(event => event.kind === "completed" ? [event.unitId] : [])).size
    : 0;

  return <main id="main-content" tabIndex={-1} className="coach-page coach-work-page">
    <section className="workspace-intro workspace-intro-with-return"><p className="eyebrow">Path tools</p><h1>Adjust learning plan</h1><p>Describe what needs to change, then review the suggestions before applying them.</p><Link className="workspace-return" href={returnTo}><span aria-hidden="true">←</span> {returnTo.split("?")[0] === "/today" ? "Back to Today" : returnTo === "/path" ? "Back to Path" : "Back to previous page"}</Link></section>
    <div className="coach-current"><span>Current learning goal</span><strong>{workspace?.goalId ? workspace.roleName : "Start with your learning goal"}</strong>
      {resolved.kind === "adaptive" && <span className="coach-current-progress">{resolved.workspace.availability.weeklyMinutes} min/week · {completedTaskCount} {completedTaskCount === 1 ? "task" : "tasks"} complete</span>}
      <Link href={workspace?.goalId ? "/setup?mode=edit&section=time" : setupHref(location)}>{workspace?.goalId ? "Edit availability ↗" : "Set a learning goal ↗"}</Link></div>
    <div className="coach-workspace">
      <details className={`coach-request-disclosure${hasAdvice ? " has-advice" : ""}`} open={!hasAdvice || requestOpenFor === run?.id} onToggle={event => { if (hasAdvice) setRequestOpenFor(event.currentTarget.open ? run!.id : null); }}>
      <summary>Edit your planning focus</summary>
      <section className="coach-request" aria-labelledby="coach-request-title" hidden={hasAdvice && requestOpenFor !== run?.id}>
        <p className="section-index">01 / Thoughtful planning</p><h2 id="coach-request-title">What would you like to work on?</h2>
        <form onSubmit={event => { event.preventDefault(); void start(); }}>
          <label htmlFor="coach-prompt">Your planning focus</label>
          <textarea id="coach-prompt" rows={5} maxLength={6000} value={message} disabled={agents.loading || !workspace?.goalId} onChange={event => setMessage(event.target.value)}
            placeholder="For example: I have 45 minutes a day. I want to strengthen the basics, then build a complete project." />
          <div className="coach-prompt-shortcuts">{["Help me shape my first plan", "Refocus my plan around my progress", "Help me strengthen the basics"].map(text =>
            <button key={text} type="button" onClick={() => setMessage(text)} disabled={agents.loading || !workspace?.goalId || submitting || Boolean(pollingId)}>{text}</button>)}</div>
          {unavailable && <p className="coach-notice" role="status">{unavailable}</p>}
          {pending && <p className="coach-notice">You have changes awaiting review. Review them below before starting another plan.</p>}
          <button className="coach-primary" type="submit" disabled={!enabled || agents.loading || submitting || Boolean(pollingId) || pending || !message.trim()}>
            {submitting || pollingId ? "Planning your next steps…" : "Create a proposal"} <span aria-hidden="true">↗</span></button>
          <p className="coach-caption">Keep this page open while your proposal is generated. Leaving or refreshing interrupts generation; your draft is kept and completed proposals are saved automatically.</p>
        </form>
      </section>
      </details>
      <details className="coach-how"><summary>What informs this proposal?</summary>
        <p className="section-index">Planning context</p><h2>Your goal, skills, and time</h2>
        <ol><li><span>01</span><div><h3>Understand your starting point</h3><p>Consider your goal, current skills, available time, and completed tasks.</p></div></li>
          <li><span>02</span><div><h3>Make the path clear</h3><p>Explain priorities, milestones, and the reasons behind them while preserving completed work.</p></div></li>
          <li><span>03</span><div><h3>Choose your next step</h3><p>Compare the proposal with your current plan before approving any changes.</p></div></li></ol>
        <button type="button" className="coach-tutor-link" onClick={() => agents.setView("chat")}>Have a question? Ask your companion ↗</button>
      </details>
    </div>
    {error && <p className="coach-error" role="alert">{error}</p>}
    {sessionExpired && <div className="coach-notice" role="status"><p>Your session expired. Sign in again to continue reviewing. Your draft is kept.</p>
      <Link className="coach-primary" href={signInHref(location, true)}>Sign in again</Link></div>}
    {!sessionExpired && workspace?.authenticated && (planning.recovery !== "none" || planning.source === "offline-cloud") &&
      <div className="coach-notice" role="status"><p>Your plan is not synced yet. Your saved proposal is safe; reload the plan to continue reviewing.</p>
        <button className="coach-primary" type="button" disabled={refreshing} onClick={() => void recover()}>
          {refreshing ? "Loading…" : "Reload plan"}</button></div>}
    {notice && <p className="coach-notice" role="status">{notice} <Link href="/today">Back to Today ↗</Link></p>}
    {selectionMissing && <section className="coach-notice" role="status"><h2>Proposal not found</h2>
      <p>This proposal does not belong to the current goal in this account. View the latest proposal or create a new one.</p>
      <button className="text-action" type="button" onClick={() => updatePageQuery({ run: null })}>View latest proposal</button></section>}
    {run && <section className="coach-result" aria-labelledby="coach-result-title">
      <div className="coach-result-heading"><p className="section-index">02 / Your proposal</p><details className="coach-generation-info"><summary>Generation details</summary><p>{run.model} · In-depth reasoning</p></details></div>
      {pollingId ? <div className="coach-progress" role="status"><span className="coach-progress-line" /><h2 id="coach-result-title">Shaping your learning path</h2>
        <p>Reviewing your goal, skills, and task prerequisites. Your proposal will explain each recommendation.</p></div>
        : run.status === "complete" && run.advice ? <>
          <h2 id="coach-result-title">{run.advice.summary}</h2><AnswerText text={run.advice.rationale} />
          <ol className="coach-milestones">{run.advice.milestones.map((milestone, index) =>
            <li key={index}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{milestone.title}</h3><p>{milestone.successCriteria}</p></div></li>)}</ol>
          <div className="coach-result-actions"><button className="coach-primary" type="button" onClick={() => void stage()}
            disabled={sessionExpired || applying || stale || pending || applied}>{applying ? "Preparing…" : applied ? "Ready for plan review" : "Review plan changes"}</button>
            <p>{applied ? "This proposal is ready for plan review." : stale ? "Your progress has changed. Create a new proposal to review the changes." : "Your path changes only after you approve the proposal."}</p></div>
        </> : <div role="status"><h2 id="coach-result-title">Your proposal did not finish</h2><p>{run.error ?? "Try again later. You can keep using your current learning path."}</p></div>}
    </section>}
    {resolved.kind === "adaptive" && resolved.workspace.pendingPlanVersionId && <PlanDiffReview
      workspace={resolved.workspace} registry={resolved.registry} recovery={planning.recovery}
      onAccept={planning.accept} onDiscard={planning.discard} onSuccess={text => { setNotice(text); void agents.refresh(); }} />}
  </main>;
}
