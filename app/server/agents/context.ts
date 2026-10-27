import type { PlanningWorkspaceResponse } from "../../contracts/planning-api";
import { flagshipBlueprint } from "../../data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../data/flagship-unit-registry";
import { applyPlanningEvent } from "../../lib/planning/event-reducer";
import { planningEventSchema } from "../../contracts/planning";
import type { AgentRequest, PlannerAdvice } from "../../contracts/agents";

export class AgentServiceError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export function learningContext(response: PlanningWorkspaceResponse) {
  const workspace = response.workspace;
  if (!workspace) throw new AgentServiceError(409, "请先完成学习设置，再开始规划或答疑。");
  const blueprint = response.sourceContext?.blueprint ?? flagshipBlueprint;
  const registry = response.sourceContext?.registry ?? flagshipUnitRegistry;
  const path = workspace.pathVersions.find(path => path.id === workspace.activePathVersionId)!;
  const plan = workspace.planVersions.find(plan => plan.id === workspace.activePlanVersionId)!;
  const templates = new Map(registry.tracks.flatMap(track => track.templates).map(unit => [unit.id, unit]));
  const completed = new Set(workspace.events.filter(event => event.kind === "completed").map(event => event.unitId));
  const currentId = plan.days.find(day => day.primaryUnitId)?.primaryUnitId ?? null;
  const currentUnit = workspace.dailyUnits.find(unit => unit.planVersionId === plan.id && unit.id === currentId) ?? null;
  const units = path.units.filter(unit => !completed.has(unit.id)).map(unit => ({
    id: unit.id, title: templates.get(unit.templateId)?.title, skillId: unit.skillId,
    prerequisites: unit.prerequisiteUnitIds.filter(id => !completed.has(id)),
    minutes: unit.estimatedMinutes, objective: templates.get(unit.templateId)?.objective,
    resourceId: templates.get(unit.templateId)?.primaryResourceId,
    completionCriteria: templates.get(unit.templateId)?.completionCriteria,
  }));
  const planningDate = new Intl.DateTimeFormat("en-CA", { timeZone: workspace.availability.timeZone,
    year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return { workspace, blueprint, registry, currentUnit, planningDate, units,
    roleName: blueprint.name, currentTask: currentUnit ? templates.get(currentUnit.templateId)?.title ?? currentUnit.objective : null };
}
export type LearningContext = ReturnType<typeof learningContext>;
export function assertCurrent(context: LearningContext, expected: Pick<AgentRequest, "goalId" | "baseVersionId" | "revision">) {
  if (context.workspace.goalId !== expected.goalId || context.workspace.activePlanVersionId !== expected.baseVersionId
    || context.workspace.revision !== expected.revision) throw new AgentServiceError(409, "学习计划已经变化，请刷新后重新规划。");
}
export function promptContext(context: LearningContext, request: AgentRequest, planner: boolean) {
  const body = {
    request: request.message, page: request.page, role: context.roleName,
    targetWeeks: context.workspace.target.targetWeeks, availability: {
      timeZone: context.workspace.availability.timeZone, weekdays: context.workspace.availability.weekdays,
      exceptions: context.workspace.availability.exceptions },
    assessment: context.workspace.audit.answers.map(({ skillId, level }) => ({ skillId, selfAssessment: level })),
    currentTask: context.currentUnit, unfinishedUnits: planner ? context.units : context.units.slice(0, 4),
    resources: context.blueprint.resources.filter(resource => planner || context.currentUnit?.primaryResourceId === resource.id)
      .map(({ id, title, url }) => ({ id, title, url })),
  };
  const serialized = JSON.stringify(body);
  if (new TextEncoder().encode(serialized).byteLength > (planner ? 85000 : 22000))
    throw new AgentServiceError(413, "学习资料过长，请缩小本次问题的范围。");
  return serialized;
}
export function proposalEvent(context: LearningContext, advice: PlannerAdvice, mutationId: string) {
  const ids = new Set(context.units.map(unit => unit.id));
  if (advice.milestones.some(m => m.unitIds.some(id => !ids.has(id))))
    throw new AgentServiceError(422, "规划结果引用了未知任务，请重新生成。");
  const event = planningEventSchema.parse({
    kind: "agent_replanned", baseRevision: context.workspace.revision, unitOrder: advice.unitOrder,
    planningDate: context.planningDate, eventId: mutationId, mutationId,
    sequence: context.workspace.lastSequence + 1, targetPlanVersionId: context.workspace.activePlanVersionId,
    occurredAt: new Date().toISOString(),
  });
  const transition = applyPlanningEvent({ workspace: context.workspace, blueprint: context.blueprint, registry: context.registry, event });
  return { event, transition };
}
