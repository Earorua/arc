"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parsePlanningWorkspaceAtRepositoryBoundary, type UnitRegistry } from "../../contracts/planning";
import { flagshipUnitRegistry } from "../../data/flagship-unit-registry";
import { diffPlans } from "../../lib/planning/plan-diff";
import type { PlanningRecoveryState } from "../../lib/use-planning-workspace";
import { PlanningVersionBoundary } from "./planning-version-boundary";

type PlanDiffReviewProps = {
  workspace: unknown;
  recovery?: PlanningRecoveryState;
  onAccept: (candidatePlanVersionId: string) => Promise<boolean>;
  onDiscard: (candidatePlanVersionId: string) => Promise<boolean>;
  onSuccess?: (message: string) => void;
  registry?: UnitRegistry;
};

export function PlanDiffReview({ workspace: value, recovery = "none", onAccept, onDiscard, onSuccess, registry = flagshipUnitRegistry }: PlanDiffReviewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "status" | "alert"; text: string } | null>(null);
  const resolved = useMemo(() => {
    try {
      const workspace = parsePlanningWorkspaceAtRepositoryBoundary(value);
      if (workspace.pendingPlanVersionId === null) return { kind: "none" } as const;
      const active = workspace.planVersions.find(({ id }) => id === workspace.activePlanVersionId);
      const candidate = workspace.planVersions.find(({ id }) => id === workspace.pendingPlanVersionId);
      if (!active || !candidate) return { kind: "unavailable" } as const;
      const activePath = workspace.pathVersions.find(({ id }) => id === active.pathVersionId);
      const candidatePath = workspace.pathVersions.find(({ id }) => id === candidate.pathVersionId);
      const paths = [activePath, candidatePath];
      if (paths.some((path) => !path || path.registryId !== registry.id || path.registryVersion !== registry.version
        || path.blueprintId !== registry.blueprintId || path.blueprintVersion !== registry.blueprintVersion)) return { kind: "unavailable" } as const;
      const completed = new Set(workspace.events.filter((event) => event.kind === "completed").map((event) => event.unitId));
      const templates = new Map(registry.tracks.flatMap(({ templates: rows }) => rows).map((template) => [template.id, template.title]));
      const labels = new Map<string, string>();
      for (const unit of workspace.dailyUnits) {
        const title = templates.get(unit.templateId);
        if (title) labels.set(unit.id, title);
      }
      return { kind: "ready", candidate, diff: diffPlans({ active, candidate, completedUnitIds: completed }), labels } as const;
    } catch { return { kind: "unavailable" } as const; }
  }, [registry, value]);
  useEffect(() => { if (resolved.kind === "ready") headingRef.current?.focus(); }, [resolved]);
  if (resolved.kind === "none") return null;
  if (resolved.kind === "unavailable") return <PlanningVersionBoundary />;
  const changeLabels = { added: "新增", moved: "调整日期", removed: "移除", unchanged: "不变" };
  const counts = (["added", "moved", "removed", "unchanged"] as const).map((change) => ({ change, count: resolved.diff.items.filter((item) => item.change === change).length }));
  const decide = async (kind: "accept" | "discard") => {
    if (pending) return;
    setPending(true); setMessage(null);
    try {
      const succeeded = await (kind === "accept" ? onAccept : onDiscard)(resolved.candidate.id);
      if (succeeded) {
        const text = kind === "accept" ? "已接受新安排。" : "已保留当前安排。";
        if (onSuccess) onSuccess(text);
        else setMessage({ kind: "status", text });
      }
      else setMessage({ kind: "alert", text: recovery === "conflict" ? "计划已在另一台设备上发生变化，请刷新后再决定。" : "暂时无法保存这个决定，请在连接恢复后重试。" });
    } catch {
      setMessage({ kind: "alert", text: recovery === "conflict" ? "计划已在另一台设备上发生变化，请刷新后再决定。" : "暂时无法保存这个决定，请在连接恢复后重试。" });
    } finally {
      setPending(false);
    }
  };
  return <section className="plan-diff-review" aria-labelledby="plan-diff-title">
    <p className="section-index">调整建议 · 等待你的确认</p>
    <h2 id="plan-diff-title" ref={headingRef} tabIndex={-1}>这次调整会改变什么</h2>
    <p>查看时间与任务变化。只有点击「接受新安排」后，建议才会生效。</p><p className="diff-source-summary">{resolved.diff.summary}</p>
    <dl className="diff-counts">{counts.map(({ change, count }) => <div key={change}><dt>{changeLabels[change]}</dt><dd>{count}</dd></div>)}</dl>
    <p className="diff-completion"><span>当前预计完成 · {resolved.diff.previousEstimatedCompletionDate}</span><span>调整后预计完成 · {resolved.diff.nextEstimatedCompletionDate}</span></p>
    <details className="diff-details"><summary>查看逐项变化</summary><ul className="diff-items">{resolved.diff.items.map((item) => <li key={item.unitId}><strong><span>{changeLabels[item.change]}</span><span>{resolved.labels.get(item.unitId) ?? "已记录的学习单元"}</span></strong><span>{item.fromDate ?? "未安排"} → {item.toDate ?? "未安排"}</span><p>{item.reason}</p></li>)}</ul></details>
    <div className="diff-actions"><button disabled={pending} onClick={() => void decide("accept")} type="button">接受新安排</button><button disabled={pending} onClick={() => void decide("discard")} type="button">保留当前安排</button></div>
    {message && <p role={message.kind}>{message.kind === "alert" && recovery === "conflict" ? "计划已在另一台设备上发生变化，请刷新后再决定。" : message.text}</p>}
  </section>;
}
