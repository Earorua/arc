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
  onSuccess?: (message: string, decision: "accept" | "discard") => void;
  registry?: UnitRegistry;
  acceptLabel?: string;
};

export function PlanDiffReview({ workspace: value, recovery = "none", onAccept, onDiscard, onSuccess, registry = flagshipUnitRegistry, acceptLabel = "Accept new schedule" }: PlanDiffReviewProps) {
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
      const proposalEvent = [...workspace.events].reverse().find(({ targetPlanVersionId }) => targetPlanVersionId === active.id);
      const claimedSkillId = candidate.replanReason === "already_known" && proposalEvent?.kind === "already_known"
        ? workspace.dailyUnits.find(({ id, planVersionId }) => id === proposalEvent.unitId && planVersionId === active.id)?.skillId
        : undefined;
      const keepsUncertainLearning = active.pathVersionId === candidate.pathVersionId
        && workspace.audit.answers.some(({ skillId, level }) => skillId === claimedSkillId && level === "uncertain");
      return { kind: "ready", candidate, diff: diffPlans({ active, candidate, completedUnitIds: completed }), labels, keepsUncertainLearning } as const;
    } catch { return { kind: "unavailable" } as const; }
  }, [registry, value]);
  useEffect(() => { if (resolved.kind === "ready") headingRef.current?.focus(); }, [resolved]);
  if (resolved.kind === "none") return null;
  if (resolved.kind === "unavailable") return <PlanningVersionBoundary />;
  const changeLabels = { added: "Added", moved: "Rescheduled", removed: "Removed", unchanged: "Unchanged" };
  const counts = (["added", "moved", "removed", "unchanged"] as const).map((change) => ({ change, count: resolved.diff.items.filter((item) => item.change === change).length }));
  const decide = async (kind: "accept" | "discard") => {
    if (pending) return;
    setPending(true); setMessage(null);
    try {
      const succeeded = await (kind === "accept" ? onAccept : onDiscard)(resolved.candidate.id);
      if (succeeded) {
        const text = kind === "accept" ? "New schedule accepted." : "Current schedule kept.";
        if (onSuccess) onSuccess(text, kind);
        else setMessage({ kind: "status", text });
      }
      else setMessage({ kind: "alert", text: recovery === "conflict" ? "Your plan changed on another device. Refresh before making a decision." : "Your choice could not be saved. Try again when your connection is restored." });
    } catch {
      setMessage({ kind: "alert", text: recovery === "conflict" ? "Your plan changed on another device. Refresh before making a decision." : "Your choice could not be saved. Try again when your connection is restored." });
    } finally {
      setPending(false);
    }
  };
  return <section className="plan-diff-review" aria-labelledby="plan-diff-title">
    <p className="section-index">Proposed changes · Ready for review</p>
    <h2 id="plan-diff-title" ref={headingRef} tabIndex={-1}>What will change</h2>
    <p>Review the schedule and task changes. They take effect only after you select {acceptLabel}.</p><p className="diff-source-summary">{resolved.diff.summary}</p>
    {resolved.keepsUncertainLearning && <p className="workspace-notice">You rated this skill Unsure, so this self-assessment keeps its learning tasks. Calibration records practice; proof is updated after your work is reviewed. You can keep your schedule, then delay the task or adjust your study time.</p>}
    <dl className="diff-counts">{counts.map(({ change, count }) => <div key={change}><dt>{changeLabels[change]}</dt><dd>{count}</dd></div>)}</dl>
    <p className="diff-completion"><span>Current estimated finish · {resolved.diff.previousEstimatedCompletionDate}</span><span>Proposed estimated finish · {resolved.diff.nextEstimatedCompletionDate}</span></p>
    <details className="diff-details"><summary>View individual changes</summary><ul className="diff-items">{resolved.diff.items.map((item) => <li key={item.unitId}><strong><span>{changeLabels[item.change]}</span><span>{resolved.labels.get(item.unitId) ?? "Saved learning unit"}</span></strong><span>{item.fromDate ?? "Unscheduled"} → {item.toDate ?? "Unscheduled"}</span><p>{item.reason}</p></li>)}</ul></details>
    <div className="diff-actions"><button disabled={pending} onClick={() => void decide("accept")} type="button">{acceptLabel}</button><button disabled={pending} onClick={() => void decide("discard")} type="button">Keep current schedule</button></div>
    {message && <p role={message.kind}>{message.kind === "alert" && recovery === "conflict" ? "Your plan changed on another device. Refresh before making a decision." : message.text}</p>}
  </section>;
}
