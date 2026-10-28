import { planningWorkspaceResponseSchema, type PlanningWorkspaceResponse } from "../../contracts/planning-api";
import { flagshipBlueprint } from "../../data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../data/flagship-unit-registry";
import { applyPlanningEvent } from "../../lib/planning/event-reducer";
import { planningEventSchema } from "../../contracts/planning";
import type { AgentLearningContext, AgentRequest, PlannerAdvice } from "../../contracts/agents";
import { planningDateForInstant } from "../../lib/planning/calendar";

export class AgentServiceError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export class AgentSetupRequiredError extends AgentServiceError {
  constructor() { super(409, "请先完成学习设置，再开始规划或答疑。"); }
}
export function learningContext(response: PlanningWorkspaceResponse, now = new Date()) {
  const parsed = planningWorkspaceResponseSchema.safeParse(response);
  if (!parsed.success) throw new AgentServiceError(503, "学习路线资料暂时无法读取，请刷新后重试。");
  const { workspace, sourceContext } = parsed.data;
  if (!workspace) throw new AgentSetupRequiredError();
  // The response schema permits a missing source only for the exact legacy Flagship identity.
  const blueprint = sourceContext?.blueprint ?? flagshipBlueprint;
  const registry = sourceContext?.registry ?? flagshipUnitRegistry;
  const path = workspace.pathVersions.find(path => path.id === workspace.activePathVersionId)!;
  const plan = workspace.planVersions.find(plan => plan.id === workspace.activePlanVersionId)!;
  if (plan.pathVersionId !== path.id) throw new AgentServiceError(503, "学习路线资料暂时无法读取，请刷新后重试。");
  const templates = new Map(registry.tracks.flatMap(track => track.templates).map(unit => [unit.id, unit]));
  const completed = new Set(workspace.events.filter(event => event.kind === "completed").map(event => event.unitId));
  const planningDate = planningDateForInstant(now.toISOString(), workspace.availability.timeZone);
  const scheduledIds = new Set(plan.dailyUnitIds);
  const currentUnit = workspace.dailyUnits.filter(unit => unit.planVersionId === plan.id && scheduledIds.has(unit.id)
    && unit.required && !completed.has(unit.id) && unit.scheduledDate <= planningDate)
    .sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate))[0] ?? null;
  const units = path.units.filter(unit => !completed.has(unit.id)).map(unit => ({
    id: unit.id, title: templates.get(unit.templateId)?.title, skillId: unit.skillId,
    prerequisites: unit.prerequisiteUnitIds.filter(id => !completed.has(id)),
    minutes: unit.estimatedMinutes, objective: templates.get(unit.templateId)?.objective,
    resourceId: templates.get(unit.templateId)?.primaryResourceId,
    alternativeResourceIds: templates.get(unit.templateId)?.alternativeResourceIds ?? [],
    completionCriteria: templates.get(unit.templateId)?.completionCriteria,
  }));
  const currentTask = currentUnit ? templates.get(currentUnit.templateId)?.title ?? currentUnit.objective : null;
  const catalog = new Map(blueprint.resources.map(({ id, title, url, provider }) => [id, { id, title, url, provider }]));
  const resources = currentUnit ? [currentUnit.primaryResourceId, ...currentUnit.alternativeResourceIds]
    .flatMap(id => catalog.has(id) ? [catalog.get(id)!] : []) : [];
  const publicContext: AgentLearningContext = {
    source: sourceContext?.reference.source ?? "flagship", date: planningDate, timeZone: workspace.availability.timeZone,
    completedUnits: path.units.filter(unit => completed.has(unit.id)).length, totalUnits: path.units.length,
    task: currentUnit ? { id: currentUnit.id, title: currentTask!, scheduledDate: currentUnit.scheduledDate } : null,
    resources,
  };
  return { workspace, blueprint, registry, currentUnit, planningDate, units,
    roleName: blueprint.name, currentTask, learningContext: publicContext };
}
export type LearningContext = ReturnType<typeof learningContext>;
export function assertCurrent(context: LearningContext, expected: Pick<AgentRequest, "goalId" | "baseVersionId" | "revision">) {
  if (context.workspace.goalId !== expected.goalId || context.workspace.activePlanVersionId !== expected.baseVersionId
    || context.workspace.revision !== expected.revision) throw new AgentServiceError(409, "学习计划已经变化，请刷新后重新规划。");
}
export function promptContext(context: LearningContext, request: AgentRequest, planner: boolean) {
  const relevantIds = new Set(context.units.slice(0, 4).flatMap(unit => [unit.resourceId, ...unit.alternativeResourceIds]));
  const resources = !planner && context.currentUnit ? context.learningContext.resources
    : context.blueprint.resources.filter(resource => planner || relevantIds.has(resource.id))
      .map(({ id, title, url, provider }) => ({ id, title, url, provider }));
  const body = {
    request: request.message, page: request.page, role: context.roleName,
    targetWeeks: context.workspace.target.targetWeeks, availability: {
      timeZone: context.workspace.availability.timeZone, weekdays: context.workspace.availability.weekdays,
      exceptions: context.workspace.availability.exceptions },
    assessment: context.workspace.audit.answers.map(({ skillId, level }) => ({ skillId, selfAssessment: level })),
    currentTask: context.currentUnit, learningContext: context.learningContext,
    unfinishedUnits: planner ? context.units : context.units.slice(0, 4),
    resources, resourceContent: "catalog_metadata_only",
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
