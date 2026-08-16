"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { parsePlanningWorkspaceAtRepositoryBoundary, type UnitRegistry } from "../../contracts/planning";
import { flagshipUnitRegistry } from "../../data/flagship-unit-registry";
import { diffPlans } from "../../lib/planning/plan-diff";

type PlanDiffReviewProps = {
  workspace: unknown;
  recovery?: "none" | "session-expired" | "conflict" | "unavailable";
  onAccept: (candidatePlanVersionId: string) => Promise<boolean>;
  onDiscard: (candidatePlanVersionId: string) => Promise<boolean>;
  registry?: UnitRegistry;
};

export function PlanDiffReview({ workspace: value, recovery = "none", onAccept, onDiscard, registry = flagshipUnitRegistry }: PlanDiffReviewProps) {
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
  if (resolved.kind === "unavailable") return <p className="workspace-notice" role="alert"><strong>Plan version unavailable.</strong> Rebuild it from <Link href="/setup">Setup</Link>.</p>;
  const counts = (["added", "moved", "removed", "unchanged"] as const).map((change) => ({ change, count: resolved.diff.items.filter((item) => item.change === change).length }));
  const decide = async (kind: "accept" | "discard") => {
    if (pending) return;
    setPending(true); setMessage(null);
    try {
      const succeeded = await (kind === "accept" ? onAccept : onDiscard)(resolved.candidate.id);
      if (succeeded) setMessage({ kind: "status", text: kind === "accept" ? "Candidate plan accepted." : "Current plan kept." });
      else setMessage({ kind: "alert", text: recovery === "conflict" ? "This plan changed on another device. Refresh before deciding." : "Arc could not save this decision. Try again when the connection recovers." });
    } catch {
      setMessage({ kind: "alert", text: recovery === "conflict" ? "This plan changed on another device. Refresh before deciding." : "Arc could not save this decision. Try again when the connection recovers." });
    } finally {
      setPending(false);
    }
  };
  return <section className="plan-diff-review" aria-labelledby="plan-diff-title">
    <p className="section-index">Candidate plan · review before changing</p>
    <h2 id="plan-diff-title" ref={headingRef} tabIndex={-1}>Review every change.</h2>
    <p>{resolved.diff.summary}</p>
    <dl className="diff-counts">{counts.map(({ change, count }) => <div key={change}><dt>{change}</dt><dd>{count}</dd></div>)}</dl>
    <p className="diff-completion"><span>Current completion · {resolved.diff.previousEstimatedCompletionDate}</span><span>Candidate completion · {resolved.diff.nextEstimatedCompletionDate}</span></p>
    <ul className="diff-items">{resolved.diff.items.map((item) => <li key={item.unitId}><strong><span>{item.change}</span><span>{resolved.labels.get(item.unitId) ?? "Recorded learning unit"}</span></strong><span>{item.fromDate ?? "Not scheduled"} → {item.toDate ?? "Not scheduled"}</span><p>{item.reason}</p></li>)}</ul>
    <div className="diff-actions"><button disabled={pending} onClick={() => void decide("accept")} type="button">Accept new plan</button><button disabled={pending} onClick={() => void decide("discard")} type="button">Keep current plan</button></div>
    {message && <p role={message.kind}>{message.kind === "alert" && recovery === "conflict" ? "This plan changed on another device. Refresh before deciding." : message.text}</p>}
  </section>;
}
