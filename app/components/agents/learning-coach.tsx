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
  if (agents.authPending || !agents.authenticated) return <div className="workspace-shell"><WorkspaceHeader current="Coach" context="学习规划" /><main id="main-content" tabIndex={-1} className="workspace-main">
    <section className="account-boundary">
      <p className="section-index">路线工具</p>
      <h1>调整学习计划</h1>
      <p className="account-boundary-description">登录后，结合当前目标、基础与时间，审阅适合你的调整建议。</p>
      {agents.authPending ? <p className="coach-lede" role="status">正在确认登录状态…</p> : <>
        <div className="account-boundary-actions"><Link className="coach-primary" href={signInHref(location)}>登录账号 <span aria-hidden="true">↗</span></Link><Link href="/showcase">先看公开样例</Link></div>
        <p className="account-device-note">本设备已有的学习记录会保留。登录后如有可迁移记录，你可以选择是否导入账号。</p>
      </>}
    </section>
  </main></div>;
  return <div className="workspace-shell"><WorkspaceHeader current="Coach" context={agents.workspace?.roleName ?? "学习规划"} /><CoachGoal location={location} key={JSON.stringify([agents.accountId, agents.workspace?.goalId ?? null])} /></div>;
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
        failures += 1; setError(e instanceof Error ? e.message : "暂时无法读取规划进度。");
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
      setError(e instanceof Error ? e.message : "规划未完成，请稍后重试。");
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
      if (!signal?.aborted) setNotice("候选计划已保存。载入差异后，你可以选择是否采用。");
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "暂时无法准备候选计划。"); }
    finally { if (!signal?.aborted) setApplying(false); }
  };
  const recover = async () => {
    if (refreshing) return;
    const signal = lifetime.current?.signal;
    setRefreshing(true);
    try { await planning.retry(signal); await agents.refresh(); }
    finally { if (!signal?.aborted) setRefreshing(false); }
  };
  const unavailable = agents.loading ? "正在读取你的学习目标…" : agents.error ?? (enabled ? null : learnerAvailability(workspace?.reason));

  return <main id="main-content" tabIndex={-1} className="coach-page coach-work-page">
    <section className="workspace-intro workspace-intro-with-return"><p className="eyebrow">路线工具</p><h1>调整学习计划</h1><p>说清需要改变的地方，审阅建议后再决定是否采用。</p><Link className="workspace-return" href={returnTo}><span aria-hidden="true">←</span> {returnTo.split("?")[0] === "/today" ? "返回今日任务" : returnTo === "/path" ? "返回学习路线" : "返回来源页面"}</Link></section>
    <div className="coach-current"><span>当前学习方向</span><strong>{workspace?.goalId ? workspace.roleName : "从你的学习目标开始"}</strong>
      {resolved.kind === "adaptive" && <span className="coach-current-progress">每周 {resolved.workspace.availability.weeklyMinutes} 分钟 · 已完成 {new Set(resolved.workspace.events.flatMap(event => event.kind === "completed" ? [event.unitId] : [])).size} 项任务</span>}
      <Link href={workspace?.goalId ? "/setup?mode=edit&section=time" : setupHref(location)}>{workspace?.goalId ? "调整可用时间 ↗" : "设置学习目标 ↗"}</Link></div>
    <div className="coach-workspace">
      <details className={`coach-request-disclosure${hasAdvice ? " has-advice" : ""}`} open={!hasAdvice || requestOpenFor === run?.id} onToggle={event => { if (hasAdvice) setRequestOpenFor(event.currentTarget.open ? run!.id : null); }}>
      <summary>编辑本次规划重点</summary>
      <section className="coach-request" aria-labelledby="coach-request-title" hidden={hasAdvice && requestOpenFor !== run?.id}>
        <p className="section-index">01 / 深度规划</p><h2 id="coach-request-title">这一次，想解决什么？</h2>
        <form onSubmit={event => { event.preventDefault(); void start(); }}>
          <label htmlFor="coach-prompt">本次规划的重点</label>
          <textarea id="coach-prompt" rows={5} maxLength={6000} value={message} disabled={agents.loading || !workspace?.goalId} onChange={event => setMessage(event.target.value)}
            placeholder="例如：每天只有 45 分钟，想先补足基础，再做一个完整项目。" />
          <div className="coach-prompt-shortcuts">{["帮我梳理第一份学习方案", "根据当前进度调整学习重点", "帮我解决基础薄弱的问题"].map(text =>
            <button key={text} type="button" onClick={() => setMessage(text)} disabled={agents.loading || !workspace?.goalId || submitting || Boolean(pollingId)}>{text}</button>)}</div>
          {unavailable && <p className="coach-notice" role="status">{unavailable}</p>}
          {pending && <p className="coach-notice">你有一份待确认的调整，请先处理下方的计划差异。</p>}
          <button className="coach-primary" type="submit" disabled={!enabled || agents.loading || submitting || Boolean(pollingId) || pending || !message.trim()}>
            {submitting || pollingId ? "正在深度规划…" : "开始深度规划"} <span aria-hidden="true">↗</span></button>
          <p className="coach-caption">生成时请保持此页面打开。离开或刷新会中断生成；输入草稿会保留，完成的方案会自动保存。</p>
        </form>
      </section>
      </details>
      <details className="coach-how"><summary>这次调整会参考什么？</summary>
        <p className="section-index">本次规划会参考</p><h2>目标、基础与可用时间</h2>
        <ol><li><span>01</span><div><h3>先理解你</h3><p>参考学习目标、技能基础、可用时间，以及已经完成的任务。</p></div></li>
          <li><span>02</span><div><h3>把路线说清楚</h3><p>说明学习重点、阶段成果和安排理由，保留已完成的进度。</p></div></li>
          <li><span>03</span><div><h3>由你决定下一步</h3><p>先查看候选方案与当前计划的差异，确认后再更新路线。</p></div></li></ol>
        <button type="button" className="coach-tutor-link" onClick={() => agents.setView("chat")}>只是有个问题？找学习伙伴聊聊 ↗</button>
      </details>
    </div>
    {error && <p className="coach-error" role="alert">{error}</p>}
    {sessionExpired && <div className="coach-notice" role="status"><p>登录状态已过期，请重新登录后继续审阅。输入草稿会保留。</p>
      <Link className="coach-primary" href={signInHref(location, true)}>重新登录</Link></div>}
    {!sessionExpired && workspace?.authenticated && (planning.recovery !== "none" || planning.source === "offline-cloud") &&
      <div className="coach-notice" role="status"><p>当前计划暂未同步。已保存的候选仍在，重新读取后可以继续审阅。</p>
        <button className="coach-primary" type="button" disabled={refreshing} onClick={() => void recover()}>
          {refreshing ? "正在读取…" : "重新读取计划"}</button></div>}
    {notice && <p className="coach-notice" role="status">{notice} <Link href="/today">返回今日学习 ↗</Link></p>}
    {selectionMissing && <section className="coach-notice" role="status"><h2>找不到这份规划建议</h2>
      <p>这份建议不在当前账户的当前目标中。你可以查看最新建议，或重新规划。</p>
      <button className="text-action" type="button" onClick={() => updatePageQuery({ run: null })}>查看最新建议</button></section>}
    {run && <section className="coach-result" aria-labelledby="coach-result-title">
      <div className="coach-result-heading"><p className="section-index">02 / 你的规划建议</p><details className="coach-generation-info"><summary>生成信息</summary><p>{run.model} · 深度思考</p></details></div>
      {pollingId ? <div className="coach-progress" role="status"><span className="coach-progress-line" /><h2 id="coach-result-title">正在梳理你的学习路线</h2>
        <p>正在分析目标、当前基础与任务之间的前置关系。完成后，你会看到建议及其理由。</p></div>
        : run.status === "complete" && run.advice ? <>
          <h2 id="coach-result-title">{run.advice.summary}</h2><AnswerText text={run.advice.rationale} />
          <ol className="coach-milestones">{run.advice.milestones.map((milestone, index) =>
            <li key={index}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{milestone.title}</h3><p>{milestone.successCriteria}</p></div></li>)}</ol>
          <div className="coach-result-actions"><button className="coach-primary" type="button" onClick={() => void stage()}
            disabled={sessionExpired || applying || stale || pending || applied}>{applying ? "正在准备…" : applied ? "已提交计划审阅" : "查看计划差异"}</button>
            <p>{applied ? "这份建议已进入计划审阅流程。" : stale ? "你的学习进度已变化，请重新规划后查看差异。" : "建议经你确认后才会更新学习路线。"}</p></div>
        </> : <div role="status"><h2 id="coach-result-title">这次规划还没有完成</h2><p>{run.error ?? "请稍后重新提交，当前学习路线仍可继续使用。"}</p></div>}
    </section>}
    {resolved.kind === "adaptive" && resolved.workspace.pendingPlanVersionId && <PlanDiffReview
      workspace={resolved.workspace} registry={resolved.registry} recovery={planning.recovery}
      onAccept={planning.accept} onDiscard={planning.discard} onSuccess={text => { setNotice(text); void agents.refresh(); }} />}
  </main>;
}
