"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { LearningResource, RoleBlueprint } from "../../contracts/intelligence";
import { parsePlanningWorkspaceAtRepositoryBoundary, type DailyUnit, type PlanningEventInput, type PlanningWorkspace, type UnitRegistry } from "../../contracts/planning";
import { flagshipBlueprint } from "../../data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../data/flagship-unit-registry";
import { planningDateForInstant } from "../../lib/planning/calendar";
import type { PlanningRecoveryState } from "../../lib/use-planning-workspace";
import { PlanDiffReview } from "../workspace/plan-diff-review";
import { PlanningVersionBoundary } from "../workspace/planning-version-boundary";
import { SevenDayTimeline } from "../workspace/seven-day-timeline";
import { TodayResources } from "./today-resources";
import { getCurrentLearningUnit } from "../../lib/planning/current-learning-unit";
import { getPathProgress } from "../../lib/planning/path-progress";

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
  ["Delay", "delayed"], ["Skip", "skipped"], ["Too difficult", "too_hard"], ["Already know this", "already_known"],
] as const;

const systemNow = () => new Date();
const candidateReadyMessage = "Your proposed changes are ready to review. Your current plan is unchanged.";
const completedPracticingMessage = "Task complete. This skill is now Practicing. Add proof of your work to show what you can do.";

export function AdaptiveTodaySession({ workspace: value, recovery = "none", record, accept, discard, blueprint = flagshipBlueprint, registry = flagshipUnitRegistry, now = systemNow }: AdaptiveTodaySessionProps) {
  const resolved = useMemo(() => resolveToday(value, blueprint, registry, now), [blueprint, now, registry, value]);
  const [progress, setProgress] = useState<{ unitId: string; checked: Set<string> }>(() => ({ unitId: "", checked: new Set() }));
  const [pending, setPending] = useState(false);
  const [completedUnitId, setCompletedUnitId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "status" | "alert"; text: string } | null>(null);
  if (!resolved) return <PlanningVersionBoundary />;
  if (!resolved.primary) return <><section className="adaptive-today-session"><p className="eyebrow">Today · {resolved.today}</p><h1>{resolved.allComplete ? "You have completed this path." : "Take a rest day."}</h1><p>{resolved.allComplete ? "Review what you have learned or organize your proof of work." : "You have no required learning tasks today."}</p>{message && <p role={message.kind}>{message.text}{completedUnitId && message.text === completedPracticingMessage && <> <Link href={proofHref(completedUnitId)}>Add proof</Link></>}</p>}<Link href="/path">{resolved.allComplete ? "Review your learning path" : "View learning path ↗"}</Link></section><SevenDayTimeline workspace={resolved.workspace} blueprint={blueprint} registry={registry} /></>;
  const requiredSteps = resolved.primary.steps;
  const checked = progress.unitId === resolved.primary.id ? progress.checked : new Set<string>();
  const canComplete = requiredSteps.every(({ id }) => checked.has(id));
  const hasCandidate = resolved.workspace.pendingPlanVersionId !== null;
  const send = async (kind: "completed" | "delayed" | "skipped" | "too_hard" | "already_known") => {
    if (pending || hasCandidate || (kind === "completed" && !canComplete)) return;
    setPending(true); setMessage(null);
    try {
      const saved = await record({ kind, unitId: resolved.primary!.id, planningDate: resolved.today, ...(kind === "completed" ? { actualMinutes: null } : {}) } as PlanningEventInput);
      if (!saved) setMessage({ kind: "alert", text: recovery === "conflict" ? "Your plan was updated on another device. Refresh to continue." : "Arc could not update your plan. Try again when your connection is restored." });
      else if (kind === "completed") { setCompletedUnitId(resolved.primary!.id); setMessage({ kind: "status", text: completedPracticingMessage }); }
      else setMessage({ kind: "status", text: candidateReadyMessage });
    } catch {
      setMessage({ kind: "alert", text: recovery === "conflict" ? "Your plan was updated on another device. Refresh to continue." : "Arc could not update your plan. Try again when your connection is restored." });
    } finally {
      setPending(false);
    }
  };
  return <>
    <article className="adaptive-today-session" aria-labelledby="adaptive-today-title">
      <header>
        <p className="eyebrow">Today · {resolved.today} · Main task</p>
        <p className="today-duration"><strong>{resolved.primary.estimatedMinutes}</strong><span>min</span></p>
        {resolved.primary.scheduledDate < resolved.today && <p className="today-overdue">Overdue task · Originally scheduled for {resolved.primary.scheduledDate}</p>}
        <h1 id="adaptive-today-title">{resolved.title}</h1>
        <p className="today-objective">{resolved.primary.objective}</p>
      </header>
      <section className="today-deliverable" aria-labelledby="today-deliverable-title"><h2 id="today-deliverable-title">Your deliverable</h2><p>{resolved.primary.buildTask}</p></section>
      <TodayResources><ResourceLinks primary={resolved.primaryResource} alternatives={resolved.alternativeResources} /></TodayResources>
      <Link className="today-skill-link" href={`/stack?skill=${encodeURIComponent(resolved.primary.skillId)}&returnTo=%2Ftoday`}>View this skill and its resources</Link>
      <section className="today-work" aria-labelledby="today-work-title"><h2 id="today-work-title">Learning steps</h2><ol>{requiredSteps.map((step) => <li key={step.id}><label><input checked={checked.has(step.id)} onChange={(event) => setProgress((current) => { const next = new Set(current.unitId === resolved.primary!.id ? current.checked : []); if (event.target.checked) next.add(step.id); else next.delete(step.id); return { unitId: resolved.primary!.id, checked: next }; })} type="checkbox" /><span>{step.label}</span><time>{step.minutes} min</time></label></li>)}</ol></section>
      <details className="today-criteria"><summary>Completion criteria and proof requirements</summary><section className="today-brief"><div><h2>Completion criteria</h2><ul>{resolved.primary.completionCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul></div><div><h2>Proof requirements</h2><p>{resolved.primary.proofRequirement}</p></div><div><h2>Assessment rubric</h2><ol>{resolved.primary.rubric.map((row) => <li key={row}>{row}</li>)}</ol></div><div><h2>Why learn this now</h2><p>{resolved.primary.whyNow}</p></div></section></details>
      {canComplete && resolved.stretch && <aside className="today-stretch"><p className="section-index">Optional stretch task · {resolved.stretch.estimatedMinutes} min</p><h2>{resolved.stretch.objective}</h2><p>{resolved.stretch.whyNow}</p></aside>}
      <div className="today-actions">
        <div className="today-completion"><p id="today-completion-help">Checked steps are kept on this page only. Select Complete task to save your progress.</p><button aria-describedby="today-completion-help" disabled={pending || hasCandidate || !canComplete} onClick={() => void send("completed")} type="button">Complete task</button></div>
        <details className="today-adjustments"><summary>Adjust this task</summary><p>Choose a reason to generate a proposal. Review and accept it to update your current plan.</p><div>{actionEvents.map(([label, kind]) => <button disabled={pending || hasCandidate} key={kind} onClick={() => void send(kind)} type="button">{label}</button>)}</div></details>
      </div>
      {hasCandidate ? <p role="status">{candidateReadyMessage}</p> : message && <p role={message.kind}>{message.kind === "alert" && recovery === "conflict" ? "Your plan was updated on another device. Refresh to continue." : message.text}{message.text === completedPracticingMessage && completedUnitId && <> <Link href={proofHref(completedUnitId)}>Add proof</Link></>}</p>}
    </article>
    {resolved.workspace.pendingPlanVersionId && <PlanDiffReview registry={registry} workspace={resolved.workspace} recovery={recovery} onAccept={accept} onDiscard={discard} onSuccess={(text) => setMessage({ kind: "status", text })} />}
    <details className="today-week-disclosure"><summary>View this week’s schedule</summary><SevenDayTimeline workspace={resolved.workspace} blueprint={blueprint} registry={registry} /></details>
  </>;
}

function proofHref(unitId: string) {
  return `/proof?${new URLSearchParams({ compose: "1", unit: unitId, returnTo: "/today" })}`;
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
    const nextRequired = getCurrentLearningUnit(workspace, today);
    const day = nextRequired
      ? plan.days.find(({ primaryUnitId }) => primaryUnitId === nextRequired.id)
      : plan.days.find(({ date }) => date === today);
    const resources = new Map(blueprint.resources.map((resource) => [resource.id, resource]));
    const primary = nextRequired;
    const title = registry.tracks.flatMap(({ templates }) => templates).find(({ id }) => id === primary?.templateId)?.title ?? "Today’s learning task";
    const stretch = day?.stretchUnitId ? units.get(day.stretchUnitId) ?? null : null;
    const progress = getPathProgress(workspace, path);
    return { workspace, plan, today, title, primary, stretch, allComplete: progress.completedUnits === progress.totalUnits, primaryResource: primary ? resources.get(primary.primaryResourceId) ?? null : null, alternativeResources: primary ? primary.alternativeResourceIds.map((id) => resources.get(id)).filter((resource): resource is LearningResource => Boolean(resource)) : [] } satisfies TodayResolution;
  } catch { return null; }
}

type TodayResolution = { workspace: PlanningWorkspace; plan: PlanningWorkspace["planVersions"][number]; today: string; title: string; primary: DailyUnit | null; stretch: DailyUnit | null; allComplete: boolean; primaryResource: LearningResource | null; alternativeResources: LearningResource[] };

function ResourceLinks({ primary, alternatives }: { primary: LearningResource | null; alternatives: LearningResource[] }) {
  return <section className="today-resources" aria-labelledby="today-resources-title">{primary ? <p><a href={primary.url} hrefLang={primary.language} lang={primary.language} rel="noreferrer" target="_blank">{primary.title}</a><span>{primary.provider} · Primary resource</span></p> : <p>The primary resource for this content version is temporarily unavailable.</p>}{alternatives.length > 0 && <ul>{alternatives.map((resource) => <li key={resource.id}><a href={resource.url} hrefLang={resource.language} lang={resource.language} rel="noreferrer" target="_blank">{resource.title}</a></li>)}</ul>}</section>;
}
