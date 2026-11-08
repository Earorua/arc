"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PlanningHistory } from "../../contracts/planning-history";
import type { PlanningWorkspaceResponse } from "../../contracts/planning-api";
import { planningHistoryClient, type PlanningHistoryClient } from "../../lib/planning-history-client";
import { getRoleDisplayName } from "../../lib/personalized-plan";
import { ArcApiError } from "../../lib/cloud-client";
import { AdaptivePath } from "./adaptive-path";
import { updatePageQuery, usePageQuery } from "../../lib/use-page-query";
import { signInHref } from "../../lib/navigation-context";

type Result = { kind: "list"; value: PlanningHistory } | { kind: "plan"; value: PlanningWorkspaceResponse };

export function PlanHistory({ ownerId, client = planningHistoryClient }: { ownerId: string; client?: PlanningHistoryClient }) {
  // Remount before rendering any response from a different account.
  return <OwnedPlanHistory key={ownerId} ownerId={ownerId} client={client} />;
}

function OwnedPlanHistory({ client, ownerId }: { client: PlanningHistoryClient; ownerId: string }) {
  const query = usePageQuery();
  const goal = query.get("goal") || null;
  const raw = query.get("offset") ?? "0";
  const offset = /^\d{1,6}$/.test(raw) ? Math.floor(Number(raw) / 20) * 20 : 0;
  return <HistoryView key={`${goal}:${offset}`} client={client} goal={goal} offset={offset} ownerId={ownerId} />;
}

function HistoryView({ client, goal, offset, ownerId }: { client: PlanningHistoryClient; goal: string | null; offset: number; ownerId: string }) {
  const positionKey = `arc-history-position:${JSON.stringify([ownerId, offset])}`;
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<"sign-in" | "retry" | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const next: Result = goal === null
          ? { kind: "list", value: await client.list(offset, controller.signal) }
          : { kind: "plan", value: await client.load(goal, controller.signal) };
        if (!controller.signal.aborted) setResult(next);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof ArcApiError && e.status === 401 ? "sign-in" : "retry");
      }
    };
    void load();
    return () => controller.abort();
  }, [client, goal, offset, revision]);
  useEffect(() => {
    if (result?.kind !== "list") return;
    let frame = 0;
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(positionKey) ?? "null");
      if (saved && typeof saved === "object" && "y" in saved && typeof saved.y === "number" && Number.isFinite(saved.y) && saved.y >= 0) {
        const y = saved.y;
        const item = "goal" in saved && typeof saved.goal === "string" ? saved.goal : "";
        frame = requestAnimationFrame(() => {
          document.querySelectorAll<HTMLButtonElement>(".history-goals button[data-goal]").forEach(button => { if (button.dataset.goal === item) button.focus({ preventScroll: true }); });
          window.scrollTo({ top: y, behavior: "instant" });
        });
      }
    } catch { /* Restoring position is optional when session storage is blocked. */ }
    return () => cancelAnimationFrame(frame);
  }, [positionKey, result]);
  function navigate(nextGoal: string | null, nextOffset = offset) {
    if (goal === null && nextGoal) {
      try { sessionStorage.setItem(positionKey, JSON.stringify({ y: window.scrollY, goal: nextGoal })); } catch { /* The URL still restores the list page. */ }
    }
    updatePageQuery({ goal: nextGoal, offset: nextOffset > 0 ? String(nextOffset) : null });
  }
  return <section className="plan-history">
    <div className="workspace-intro workspace-intro-with-return"><p className="eyebrow">Learning history</p><h1>Past learning plans</h1><p>Revisit saved goals, paths, and learning history. These records are read-only; your current plan is unchanged.</p>
      {goal !== null ? <button className="workspace-return" type="button" onClick={() => navigate(null)}><span aria-hidden="true">←</span> Back to plan history</button> : <Link className="workspace-return" href="/path"><span aria-hidden="true">←</span> Back to current path</Link>}
      {goal !== null && <p className="history-current-return"><Link href="/path">Back to current path</Link></p>}
    </div>
    {error === "sign-in" ? <p role="alert">Your session has expired. <Link href={signInHref(`/history?${new URLSearchParams({ ...(goal ? { goal } : {}), offset: String(offset) })}`, true)}>Sign in again</Link></p>
      : error ? <p role="alert">Plan history is temporarily unavailable. <button type="button" onClick={() => { setError(null); setResult(null); setRevision(value => value + 1); }}>Retry</button></p>
      : !result ? <p role="status">Loading plan history…</p>
      : result.kind === "list" ? <>
        {result.value.goals.length === 0 ? <p>No past learning plans yet.</p> : <ul className="history-goals">{result.value.goals.map(item => <li key={item.id}>
          <div><strong>{getRoleDisplayName(item.roleId)}</strong><p>{item.targetWeeks} weeks · {item.weeklyMinutes} min per week · {new Date(item.createdAt).toISOString().slice(0, 10)}</p>{item.progress ? <p className="history-progress">{item.progress.completedUnits} / {item.progress.totalUnits} learning units complete</p> : item.hasWorkspace && <p className="history-progress">Progress is temporarily unavailable</p>}</div>
          {item.hasWorkspace ? <button type="button" data-goal={item.id} onClick={() => navigate(item.id)} aria-label={`View ${getRoleDisplayName(item.roleId)}`}>View plan ↗</button> : <span>No learning plan generated</span>}
        </li>)}</ul>}
        <nav className="history-pagination" aria-label="Plan history pagination">
          {offset > 0 && <button type="button" onClick={() => navigate(null, Math.max(0, offset - 20))}>Previous page</button>}
          {result.value.nextOffset !== null && <button type="button" onClick={() => navigate(null, result.value.nextOffset!)}>Next page</button>}
        </nav>
      </> : <SavedPlan value={result.value} />}
  </section>;
}

export function SavedPlan({ value }: { value: PlanningWorkspaceResponse }) {
  const { workspace, sourceContext } = value;
  if (!workspace) return <p>This goal has no saved learning plan.</p>;
  if (!sourceContext) return <p role="alert">The saved content for this plan is temporarily unavailable.</p>;
  const { blueprint, registry } = sourceContext;
  const resources = new Map(blueprint.resources.map(resource => [resource.id, resource]));
  const templates = new Map(registry.tracks.flatMap(track => track.templates).map(template => [template.id, template]));
  const eventLabels = { completed: "Completed", delayed: "Delayed", skipped: "Skipped", too_hard: "Too difficult", already_known: "Self-assessed as known" };
  return <div className="history-saved-plan">
    <h2>{blueprint.name}</h2><p className="workspace-notice">Past version · Read-only</p>
    <AdaptivePath readOnly workspace={workspace} blueprint={blueprint} registry={registry} headingLevel={2} title="Saved learning path" />
    <section aria-labelledby="history-days-title"><h2 id="history-days-title">Saved daily schedules</h2><p>Resource links reflect the versions saved at the time.</p>
      {workspace.planVersions.map((plan, index) => <details className="history-plan-version" key={plan.id}>
        <summary>Schedule version {index + 1}{plan.id === workspace.activePlanVersionId ? " · Last used" : ""}</summary>
        <ol>{workspace.dailyUnits.filter(unit => unit.planVersionId === plan.id).map(unit => <li key={unit.id}>
          <p className="eyebrow">{unit.scheduledDate} · {unit.estimatedMinutes} min</p>
          <h3>{templates.get(unit.templateId)?.title ?? unit.objective}</h3><p>{unit.objective}</p><p>{unit.whyNow}</p>
          <ol>{unit.steps.map(step => <li key={step.id}>{step.label}</li>)}</ol>
          <p>{unit.buildTask}</p><ul>{unit.completionCriteria.map(item => <li key={item}>{item}</li>)}</ul><p>{unit.proofRequirement}</p>
          <ul className="history-sources">{[unit.primaryResourceId, ...unit.alternativeResourceIds].map(id => {
            const resource = resources.get(id);
            if (!resource || !/^https?:\/\//i.test(resource.url)) return null;
            return <li key={id}><a href={resource.url} target="_blank" rel="noreferrer">{resource.title}</a><span> · {resource.provider}</span></li>;
          })}</ul>
          {workspace.events.filter(event => "unitId" in event && event.unitId === unit.id && event.kind in eventLabels).map(event => <p className="workspace-notice" key={event.eventId}>{eventLabels[event.kind as keyof typeof eventLabels]}</p>)}
        </li>)}</ol>
      </details>)}
    </section>
  </div>;
}
