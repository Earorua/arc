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
import { CoachOverview, CoachRouteArt } from "./coach-overview";

export function LearningCoach() {
  const agents = useLearningAgents();
  if (agents.authPending || !agents.authenticated) return <main id="main-content" className="coach-page">
    <section className="coach-hero"><div>
      <p className="eyebrow">YOUR LEARNING COACH</p>
      <h1>把方向想清楚，<br /><em>再走下一步。</em></h1>
      <p className="coach-lede">梳理学习重点、拆解阶段成果；遇到卡点时，<br className="coach-desktop-break" />让学习伙伴结合当前任务帮你讲清楚。</p>
      {agents.authPending ? <p className="coach-lede" role="status">正在确认登录状态…</p> : <>
        <Link className="coach-primary" href="/sign-in">登录账号 <span aria-hidden="true">↗</span></Link>
        <p className="coach-caption">登录并完成学习设置后，即可使用规划与答疑。</p>
      </>}
    </div><CoachRouteArt /></section>
    <CoachOverview />
  </main>;
  return <CoachGoal key={JSON.stringify([agents.accountId, agents.workspace?.goalId ?? null])} />;
}
function CoachGoal() {
  const agents = useLearningAgents();
  const planning = usePlanningWorkspace({ cloudOnly: true });
  const [message, setMessage] = useState(agents.handoff || "请结合我的学习目标、当前基础和每周可用时间，梳理学习重点、阶段目标与推进顺序。");
  const [localRun, setLocalRun] = useState<PublicAgentRun | null>(null);
  const [submitting, setSubmitting] = useState(false), [applying, setApplying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const workspace = agents.workspace;
  const { handoff, refresh } = agents;
  const latest = workspace?.history.filter(run => run.kind === "planner").at(-1) ?? null;
  const run = localRun && (!latest || localRun.createdAt >= latest.createdAt) ? localRun : latest;
  const pollingId = run && (run.status === "starting" || run.status === "running") ? run.id : null;
  const resolved = resolveWorkspacePresentation(planning);
  const pending = resolved.kind === "adaptive" && Boolean(resolved.workspace.pendingPlanVersionId);
  const enabled = Boolean(workspace?.enabled && workspace.authenticated && workspace.goalId && workspace.baseVersionId);
  const stale = Boolean(run && (run.baseVersionId !== workspace?.baseVersionId || run.revision !== workspace?.revision));
  const applied = Boolean(run && planning.workspace?.events.some(event => event.mutationId === `agent-proposal-${run.id}`));

  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    return () => controller.abort();
  }, []);
  useEffect(() => {
    let current = true;
    queueMicrotask(() => { if (current && handoff) setMessage(handoff.slice(0, 6000)); });
    return () => { current = false; };
  }, [handoff]);
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
      || submitting || pollingId || pending || !message.trim()) return;
    const signal = lifetime.current?.signal;
    setSubmitting(true); setError(null); setNotice(null);
    try {
      const next = await agentClient.start({ requestId: crypto.randomUUID(), goalId: workspace.goalId,
        baseVersionId: workspace.baseVersionId, revision: workspace.revision, message: message.trim(), page: "coach", deep: true }, signal,
        started => { if (!signal?.aborted) setLocalRun(started); });
      if (signal?.aborted) return;
      setLocalRun(next); agents.setHandoff(""); await agents.refresh();
    } catch (e) {
      if (signal?.aborted) return;
      setError(e instanceof Error ? e.message : "规划未完成，请稍后重试。");
      await agents.refresh();
    } finally { if (!signal?.aborted) setSubmitting(false); }
  };
  const stage = async () => {
    if (!run || applying || stale || pending || applied) return;
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
  const unavailable = agents.loading ? "正在读取你的学习目标…" : agents.error ?? workspace?.reason;

  return <main id="main-content" className="coach-page">
    <div className="coach-breadcrumb"><Link href="/path">学习路线</Link><span>/</span><span>学习规划师</span></div>
    <section className="coach-hero">
      <div><p className="eyebrow">YOUR LEARNING COACH</p><h1>把方向想清楚，<br /><em>再走下一步。</em></h1>
        <p className="coach-lede">梳理学习重点、拆解阶段成果；遇到卡点时，<br className="coach-desktop-break" />让学习伙伴结合当前任务帮你讲清楚。</p>
      </div>
      <CoachRouteArt />
    </section>
    <div className="coach-workspace">
      <section className="coach-request" aria-labelledby="coach-request-title">
        <p className="section-index">01 / 深度规划</p><h2 id="coach-request-title">这一次，想解决什么？</h2>
        <div className="coach-current"><span>当前学习方向</span><strong>{workspace?.goalId ? workspace.roleName : "从你的学习目标开始"}</strong>
          <Link href="/setup">{workspace?.goalId ? "调整目标与时间 ↗" : "设置学习目标 ↗"}</Link></div>
        <form onSubmit={event => { event.preventDefault(); void start(); }}>
          <label htmlFor="coach-prompt">本次规划的重点</label>
          <textarea id="coach-prompt" rows={5} maxLength={6000} value={message} onChange={event => setMessage(event.target.value)}
            placeholder="例如：每天只有 45 分钟，想先补足基础，再做一个完整项目。" />
          <div className="coach-prompt-shortcuts">{["帮我梳理第一份学习方案", "根据当前进度调整学习重点", "帮我解决基础薄弱的问题"].map(text =>
            <button key={text} type="button" onClick={() => setMessage(text)} disabled={submitting || Boolean(pollingId)}>{text}</button>)}</div>
          {unavailable && <p className="coach-notice">{unavailable} {!workspace?.authenticated && !agents.loading && <Link href="/sign-in">登录 ↗</Link>}</p>}
          {pending && <p className="coach-notice">你有一份待确认的调整，请先处理下方的计划差异。</p>}
          <button className="coach-primary" type="submit" disabled={!enabled || agents.loading || submitting || Boolean(pollingId) || pending || !message.trim()}>
            {submitting || pollingId ? "正在深度规划…" : "开始深度规划"} <span aria-hidden="true">↗</span></button>
          <p className="coach-caption">深度规划可能需要几分钟，生成时请保持此页面打开。离开或刷新会中断生成；完成的方案会自动保存。</p>
        </form>
      </section>
      <aside className="coach-how">
        <p className="section-index">A LITTLE CLARITY</p><h2>方向有人梳理，<br />问题随时有人听。</h2>
        <ol><li><span>01</span><div><h3>先理解你</h3><p>参考学习目标、技能基础、可用时间，以及已经完成的任务。</p></div></li>
          <li><span>02</span><div><h3>把路线说清楚</h3><p>说明学习重点、阶段成果和安排理由，保留已完成的进度。</p></div></li>
          <li><span>03</span><div><h3>由你决定下一步</h3><p>先查看候选方案与当前计划的差异，确认后再更新路线。</p></div></li></ol>
        <button type="button" className="coach-tutor-link" onClick={() => agents.setView("chat")}>只是有个问题？找学习伙伴聊聊 ↗</button>
      </aside>
    </div>
    {error && <p className="coach-error" role="alert">{error}</p>}
    {workspace?.authenticated && (planning.recovery !== "none" || planning.source === "offline-cloud") &&
      <div className="coach-notice" role="status"><p>当前计划暂未同步。已保存的候选仍在，重新读取后可以继续审阅。</p>
        <button className="coach-primary" type="button" disabled={refreshing} onClick={() => void recover()}>
          {refreshing ? "正在读取…" : "重新读取计划"}</button></div>}
    {notice && <p className="coach-notice" role="status">{notice}</p>}
    {run && <section className="coach-result" aria-labelledby="coach-result-title">
      <div className="coach-result-heading"><p className="section-index">02 / 你的规划建议</p><span>{run.model} · 深度思考</span></div>
      {pollingId ? <div className="coach-progress" role="status"><span className="coach-progress-line" /><h2 id="coach-result-title">正在梳理你的学习路线</h2>
        <p>正在分析目标、当前基础与任务之间的前置关系。完成后，你会看到建议及其理由。</p></div>
        : run.status === "complete" && run.advice ? <>
          <h2 id="coach-result-title">{run.advice.summary}</h2><AnswerText text={run.advice.rationale} />
          <ol className="coach-milestones">{run.advice.milestones.map((milestone, index) =>
            <li key={index}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{milestone.title}</h3><p>{milestone.successCriteria}</p></div></li>)}</ol>
          <div className="coach-result-actions"><button className="coach-primary" type="button" onClick={() => void stage()}
            disabled={applying || stale || pending || applied}>{applying ? "正在准备…" : applied ? "已提交计划审阅" : "查看计划差异"}</button>
            <p>{applied ? "这份建议已进入计划审阅流程。" : stale ? "你的学习进度已变化，请重新规划后查看差异。" : "建议经你确认后才会更新学习路线。"}</p></div>
        </> : <div role="status"><h2 id="coach-result-title">这次规划还没有完成</h2><p>{run.error ?? "请稍后重新提交，当前学习路线仍可继续使用。"}</p></div>}
    </section>}
    {resolved.kind === "adaptive" && resolved.workspace.pendingPlanVersionId && <PlanDiffReview
      workspace={resolved.workspace} registry={resolved.registry} recovery={planning.recovery}
      onAccept={planning.accept} onDiscard={planning.discard} onSuccess={text => { setNotice(text); void agents.refresh(); }} />}
    <CoachOverview />
  </main>;
}
