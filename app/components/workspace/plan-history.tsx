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
    <div className="workspace-intro workspace-intro-with-return"><p className="eyebrow">学习记录</p><h1>历史学习计划</h1><p>回看之前保存的目标、路线和学习记录。这里的内容只供查阅，当前学习计划保持不变。</p>
      {goal !== null ? <button className="workspace-return" type="button" onClick={() => navigate(null)}><span aria-hidden="true">←</span> 返回历史列表</button> : <Link className="workspace-return" href="/path"><span aria-hidden="true">←</span> 返回当前学习路线</Link>}
      {goal !== null && <p className="history-current-return"><Link href="/path">返回当前学习路线</Link></p>}
    </div>
    {error === "sign-in" ? <p role="alert">登录已过期。<Link href={signInHref(`/history?${new URLSearchParams({ ...(goal ? { goal } : {}), offset: String(offset) })}`, true)}>重新登录</Link></p>
      : error ? <p role="alert">暂时无法读取历史计划。 <button type="button" onClick={() => { setError(null); setResult(null); setRevision(value => value + 1); }}>重试</button></p>
      : !result ? <p role="status">正在读取历史计划…</p>
      : result.kind === "list" ? <>
        {result.value.goals.length === 0 ? <p>还没有历史学习计划。</p> : <ul className="history-goals">{result.value.goals.map(item => <li key={item.id}>
          <div><strong>{getRoleDisplayName(item.roleId)}</strong><p>{item.targetWeeks} 周 · 每周 {item.weeklyMinutes} 分钟 · {new Date(item.createdAt).toISOString().slice(0, 10)}</p>{item.progress ? <p className="history-progress">已完成 {item.progress.completedUnits} / {item.progress.totalUnits} 个学习单元</p> : item.hasWorkspace && <p className="history-progress">进度记录暂不可用</p>}</div>
          {item.hasWorkspace ? <button type="button" data-goal={item.id} onClick={() => navigate(item.id)} aria-label={`查看 ${getRoleDisplayName(item.roleId)}`}>查看计划 ↗</button> : <span>未生成学习计划</span>}
        </li>)}</ul>}
        <nav className="history-pagination" aria-label="历史计划分页">
          {offset > 0 && <button type="button" onClick={() => navigate(null, Math.max(0, offset - 20))}>上一页</button>}
          {result.value.nextOffset !== null && <button type="button" onClick={() => navigate(null, result.value.nextOffset!)}>下一页</button>}
        </nav>
      </> : <SavedPlan value={result.value} />}
  </section>;
}

export function SavedPlan({ value }: { value: PlanningWorkspaceResponse }) {
  const { workspace, sourceContext } = value;
  if (!workspace) return <p>这个目标没有已保存的学习计划。</p>;
  if (!sourceContext) return <p role="alert">这个计划的已保存内容暂时无法读取。</p>;
  const { blueprint, registry } = sourceContext;
  const resources = new Map(blueprint.resources.map(resource => [resource.id, resource]));
  const templates = new Map(registry.tracks.flatMap(track => track.templates).map(template => [template.id, template]));
  const eventLabels = { completed: "已完成", delayed: "已延后", skipped: "已跳过", too_hard: "难度较高", already_known: "自评已会" };
  return <div className="history-saved-plan">
    <h2>{blueprint.name}</h2><p className="workspace-notice">历史版本 · 只读</p>
    <AdaptivePath readOnly workspace={workspace} blueprint={blueprint} registry={registry} headingLevel={2} title="已保存的学习路线" />
    <section aria-labelledby="history-days-title"><h2 id="history-days-title">保存的每日安排</h2><p>资料链接保留当时的版本。</p>
      {workspace.planVersions.map((plan, index) => <details className="history-plan-version" key={plan.id}>
        <summary>安排版本 {index + 1}{plan.id === workspace.activePlanVersionId ? " · 最后使用" : ""}</summary>
        <ol>{workspace.dailyUnits.filter(unit => unit.planVersionId === plan.id).map(unit => <li key={unit.id}>
          <p className="eyebrow">{unit.scheduledDate} · {unit.estimatedMinutes} 分钟</p>
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
