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
  ["延后", "delayed"], ["跳过", "skipped"], ["难度太高", "too_hard"], ["已经掌握", "already_known"],
] as const;

const systemNow = () => new Date();
const candidateReadyMessage = "调整方案已生成，请先审阅。当前计划尚未改变。";
const completedPracticingMessage = "任务已完成，技能已进入练习状态。添加作品证据，展示你的能力。";

export function AdaptiveTodaySession({ workspace: value, recovery = "none", record, accept, discard, blueprint = flagshipBlueprint, registry = flagshipUnitRegistry, now = systemNow }: AdaptiveTodaySessionProps) {
  const resolved = useMemo(() => resolveToday(value, blueprint, registry, now), [blueprint, now, registry, value]);
  const [progress, setProgress] = useState<{ unitId: string; checked: Set<string> }>(() => ({ unitId: "", checked: new Set() }));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "status" | "alert"; text: string } | null>(null);
  if (!resolved) return <PlanningVersionBoundary />;
  if (!resolved.primary) return <><section className="adaptive-today-session"><p className="eyebrow">今日 · {resolved.today}</p><h1>今天留给休息。</h1><p>今天没有必须完成的学习任务。</p>{message && <p role={message.kind}>{message.text}</p>}</section><SevenDayTimeline workspace={resolved.workspace} blueprint={blueprint} registry={registry} /></>;
  const requiredSteps = resolved.primary.steps;
  const checked = progress.unitId === resolved.primary.id ? progress.checked : new Set<string>();
  const canComplete = requiredSteps.every(({ id }) => checked.has(id));
  const hasCandidate = resolved.workspace.pendingPlanVersionId !== null;
  const send = async (kind: "completed" | "delayed" | "skipped" | "too_hard" | "already_known") => {
    if (pending || hasCandidate || (kind === "completed" && !canComplete)) return;
    setPending(true); setMessage(null);
    try {
      const saved = await record({ kind, unitId: resolved.primary!.id, planningDate: resolved.today, ...(kind === "completed" ? { actualMinutes: null } : {}) } as PlanningEventInput);
      if (!saved) setMessage({ kind: "alert", text: recovery === "conflict" ? "计划已在其他设备上更新，请刷新后继续。" : "Arc 未能更新计划，请在连接恢复后重试。" });
      else if (kind === "completed") setMessage({ kind: "status", text: completedPracticingMessage });
      else setMessage({ kind: "status", text: candidateReadyMessage });
    } catch {
      setMessage({ kind: "alert", text: recovery === "conflict" ? "计划已在其他设备上更新，请刷新后继续。" : "Arc 未能更新计划，请在连接恢复后重试。" });
    } finally {
      setPending(false);
    }
  };
  return <>
    <article className="adaptive-today-session" aria-labelledby="adaptive-today-title">
      <header>
        <p className="eyebrow">今日 · {resolved.today} · 主要任务</p>
        <p className="today-duration"><strong>{resolved.primary.estimatedMinutes}</strong><span>分钟</span></p>
        {resolved.primary.scheduledDate < resolved.today && <p className="today-overdue">待补任务 · 原定 {resolved.primary.scheduledDate}</p>}
        <h1 id="adaptive-today-title">{resolved.title}</h1>
        <p className="today-objective">{resolved.primary.objective}</p>
      </header>
      <section className="today-deliverable" aria-labelledby="today-deliverable-title"><h2 id="today-deliverable-title">本次交付</h2><p>{resolved.primary.buildTask}</p></section>
      <section className="today-work" aria-labelledby="today-work-title"><h2 id="today-work-title">学习步骤</h2><ol>{requiredSteps.map((step) => <li key={step.id}><label><input checked={checked.has(step.id)} onChange={(event) => setProgress((current) => { const next = new Set(current.unitId === resolved.primary!.id ? current.checked : []); if (event.target.checked) next.add(step.id); else next.delete(step.id); return { unitId: resolved.primary!.id, checked: next }; })} type="checkbox" /><span>{step.label}</span><time>{step.minutes} 分钟</time></label></li>)}</ol></section>
      <ResourceLinks primary={resolved.primaryResource} alternatives={resolved.alternativeResources} />
      <details className="today-criteria"><summary>完成标准与证据要求</summary><section className="today-brief"><div><h2>完成标准</h2><ul>{resolved.primary.completionCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul></div><div><h2>证据要求</h2><p>{resolved.primary.proofRequirement}</p></div><div><h2>评价细则</h2><ol>{resolved.primary.rubric.map((row) => <li key={row}>{row}</li>)}</ol></div><div><h2>为什么现在学习</h2><p>{resolved.primary.whyNow}</p></div></section></details>
      {canComplete && resolved.stretch && <aside className="today-stretch"><p className="section-index">可选拓展 · {resolved.stretch.estimatedMinutes} 分钟</p><h2>{resolved.stretch.objective}</h2><p>{resolved.stretch.whyNow}</p></aside>}
      <div className="today-actions">
        <div className="today-completion"><p id="today-completion-help">勾选仅保留在本次页面中；点击「完成任务」才会记录进度。</p><button aria-describedby="today-completion-help" disabled={pending || hasCandidate || !canComplete} onClick={() => void send("completed")} type="button">完成任务</button></div>
        <details className="today-adjustments"><summary>调整这项任务</summary><p>选择原因后会生成调整方案，审阅并接受后才会替换当前计划。</p><div>{actionEvents.map(([label, kind]) => <button disabled={pending || hasCandidate} key={kind} onClick={() => void send(kind)} type="button">{label}</button>)}</div></details>
      </div>
      {hasCandidate ? <p role="status">{candidateReadyMessage}</p> : message && <p role={message.kind}>{message.kind === "alert" && recovery === "conflict" ? "计划已在其他设备上更新，请刷新后继续。" : message.text}{message.text === completedPracticingMessage && <> <Link href="/proof">添加作品证据</Link></>}</p>}
    </article>
    {resolved.workspace.pendingPlanVersionId && <PlanDiffReview registry={registry} workspace={resolved.workspace} recovery={recovery} onAccept={accept} onDiscard={discard} onSuccess={(text) => setMessage({ kind: "status", text })} />}
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
    const title = registry.tracks.flatMap(({ templates }) => templates).find(({ id }) => id === primary?.templateId)?.title ?? "今日学习任务";
    const stretch = day.stretchUnitId ? units.get(day.stretchUnitId) ?? null : null;
    return { workspace, plan, today, title, primary, stretch, primaryResource: primary ? resources.get(primary.primaryResourceId) ?? null : null, alternativeResources: primary ? primary.alternativeResourceIds.map((id) => resources.get(id)).filter((resource): resource is LearningResource => Boolean(resource)) : [] } satisfies TodayResolution;
  } catch { return null; }
}

type TodayResolution = { workspace: PlanningWorkspace; plan: PlanningWorkspace["planVersions"][number]; today: string; title: string; primary: DailyUnit | null; stretch: DailyUnit | null; primaryResource: LearningResource | null; alternativeResources: LearningResource[] };

function ResourceLinks({ primary, alternatives }: { primary: LearningResource | null; alternatives: LearningResource[] }) {
  return <section className="today-resources" aria-labelledby="today-resources-title"><p className="section-index" id="today-resources-title">学习资源</p>{primary ? <p><a href={primary.url} hrefLang={primary.language} lang={primary.language} rel="noreferrer" target="_blank">{primary.title}</a><span>{primary.provider} · 主要资源</span></p> : <p>此内容版本的主要资源暂不可用。</p>}{alternatives.length > 0 && <ul>{alternatives.map((resource) => <li key={resource.id}><a href={resource.url} hrefLang={resource.language} lang={resource.language} rel="noreferrer" target="_blank">{resource.title}</a></li>)}</ul>}</section>;
}
