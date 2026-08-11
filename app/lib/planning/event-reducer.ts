import { roleBlueprintSchema, type RoleBlueprint } from "../../contracts/intelligence";
import {
  availabilityVersionSchema,
  learningPathVersionSchema,
  planningEventSchema,
  planningWorkspaceSchema,
  unitRegistrySchema,
  type AvailabilityVersion,
  type DailyUnit,
  type LearningPathVersion,
  type PathUnit,
  type PlanDiff,
  type PlanVersion,
  type PlanningEvent,
  type PlanningWorkspace,
  type UnitRegistry,
} from "../../contracts/planning";
import { minutesForDate } from "./calendar";
import { canonicalJson, deterministicId, fingerprint } from "./fingerprint";
import { buildLearningPaths } from "./path-builder";
import { PlanningEventError, diffPlans } from "./plan-diff";
import { buildPlanVersion, estimateCompletionDate } from "./scheduler";

export { PlanningEventError } from "./plan-diff";

export type PlanningTransition =
  | { kind: "automatic"; event: PlanningEvent; workspace: PlanningWorkspace }
  | { kind: "proposed"; event: PlanningEvent; workspace: PlanningWorkspace; diff: PlanDiff }
  | { kind: "accepted" | "discarded"; event: PlanningEvent; workspace: PlanningWorkspace };

export function applyPlanningEvent(input: {
  workspace: PlanningWorkspace;
  event: PlanningEvent;
  blueprint: RoleBlueprint;
  registry: UnitRegistry;
}): PlanningTransition {
  const parsed = parseApplyInput(input);
  assertEventOrder(parsed.workspace, parsed.event);
  if (parsed.event.kind === "replan_accepted" || parsed.event.kind === "replan_discarded") {
    return applyDecision(parsed.workspace, parsed.event);
  }
  if (parsed.workspace.pendingPlanVersionId !== null) {
    throw new PlanningEventError("PENDING_REPLAN_REQUIRED");
  }
  assertActiveTarget(parsed.workspace, parsed.event);
  if (parsed.event.kind === "completed") {
    return applyCompletion(parsed.workspace, parsed.event, parsed.registry);
  }
  return proposeReplan(parsed.workspace, parsed.event, parsed.blueprint, parsed.registry);
}

export function replayPlanningEvents(input: {
  initial: PlanningWorkspace;
  events: readonly PlanningEvent[];
  blueprint: RoleBlueprint;
  registry: UnitRegistry;
}): PlanningWorkspace {
  const fields = exactObject(input, ["initial", "events", "blueprint", "registry"]);
  let workspace = planningWorkspaceSchema.parse(cloneData(fields.initial));
  const blueprint = roleBlueprintSchema.parse(cloneData(fields.blueprint));
  const registry = unitRegistrySchema.parse(cloneData(fields.registry));
  if (!Array.isArray(fields.events)) throw new TypeError("Planning events must be an array.");
  const events = fields.events.map((event) => planningEventSchema.parse(cloneData(event)));
  for (const event of events) {
    workspace = applyPlanningEvent({ workspace, event, blueprint, registry }).workspace;
  }
  return workspace;
}

function parseApplyInput(input: unknown): {
  workspace: PlanningWorkspace;
  event: PlanningEvent;
  blueprint: RoleBlueprint;
  registry: UnitRegistry;
} {
  const fields = exactObject(input, ["workspace", "event", "blueprint", "registry"]);
  return {
    workspace: planningWorkspaceSchema.parse(cloneData(fields.workspace)),
    event: planningEventSchema.parse(cloneData(fields.event)),
    blueprint: roleBlueprintSchema.parse(cloneData(fields.blueprint)),
    registry: unitRegistrySchema.parse(cloneData(fields.registry)),
  };
}

function assertEventOrder(workspace: PlanningWorkspace, event: PlanningEvent): void {
  if (workspace.events.some(({ mutationId }) => mutationId === event.mutationId)) {
    throw new PlanningEventError("DUPLICATE_MUTATION");
  }
  if (event.sequence !== workspace.lastSequence + 1) throw new PlanningEventError("STALE_SEQUENCE");
}

function assertActiveTarget(
  workspace: PlanningWorkspace,
  event: Exclude<PlanningEvent, { kind: "replan_accepted" | "replan_discarded" }>,
): void {
  if (event.targetPlanVersionId !== workspace.activePlanVersionId) {
    throw new PlanningEventError("BASE_REVISION_MISMATCH");
  }
  if (!("unitId" in event)) return;
  const activePlan = getPlan(workspace, workspace.activePlanVersionId);
  if (!activePlan.dailyUnitIds.includes(event.unitId)
    || !workspace.dailyUnits.some((unit) => unit.planVersionId === activePlan.id && unit.id === event.unitId)) {
    throw new PlanningEventError("UNIT_NOT_ACTIVE");
  }
}

function applyCompletion(
  workspace: PlanningWorkspace,
  event: Extract<PlanningEvent, { kind: "completed" }>,
  registry: UnitRegistry,
): PlanningTransition {
  const activePath = getPath(workspace, workspace.activePathVersionId);
  const completed = completedIdsForPath(workspace, activePath);
  if (activePath.units.some(({ id }) => id === event.unitId)) completed.add(event.unitId);
  const { plan, dailyUnits } = buildPlanVersion({
    path: activePath,
    registry,
    availability: workspace.availability,
    planningDate: event.planningDate,
    generation: "automatic",
    baseVersionId: workspace.activePlanVersionId,
    replanReason: "completed",
    completedUnitIds: completed,
  });
  const next = finalizeWorkspace(workspace, event, {
    planVersions: appendUnique(workspace.planVersions, plan),
    dailyUnits: appendDailyUnits(workspace.dailyUnits, dailyUnits),
    activePlanVersionId: plan.id,
    pendingPlanVersionId: null,
  });
  return deepFreeze({ kind: "automatic", event, workspace: next });
}

function proposeReplan(
  workspace: PlanningWorkspace,
  event: Exclude<PlanningEvent, { kind: "completed" | "replan_accepted" | "replan_discarded" }>,
  blueprint: RoleBlueprint,
  registry: UnitRegistry,
): PlanningTransition {
  const completedHistory = completedIds(workspace);
  const activePlan = getPlan(workspace, workspace.activePlanVersionId);
  let availability = workspace.availability;
  let availabilityVersions = workspace.availabilityVersions;
  let path = getPath(workspace, workspace.activePathVersionId);
  let pathVersions = workspace.pathVersions;

  if (event.kind === "availability_changed") {
    availability = availabilityVersionSchema.parse(event.availability);
    availabilityVersions = appendAvailability(workspace.availabilityVersions, availability);
    path = derivedPath(
      path,
      [...path.units],
      path.phases.map((phase) => ({ ...phase, unitIds: [...phase.unitIds] })),
      availability,
      event.planningDate,
      "availability-changed",
    );
    pathVersions = appendUnique(pathVersions, path);
  } else if (event.kind === "already_known") {
    const target = activeDailyUnit(workspace, event.unitId);
    const updatedAudit = {
      ...workspace.audit,
      answers: workspace.audit.answers.map((answer) => answer.skillId === target.skillId
        ? { ...answer, level: "independent" as const }
        : answer),
    };
    const alternatives = buildLearningPaths({
      blueprint, registry, audit: updatedAudit, availability, target: workspace.target,
      planningDate: event.planningDate,
    });
    path = selectScope(alternatives.fullScope, alternatives.targetDate, getPath(workspace, workspace.activePathVersionId).scopeMode);
    pathVersions = appendUnique(pathVersions, path);
  } else if (event.kind === "too_hard") {
    path = reinforcePath(path, activeDailyUnit(workspace, event.unitId), registry, availability, event.planningDate);
    pathVersions = appendUnique(pathVersions, path);
  }

  const scheduleAvailability = event.kind === "delayed"
    ? availabilityWithDeferredDate(availability, activeDailyUnit(workspace, event.unitId).scheduledDate)
    : availability;
  const completed = completedIdsForPath(workspace, path);
  const built = buildPlanVersion({
    path,
    registry,
    availability: scheduleAvailability,
    planningDate: event.planningDate,
    generation: "proposed",
    baseVersionId: activePlan.id,
    replanReason: event.kind,
    completedUnitIds: completed,
  });
  const candidate = event.kind === "delayed"
    ? restoreDisplayedBudget(built.plan, built.dailyUnits, availability, activeDailyUnit(workspace, event.unitId).scheduledDate)
    : built;
  const diff = diffPlans({ active: activePlan, candidate: candidate.plan, completedUnitIds: completedHistory });
  const next = finalizeWorkspace(workspace, event, {
    availability,
    availabilityVersions,
    pathVersions,
    planVersions: appendUnique(workspace.planVersions, candidate.plan),
    dailyUnits: appendDailyUnits(workspace.dailyUnits, candidate.dailyUnits),
    pendingPlanVersionId: candidate.plan.id,
  });
  return deepFreeze({ kind: "proposed", event, workspace: next, diff });
}

function applyDecision(
  workspace: PlanningWorkspace,
  event: Extract<PlanningEvent, { kind: "replan_accepted" | "replan_discarded" }>,
): PlanningTransition {
  if (workspace.pendingPlanVersionId === null
    || workspace.pendingPlanVersionId !== event.candidatePlanVersionId) {
    throw new PlanningEventError("PENDING_REPLAN_REQUIRED");
  }
  const candidate = getPlan(workspace, event.candidatePlanVersionId);
  if (candidate.baseVersionId !== workspace.activePlanVersionId
    || event.targetPlanVersionId !== workspace.activePlanVersionId) {
    throw new PlanningEventError("BASE_REVISION_MISMATCH");
  }
  const accepted = event.kind === "replan_accepted";
  const next = finalizeWorkspace(workspace, event, {
    activePlanVersionId: accepted ? candidate.id : workspace.activePlanVersionId,
    activePathVersionId: accepted ? candidate.pathVersionId : workspace.activePathVersionId,
    pendingPlanVersionId: null,
  });
  return deepFreeze({ kind: accepted ? "accepted" : "discarded", event, workspace: next });
}

function reinforcePath(
  source: LearningPathVersion,
  target: DailyUnit,
  registry: UnitRegistry,
  availability: AvailabilityVersion,
  planningDate: string,
): LearningPathVersion {
  const template = registry.tracks.find(({ skillId }) => skillId === target.skillId)?.templates
    .find(({ kind }) => kind === "reinforce");
  if (!template) throw new PlanningEventError("REINFORCEMENT_UNAVAILABLE");
  const targetIndex = source.units.findIndex(({ id }) => id === target.id);
  if (targetIndex < 0) throw new PlanningEventError("UNIT_NOT_ACTIVE");
  const sourceTarget = source.units[targetIndex]!;
  const reinforcement: PathUnit = {
    id: deterministicId("path-unit", {
      pathVersionId: source.id, targetUnitId: sourceTarget.id,
      templateId: template.id, templateVersion: template.version,
    }),
    templateId: template.id,
    templateVersion: template.version,
    checkpointId: null,
    skillId: template.skillId,
    kind: "reinforce",
    estimatedMinutes: template.estimatedMinutes,
    prerequisiteUnitIds: [...sourceTarget.prerequisiteUnitIds],
  };
  const units = source.units.map((unit) => unit.id === sourceTarget.id
    ? { ...unit, prerequisiteUnitIds: [reinforcement.id] }
    : unit);
  units.splice(targetIndex, 0, reinforcement);
  const phases = source.phases.map((phase) => ({
    ...phase,
    unitIds: phase.unitIds.flatMap((unitId) => unitId === sourceTarget.id ? [reinforcement.id, unitId] : [unitId]),
  }));
  return derivedPath(source, units, phases, availability, planningDate, "too-hard-reinforcement");
}

function derivedPath(
  source: LearningPathVersion,
  units: PathUnit[],
  phases: LearningPathVersion["phases"],
  availability: AvailabilityVersion,
  planningDate: string,
  reason: string,
): LearningPathVersion {
  const estimatedCompletionDate = estimateCompletionDate({ units, availability, planningDate });
  const sourceFields = {
    schemaVersion: source.schemaVersion,
    blueprintId: source.blueprintId,
    blueprintVersion: source.blueprintVersion,
    registryId: source.registryId,
    registryVersion: source.registryVersion,
    auditVersionId: source.auditVersionId,
    availabilityVersionId: source.availabilityVersionId,
    targetId: source.targetId,
    scopeMode: source.scopeMode,
    deferredSkills: source.deferredSkills,
  };
  const core = {
    ...sourceFields,
    units,
    phases,
    estimatedStartDate: planningDate,
    estimatedCompletionDate,
    availabilityVersionId: availability.id,
  };
  const inputFingerprint = fingerprint({ sourcePathVersionId: source.id, reason, ...core });
  return learningPathVersionSchema.parse({
    ...core,
    id: deterministicId("learning-path", { inputFingerprint }),
    inputFingerprint,
  });
}

function availabilityWithDeferredDate(availability: AvailabilityVersion, date: string): AvailabilityVersion {
  const exceptions = availability.exceptions.filter((exception) => exception.date !== date);
  exceptions.push({ date, minutes: 0, reason: "Deferred learning unit" });
  exceptions.sort((left, right) => compareOrdinal(left.date, right.date));
  const availabilityFields = {
    id: availability.id,
    schemaVersion: availability.schemaVersion,
    timeZone: availability.timeZone,
    weekdays: availability.weekdays,
    weeklyMinutes: availability.weeklyMinutes,
  };
  const inputFingerprint = fingerprint({ ...availabilityFields, exceptions });
  return availabilityVersionSchema.parse({ ...availability, exceptions, inputFingerprint });
}

function restoreDisplayedBudget(
  plan: PlanVersion,
  dailyUnits: DailyUnit[],
  availability: AvailabilityVersion,
  date: string,
): { plan: PlanVersion; dailyUnits: DailyUnit[] } {
  const budgetMinutes = minutesForDate(availability, date);
  return {
    plan: {
      ...plan,
      days: plan.days.map((day) => day.date === date
        ? { ...day, budgetMinutes, status: day.primaryUnitId === null ? "open" as const : day.status }
        : day),
    },
    dailyUnits,
  };
}

function selectScope(
  fullScope: LearningPathVersion,
  targetDate: LearningPathVersion | null,
  scope: LearningPathVersion["scopeMode"],
): LearningPathVersion {
  return scope === "target-date" && targetDate ? targetDate : fullScope;
}

function completedIds(workspace: PlanningWorkspace): Set<string> {
  return new Set(workspace.events.filter((event): event is Extract<PlanningEvent, { kind: "completed" }> => event.kind === "completed")
    .map(({ unitId }) => unitId));
}

function completedIdsForPath(workspace: PlanningWorkspace, path: LearningPathVersion): Set<string> {
  const pathUnitIds = new Set(path.units.map(({ id }) => id));
  return new Set([...completedIds(workspace)].filter((id) => pathUnitIds.has(id)));
}

function activeDailyUnit(workspace: PlanningWorkspace, unitId: string): DailyUnit {
  const unit = workspace.dailyUnits.find((item) => item.planVersionId === workspace.activePlanVersionId && item.id === unitId);
  if (!unit) throw new PlanningEventError("UNIT_NOT_ACTIVE");
  return unit;
}

function getPlan(workspace: PlanningWorkspace, id: string): PlanVersion {
  const plan = workspace.planVersions.find((item) => item.id === id);
  if (!plan) throw new PlanningEventError("BASE_REVISION_MISMATCH");
  return plan;
}

function getPath(workspace: PlanningWorkspace, id: string): LearningPathVersion {
  const path = workspace.pathVersions.find((item) => item.id === id);
  if (!path) throw new PlanningEventError("BASE_REVISION_MISMATCH");
  return path;
}

function finalizeWorkspace(
  workspace: PlanningWorkspace,
  event: PlanningEvent,
  changes: Partial<PlanningWorkspace>,
): PlanningWorkspace {
  return deepFreeze(planningWorkspaceSchema.parse({
    ...workspace,
    ...changes,
    revision: workspace.revision + 1,
    lastSequence: event.sequence,
    events: [...workspace.events, event],
  }));
}

function appendUnique<T extends { id: string }>(items: readonly T[], item: T): T[] {
  const existing = items.find(({ id }) => id === item.id);
  if (existing) {
    if (canonicalJson(existing) !== canonicalJson(item)) throw new PlanningEventError("BASE_REVISION_MISMATCH");
    return [...items];
  }
  return [...items, item];
}

function appendAvailability(items: readonly AvailabilityVersion[], item: AvailabilityVersion): AvailabilityVersion[] {
  return appendUnique(items, item);
}

function appendDailyUnits(items: readonly DailyUnit[], additions: readonly DailyUnit[]): DailyUnit[] {
  const keys = new Map(items.map((unit) => [`${unit.planVersionId}:${unit.id}`, unit]));
  const result = [...items];
  for (const unit of additions) {
    const key = `${unit.planVersionId}:${unit.id}`;
    const existing = keys.get(key);
    if (existing) {
      if (canonicalJson(existing) !== canonicalJson(unit)) throw new PlanningEventError("BASE_REVISION_MISMATCH");
      continue;
    }
    keys.set(key, unit);
    result.push(unit);
  }
  return result;
}

function exactObject(value: unknown, required: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError("Planning event input is invalid.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(descriptors).length > 0
    || Object.keys(descriptors).some((key) => !required.includes(key))
    || required.some((key) => !Object.hasOwn(descriptors, key))) {
    throw new TypeError("Planning event input is invalid.");
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of required) {
    const descriptor = descriptors[key]!;
    if (!descriptor.enumerable || !("value" in descriptor)) throw new TypeError("Planning event input is invalid.");
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function cloneData(value: unknown): unknown {
  return JSON.parse(canonicalJson(value)) as unknown;
}

function compareOrdinal(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
