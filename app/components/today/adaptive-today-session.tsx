"use client";

import { useMemo, useState } from "react";
import type { LearningResource, RoleBlueprint } from "../../contracts/intelligence";
import { parsePlanningWorkspaceAtRepositoryBoundary, type DailyUnit, type PlanningEventInput, type PlanningWorkspace, type UnitRegistry } from "../../contracts/planning";
import { flagshipBlueprint } from "../../data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../data/flagship-unit-registry";
import { planningDateForInstant } from "../../lib/planning/calendar";
import type { PlanningRecoveryState } from "../../lib/use-planning-workspace";
import { PlanDiffReview } from "../workspace/plan-diff-review";
import { PlanningVersionBoundary } from "../workspace/planning-version-boundary";
import { SevenDayTimeline } from "../workspace/seven-day-timeline";

type AdaptiveTodaySessionProps = {
  workspace: unknown;
  recovery?: PlanningRecoveryState;
  record: (event: PlanningEventInput) => Promise<boolean>;
  accept: (candidatePlanVersionId: string) => Promise<boolean>;
  discard: (candidatePlanVersionId: string) => Promise<boolean>;
  blueprint?: RoleBlueprint;
  registry?: UnitRegistry;
  now?: () => Date;
};

const actionEvents = [
  ["Delay", "delayed"], ["Skip", "skipped"], ["Too hard", "too_hard"], ["Already know this", "already_known"],
] as const;

const systemNow = () => new Date();

export function AdaptiveTodaySession({ workspace: value, recovery = "none", record, accept, discard, blueprint = flagshipBlueprint, registry = flagshipUnitRegistry, now = systemNow }: AdaptiveTodaySessionProps) {
  const resolved = useMemo(() => resolveToday(value, blueprint, registry, now), [blueprint, now, registry, value]);
  const [progress, setProgress] = useState<{ unitId: string; checked: Set<string> }>(() => ({ unitId: "", checked: new Set() }));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "status" | "alert"; text: string } | null>(null);
  if (!resolved) return <PlanningVersionBoundary />;
  if (!resolved.primary) return <><section className="adaptive-today-session"><p className="eyebrow">Today · {resolved.today}</p><h1>Rest is part of the plan.</h1><p>No required learning unit is scheduled today.</p>{message && <p role={message.kind}>{message.text}</p>}</section><SevenDayTimeline workspace={resolved.workspace} blueprint={blueprint} registry={registry} /></>;
  const requiredSteps = resolved.primary.steps;
  const checked = progress.unitId === resolved.primary.id ? progress.checked : new Set<string>();
  const canComplete = requiredSteps.every(({ id }) => checked.has(id));
  const send = async (kind: "completed" | "delayed" | "skipped" | "too_hard" | "already_known") => {
    if (pending || (kind === "completed" && !canComplete)) return;
    setPending(true); setMessage(null);
    try {
      const saved = await record({ kind, unitId: resolved.primary!.id, planningDate: resolved.today, ...(kind === "completed" ? { actualMinutes: null } : {}) } as PlanningEventInput);
      if (!saved) setMessage({ kind: "alert", text: recovery === "conflict" ? "This plan changed on another device. Refresh before continuing." : "Arc could not update this plan. Try again when the connection recovers." });
      else if (kind === "completed") setMessage({ kind: "status", text: "Completed. Today has rolled forward." });
      else setMessage({ kind: "status", text: "Candidate plan ready for review. Your current plan has not changed." });
    } catch {
      setMessage({ kind: "alert", text: recovery === "conflict" ? "This plan changed on another device. Refresh before continuing." : "Arc could not update this plan. Try again when the connection recovers." });
    } finally {
      setPending(false);
    }
  };
  return <>
    <article className="adaptive-today-session" aria-labelledby="adaptive-today-title">
      <header><p className="eyebrow">Today · {resolved.today} · Primary outcome</p><p className="today-duration"><strong>{resolved.primary.estimatedMinutes}</strong><span>minutes</span></p><h1 id="adaptive-today-title">{resolved.primary.objective}</h1><p>{resolved.primary.whyNow}</p></header>
      <ResourceLinks primary={resolved.primaryResource} alternatives={resolved.alternativeResources} />
      <section className="today-work"><h2>Work the sequence.</h2><ol>{resolved.primary.steps.map((step) => <li key={step.id}><label><input checked={checked.has(step.id)} onChange={(event) => setProgress((current) => { const next = new Set(current.unitId === resolved.primary!.id ? current.checked : []); if (event.target.checked) next.add(step.id); else next.delete(step.id); return { unitId: resolved.primary!.id, checked: next }; })} type="checkbox" /><span>{step.label}</span><time>{step.minutes} min</time></label></li>)}</ol></section>
      <section className="today-brief"><div><p className="section-index">Build</p><p>{resolved.primary.buildTask}</p></div><div><p className="section-index">Completion criteria</p><ul>{resolved.primary.completionCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul></div><div><p className="section-index">Proof requirement</p><p>{resolved.primary.proofRequirement}</p></div><div><p className="section-index">Rubric</p><ol>{resolved.primary.rubric.map((row) => <li key={row}>{row}</li>)}</ol></div></section>
      {canComplete && resolved.stretch && <aside className="today-stretch"><p className="section-index">Optional stretch · {resolved.stretch.estimatedMinutes} minutes</p><h2>{resolved.stretch.objective}</h2><p>{resolved.stretch.whyNow}</p></aside>}
      <div className="today-actions"><button disabled={pending || !canComplete} onClick={() => void send("completed")} type="button">Complete</button>{actionEvents.map(([label, kind]) => <button disabled={pending} key={kind} onClick={() => void send(kind)} type="button">{label}</button>)}</div>
      {message && <p role={message.kind}>{message.kind === "alert" && recovery === "conflict" ? "This plan changed on another device. Refresh before continuing." : message.text}</p>}
    </article>
    {resolved.workspace.pendingPlanVersionId && <PlanDiffReview workspace={resolved.workspace} recovery={recovery} onAccept={accept} onDiscard={discard} onSuccess={(text) => setMessage({ kind: "status", text })} />}
    <SevenDayTimeline workspace={resolved.workspace} blueprint={blueprint} registry={registry} />
  </>;
}

function resolveToday(value: unknown, blueprint: RoleBlueprint, registry: UnitRegistry, now: () => Date) {
  try {
    const workspace = parsePlanningWorkspaceAtRepositoryBoundary(value);
    const path = workspace.pathVersions.find(({ id }) => id === workspace.activePathVersionId);
    const plan = workspace.planVersions.find(({ id }) => id === workspace.activePlanVersionId);
    if (!path || !plan || plan.pathVersionId !== path.id
      || path.blueprintId !== blueprint.id || path.blueprintVersion !== blueprint.version
      || path.registryId !== registry.id || path.registryVersion !== registry.version
      || registry.blueprintId !== blueprint.id || registry.blueprintVersion !== blueprint.version) return null;
    const today = planningDateForInstant(now().toISOString(), workspace.availability.timeZone);
    const units = new Map(workspace.dailyUnits.filter(({ planVersionId }) => planVersionId === plan.id).map((unit) => [unit.id, unit]));
    const nextRequired = plan.days
      .map(({ primaryUnitId }) => primaryUnitId ? units.get(primaryUnitId) ?? null : null)
      .find((unit) => unit !== null && unit.scheduledDate <= today) ?? null;
    const day = nextRequired
      ? plan.days.find(({ primaryUnitId }) => primaryUnitId === nextRequired.id)
      : plan.days.find(({ date }) => date === today);
    if (!day) return null;
    const resources = new Map(blueprint.resources.map((resource) => [resource.id, resource]));
    const primary = nextRequired;
    const stretch = day.stretchUnitId ? units.get(day.stretchUnitId) ?? null : null;
    return { workspace, plan, today, primary, stretch, primaryResource: primary ? resources.get(primary.primaryResourceId) ?? null : null, alternativeResources: primary ? primary.alternativeResourceIds.map((id) => resources.get(id)).filter((resource): resource is LearningResource => Boolean(resource)) : [] } satisfies TodayResolution;
  } catch { return null; }
}

type TodayResolution = { workspace: PlanningWorkspace; plan: PlanningWorkspace["planVersions"][number]; today: string; primary: DailyUnit | null; stretch: DailyUnit | null; primaryResource: LearningResource | null; alternativeResources: LearningResource[] };

function ResourceLinks({ primary, alternatives }: { primary: LearningResource | null; alternatives: LearningResource[] }) {
  return <section className="today-resources" aria-labelledby="today-resources-title"><p className="section-index" id="today-resources-title">Sources</p>{primary ? <p><a href={primary.url} hrefLang={primary.language} lang={primary.language} rel="noreferrer" target="_blank">{primary.title}</a><span>{primary.provider} · Primary</span></p> : <p>Primary source unavailable for this recorded content version.</p>}{alternatives.length > 0 && <ul>{alternatives.map((resource) => <li key={resource.id}><a href={resource.url} hrefLang={resource.language} lang={resource.language} rel="noreferrer" target="_blank">{resource.title}</a></li>)}</ul>}</section>;
}
