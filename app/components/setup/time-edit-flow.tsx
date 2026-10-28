"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PlanningWorkspace, UnitRegistry } from "../../contracts/planning";
import { usePlanningWorkspace, type PlanningWorkspaceController } from "../../lib/use-planning-workspace";
import { resolveWorkspacePresentation } from "../../lib/workspace-presentation";
import { planningDateForInstant } from "../../lib/planning/calendar";
import { PlanDiffReview } from "../workspace/plan-diff-review";
import { AvailabilityStep, isAvailabilityDraftValid, type AvailabilityDraft } from "./availability-step";
import { readSetupDraft, removeSetupDraft, timeEditDraftSchema, writeSetupDraft } from "./setup-draft";
import { toAvailability } from "./adaptive-setup-flow";

export function TimeEditFlow({ signedIn, draftOwner, onResearchActiveChange }: { signedIn: boolean; draftOwner: string; onResearchActiveChange: (active: boolean) => void }) {
  const planning = usePlanningWorkspace({ cloudOnly: signedIn });
  const [decisionMessage, setDecisionMessage] = useState<{ goalId: string; text: string } | null>(null);
  useEffect(() => { onResearchActiveChange(false); }, [onResearchActiveChange]);
  const resolved = planning.cloudGoalMissing && !planning.workspace && !planning.sourceContext ? { kind: "legacy" as const } : resolveWorkspacePresentation(planning);
  if (resolved.kind === "loading") return <section className="setup-flow"><h1>调整每周时间</h1><p role="status">正在读取当前计划…</p></section>;
  if (resolved.kind !== "adaptive") return <section className="setup-flow"><h1>调整每周时间</h1>
    <p role="alert">{resolved.kind === "legacy" ? "当前还没有可调整时间的自适应计划。创建目标后即可安排每周时间。" : "暂时无法读取当前计划。请重试后再调整时间。"}</p>
    {resolved.kind !== "legacy" && <button type="button" className="setup-next" onClick={() => void planning.retry()}>重新读取计划</button>}
    <Link className="text-action" href="/path">返回当前路线</Link>
    {resolved.kind === "legacy" && <Link className="text-action" href="/setup?mode=create">创建学习目标</Link>}
  </section>;
  return <CurrentTimeEditor key={`${draftOwner}:${resolved.workspace.goalId}:${resolved.workspace.availability.id}`} draftOwner={draftOwner} decisionMessage={decisionMessage?.goalId === resolved.workspace.goalId ? decisionMessage.text : null} onDecision={(text) => setDecisionMessage(text ? { goalId: resolved.workspace.goalId, text } : null)} planning={planning} workspace={resolved.workspace} registry={resolved.registry} roleName={resolved.blueprint.name} />;
}

function CurrentTimeEditor({ planning, workspace, registry, roleName, draftOwner, decisionMessage, onDecision }: { decisionMessage: string | null; onDecision: (text: string | null) => void; draftOwner: string; planning: PlanningWorkspaceController; workspace: PlanningWorkspace; registry: UnitRegistry; roleName: string }) {
  const [draft, setDraft] = useState<AvailabilityDraft>(() => ({ timeZone: workspace.availability.timeZone, weekdays: { ...workspace.availability.weekdays }, exceptions: [...workspace.availability.exceptions] }));
  const [draftSource] = useState(() => `time:${workspace.goalId}:${workspace.availability.id}`);
  const [draftReady, setDraftReady] = useState(false);
  const [draftFinished, setDraftFinished] = useState(false);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      const saved = readSetupDraft(draftOwner, draftSource, timeEditDraftSchema);
      if (saved && !workspace.pendingPlanVersionId) { setDraft(saved); setRestored(true); }
      setDraftReady(true);
    });
    return () => { current = false; };
  }, [draftOwner, draftSource, workspace.pendingPlanVersionId]);
  useEffect(() => {
    if (draftReady && !draftFinished && !workspace.pendingPlanVersionId) writeSetupDraft(draftOwner, draftSource, timeEditDraftSchema, draft);
  }, [draft, draftFinished, draftOwner, draftReady, draftSource, workspace.pendingPlanVersionId]);
  const clearDraft = () => { removeSetupDraft(draftOwner, draftSource); setDraftFinished(true); setRestored(false); };
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "status" | "alert"; text: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const lifecycle = useRef(0);
  useEffect(() => { heading.current?.focus(); lifecycle.current += 1; return () => { lifecycle.current += 1; }; }, []);
  let planningDate: string;
  try { planningDate = planningDateForInstant(new Date().toISOString(), draft.timeZone); }
  catch { planningDate = planningDateForInstant(new Date().toISOString(), workspace.availability.timeZone); }
  const changed = JSON.stringify(draft) !== JSON.stringify({ timeZone: workspace.availability.timeZone, weekdays: workspace.availability.weekdays, exceptions: workspace.availability.exceptions });
  const reconnect = async () => {
    if (pending) return;
    const epoch = lifecycle.current; setPending(true);
    try { await planning.retry(); }
    catch { if (epoch === lifecycle.current) setMessage({ kind: "alert", text: "暂时无法重新读取计划，请稍后重试。" }); }
    finally { if (epoch === lifecycle.current) setPending(false); }
  };
  const preview = async () => {
    if (pending || workspace.pendingPlanVersionId || !isAvailabilityDraftValid(draft, planningDate)) return;
    const epoch = lifecycle.current; setPending(true); setMessage(null); onDecision(null);
    try {
      const saved = await planning.record({ kind: "availability_changed", availability: toAvailability(draft), planningDate });
      if (saved) removeSetupDraft(draftOwner, draftSource);
      if (epoch !== lifecycle.current) return;
      setMessage(saved ? { kind: "status", text: "调整建议已生成，请查看下方变化并选择接受或保留原安排。" } : { kind: "alert", text: "未能生成调整建议。你的当前计划仍保留，请重试。" });
    } catch { if (epoch === lifecycle.current) setMessage({ kind: "alert", text: "未能生成调整建议。你的当前计划仍保留，请重试。" }); }
    finally { if (epoch === lifecycle.current) setPending(false); }
  };
  return <section className="setup-flow time-edit-flow">
    <p className="setup-progress">调整当前计划 · 时间安排</p>
    <h1 ref={heading} tabIndex={-1}>调整每周时间</h1>
    <p className="setup-intent">{roleName} · {workspace.target.targetWeeks} 周目标。当前目标与已完成的记录会保留。</p>
    <p>先预览任务日期的变化，再决定是否接受。</p>
    {restored && <p className="setup-draft-notice">已恢复此目标尚未提交的时间草稿。</p>}
    <fieldset className="time-edit-fields" disabled={pending || Boolean(workspace.pendingPlanVersionId)}>
      <legend className="sr-only">每周可用时间</legend>
      <AvailabilityStep value={draft} onChange={(next) => { setDraftFinished(false); setDraft(next); }} planningDate={planningDate} />
    </fieldset>
    {!workspace.pendingPlanVersionId && <div className="setup-actions"><button type="button" className="setup-next" disabled={pending || planning.source === "offline-cloud" || !changed || !isAvailabilityDraftValid(draft, planningDate)} onClick={() => void preview()}>{pending ? "正在生成调整建议…" : "预览时间调整"}</button><Link className="text-action" href="/path" onClick={clearDraft}>取消，返回路线</Link></div>}
    {decisionMessage && <p role="status">{decisionMessage}</p>}
    {message && <p role={message.kind}>{message.text}</p>}
    {(planning.source === "offline-cloud" || message?.kind === "alert") && <button className="text-action" type="button" disabled={pending} onClick={() => void reconnect()}>重新读取当前计划</button>}
    {workspace.pendingPlanVersionId && <PlanDiffReview workspace={workspace} registry={registry} recovery={planning.recovery} onAccept={planning.accept} onDiscard={planning.discard} onSuccess={(text) => { clearDraft(); setMessage(null); onDecision(text); }} />}
    <div className="setup-completion-links"><Link className="text-action" href="/path">查看当前路线</Link><Link className="text-action" href="/today">开始今日任务</Link></div>
    <details className="setup-other-action"><summary>想改变学习目标？</summary><p>创建新目标是独立操作，保存前会说明历史记录的处理方式。</p><Link className="text-action" href="/setup?mode=create">创建新的学习目标</Link></details>
  </section>;
}
