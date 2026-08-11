import { z } from "zod";
import { calendarDateSchema } from "../../contracts/intelligence";
import {
  availabilityVersionSchema,
  dailyUnitSchema,
  learningEventKindSchema,
  learningPathVersionSchema,
  pathUnitSchema,
  planGenerationSchema,
  planVersionSchema,
  unitRegistrySchema,
  type AvailabilityVersion,
  type DailyUnit,
  type LearningEventKind,
  type LearningPathVersion,
  type PathUnit,
  type PlanGeneration,
  type PlanVersion,
  type UnitRegistry,
  type UnitTemplate,
} from "../../contracts/planning";
import { calendarDates, minutesForDate } from "./calendar";
import { deterministicId, fingerprint } from "./fingerprint";

const SCHEDULE_HORIZON_DAYS = 3_660;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export type PlanningScheduleErrorCode =
  | "INVALID_SCHEDULE_INPUT"
  | "UNIT_NEVER_FITS"
  | "SCHEDULE_HORIZON_EXCEEDED";

export class PlanningScheduleError extends Error {
  readonly code: PlanningScheduleErrorCode;

  constructor(code: PlanningScheduleErrorCode) {
    super(scheduleErrorMessage(code));
    this.name = "PlanningScheduleError";
    this.code = code;
  }
}

export type CompletionEstimateInput = {
  units: readonly PathUnit[];
  availability: AvailabilityVersion;
  planningDate: string;
  completedUnitIds?: ReadonlySet<string>;
};

export type PlanBuildInput = {
  path: LearningPathVersion;
  registry: UnitRegistry;
  availability: AvailabilityVersion;
  planningDate: string;
  generation: PlanGeneration;
  baseVersionId: string | null;
  replanReason: LearningEventKind | null;
  completedUnitIds: ReadonlySet<string>;
};

export function estimateCompletionDate(input: CompletionEstimateInput): string {
  const parsed = parseEstimateInput(input);
  const pending = new Set(parsed.units
    .filter((unit) => !parsed.completedUnitIds.has(unit.id))
    .map((unit) => unit.id));
  if (pending.size === 0) return parsed.planningDate;

  const dates = horizonDates(parsed.planningDate);
  const maximumBudget = dates.reduce(
    (maximum, date) => Math.max(maximum, minutesForDate(parsed.availability, date)),
    0,
  );
  if (parsed.units.some((unit) => pending.has(unit.id) && unit.estimatedMinutes > maximumBudget)) {
    throw new PlanningScheduleError("UNIT_NEVER_FITS");
  }

  const completed = new Set(parsed.completedUnitIds);
  for (const date of dates) {
    const unit = nextEligibleUnit(parsed.units, pending, completed);
    if (unit && unit.estimatedMinutes <= minutesForDate(parsed.availability, date)) {
      pending.delete(unit.id);
      completed.add(unit.id);
      if (pending.size === 0) return date;
    }
  }
  throw new PlanningScheduleError("SCHEDULE_HORIZON_EXCEEDED");
}

export function buildPlanVersion(input: PlanBuildInput): {
  plan: PlanVersion;
  dailyUnits: DailyUnit[];
} {
  const parsed = parseBuildInput(input);
  const templates = resolvePathTemplates(parsed.path, parsed.registry);
  const estimatedCompletionDate = estimateCompletionDate({
    units: parsed.path.units,
    availability: parsed.availability,
    planningDate: parsed.planningDate,
    completedUnitIds: parsed.completedUnitIds,
  });
  const completedUnitIds = [...parsed.completedUnitIds].sort(compareOrdinal);
  const inputFingerprint = fingerprint({
    path: parsed.path,
    registry: parsed.registry,
    availability: parsed.availability,
    planningDate: parsed.planningDate,
    generation: parsed.generation,
    baseVersionId: parsed.baseVersionId,
    replanReason: parsed.replanReason,
    completedUnitIds,
  });
  const planId = deterministicId("plan-version", { inputFingerprint });
  const completed = new Set(parsed.completedUnitIds);
  const pending = new Set(parsed.path.units
    .filter((unit) => !completed.has(unit.id))
    .map((unit) => unit.id));
  const placements: Placement[] = [];
  const days = sevenDates(parsed.planningDate).map((date) => {
    const budgetMinutes = minutesForDate(parsed.availability, date);
    if (budgetMinutes === 0) {
      return {
        date,
        budgetMinutes,
        status: "rest" as const,
        primaryUnitId: null,
        stretchUnitId: null,
      };
    }

    const primary = nextEligibleUnit(parsed.path.units, pending, completed);
    if (!primary || primary.estimatedMinutes > budgetMinutes) {
      return {
        date,
        budgetMinutes,
        status: "open" as const,
        primaryUnitId: null,
        stretchUnitId: null,
      };
    }

    pending.delete(primary.id);
    completed.add(primary.id);
    placements.push({ date, slot: "primary", pathUnit: primary, template: templates.get(primary.id)! });

    const remainingMinutes = budgetMinutes - primary.estimatedMinutes;
    const reinforce = reinforceTemplate(parsed.registry, primary.skillId);
    const stretchKey = reinforce && reinforce.estimatedMinutes <= remainingMinutes
      ? { date, slot: "stretch" as const, primary, template: reinforce }
      : null;
    const stretchUnitId = stretchKey ? stretchId(planId, stretchKey) : null;
    if (stretchKey && stretchUnitId) {
      placements.push({
        date,
        slot: "stretch",
        pathUnit: null,
        template: stretchKey.template,
        id: stretchUnitId,
      });
    }

    return {
      date,
      budgetMinutes,
      status: "scheduled" as const,
      primaryUnitId: primary.id,
      stretchUnitId,
    };
  });

  const dailyUnits = placements.map((placement) => dailyUnitFromPlacement(planId, placement));
  const plan = planVersionSchema.parse({
    id: planId,
    schemaVersion: parsed.path.schemaVersion,
    generation: parsed.generation,
    baseVersionId: parsed.baseVersionId,
    replanReason: parsed.replanReason,
    planningDate: parsed.planningDate,
    pathVersionId: parsed.path.id,
    days,
    dailyUnitIds: dailyUnits.map((unit) => unit.id),
    estimatedCompletionDate,
    inputFingerprint,
    summary: summaryFor(dailyUnits, estimatedCompletionDate),
  });

  return deepFreeze({ plan, dailyUnits: dailyUnits.map((unit) => dailyUnitSchema.parse(unit)) });
}

type ParsedEstimateInput = {
  units: PathUnit[];
  availability: AvailabilityVersion;
  planningDate: string;
  completedUnitIds: Set<string>;
};

function parseEstimateInput(input: CompletionEstimateInput): ParsedEstimateInput {
  if (!isExactObject(input, ["units", "availability", "planningDate", "completedUnitIds"], ["completedUnitIds"])) {
    invalidInput();
  }
  const units = parseOrInvalid(z.array(pathUnitSchema).max(2000), input.units);
  const availability = parseOrInvalid(availabilityVersionSchema, input.availability);
  const planningDate = parseOrInvalid(calendarDateSchema, input.planningDate);
  const completedUnitIds = parseCompletedUnitIds(input.completedUnitIds ?? new Set(), units);
  return { units, availability, planningDate, completedUnitIds };
}

function parseBuildInput(input: PlanBuildInput): PlanBuildInput & { completedUnitIds: Set<string> } {
  if (!isExactObject(input, [
    "path", "registry", "availability", "planningDate", "generation", "baseVersionId", "replanReason",
    "completedUnitIds",
  ])) invalidInput();
  const path = parseOrInvalid(learningPathVersionSchema, input.path);
  const registry = parseOrInvalid(unitRegistrySchema, input.registry);
  const availability = parseOrInvalid(availabilityVersionSchema, input.availability);
  const planningDate = parseOrInvalid(calendarDateSchema, input.planningDate);
  const generation = parseOrInvalid(planGenerationSchema, input.generation);
  const baseVersionId = input.baseVersionId === null
    ? null
    : parseOrInvalid(z.string().max(256).regex(ID_PATTERN), input.baseVersionId);
  const replanReason = input.replanReason === null
    ? null
    : parseOrInvalid(learningEventKindSchema, input.replanReason);
  const completedUnitIds = parseCompletedUnitIds(input.completedUnitIds, path.units);
  if (path.registryId !== registry.id
    || path.registryVersion !== registry.version
    || path.availabilityVersionId !== availability.id) invalidInput();
  return {
    path,
    registry,
    availability,
    planningDate,
    generation,
    baseVersionId,
    replanReason,
    completedUnitIds,
  };
}

function parseCompletedUnitIds(value: ReadonlySet<string>, units: readonly PathUnit[]): Set<string> {
  if (!(value instanceof Set)) invalidInput();
  const availableIds = new Set(units.map((unit) => unit.id));
  const parsed = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !ID_PATTERN.test(item) || !availableIds.has(item)) invalidInput();
    parsed.add(item);
  }
  return parsed;
}

type StrictSchema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };

function parseOrInvalid<T>(schema: StrictSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) invalidInput();
  return parsed.data;
}

function isExactObject(
  value: unknown,
  allowed: readonly string[],
  optional: readonly string[] = [],
): value is Record<string, unknown> {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
      return false;
    }
    const keys = Object.keys(value);
    const allowedSet = new Set(allowed);
    const optionalSet = new Set(optional);
    return keys.every((key) => allowedSet.has(key))
      && allowed.every((key) => optionalSet.has(key) || Object.hasOwn(value, key));
  } catch {
    return false;
  }
}

function invalidInput(): never {
  throw new PlanningScheduleError("INVALID_SCHEDULE_INPUT");
}

function horizonDates(planningDate: string): string[] {
  try {
    return calendarDates(planningDate, SCHEDULE_HORIZON_DAYS);
  } catch (error) {
    if (error instanceof TypeError) throw new PlanningScheduleError("SCHEDULE_HORIZON_EXCEEDED");
    throw error;
  }
}

function sevenDates(planningDate: string): string[] {
  try {
    return calendarDates(planningDate, 7);
  } catch {
    return invalidInput();
  }
}

function nextEligibleUnit(
  units: readonly PathUnit[],
  pending: ReadonlySet<string>,
  completed: ReadonlySet<string>,
): PathUnit | null {
  return units.find((unit) => pending.has(unit.id)
    && unit.prerequisiteUnitIds.every((prerequisiteId) => completed.has(prerequisiteId))) ?? null;
}

function resolvePathTemplates(
  path: LearningPathVersion,
  registry: UnitRegistry,
): ReadonlyMap<string, UnitTemplate> {
  const templates = new Map(registry.tracks.flatMap((track) =>
    track.templates.map((template) => [template.id, template] as const)));
  const resolved = new Map<string, UnitTemplate>();
  for (const unit of path.units) {
    const template = templates.get(unit.templateId);
    if (!template
      || template.version !== unit.templateVersion
      || template.skillId !== unit.skillId
      || template.kind !== unit.kind) invalidInput();
    if (unit.checkpointId !== null) {
      const checkpoint = template.checkpoints.find((item) => item.id === unit.checkpointId);
      if (!checkpoint || checkpoint.estimatedMinutes !== unit.estimatedMinutes) invalidInput();
    } else if (template.estimatedMinutes !== unit.estimatedMinutes) invalidInput();
    resolved.set(unit.id, template);
  }
  return resolved;
}

function reinforceTemplate(registry: UnitRegistry, skillId: string): UnitTemplate | null {
  const templates = registry.tracks.find((track) => track.skillId === skillId)?.templates
    .filter((template) => template.kind === "reinforce") ?? [];
  return templates.length === 1 ? templates[0]! : null;
}

type Placement = {
  date: string;
  slot: "primary" | "stretch";
  pathUnit: PathUnit | null;
  template: UnitTemplate;
  id?: string;
};

function stretchId(
  planVersionId: string,
  context: { date: string; slot: "stretch"; primary: PathUnit; template: UnitTemplate },
): string {
  return deterministicId("daily-unit", {
    planVersionId,
    scheduledDate: context.date,
    slot: context.slot,
    primaryUnitId: context.primary.id,
    templateId: context.template.id,
    templateVersion: context.template.version,
  });
}

function dailyUnitFromPlacement(planVersionId: string, placement: Placement): DailyUnit {
  const { template, pathUnit } = placement;
  const checkpoint = pathUnit?.checkpointId
    ? template.checkpoints.find((item) => item.id === pathUnit.checkpointId)
    : null;
  const checkpointStepIds = checkpoint ? new Set(checkpoint.stepIds) : null;
  return {
    id: placement.id ?? pathUnit!.id,
    planVersionId,
    templateId: template.id,
    templateVersion: template.version,
    checkpointId: pathUnit?.checkpointId ?? null,
    skillId: template.skillId,
    kind: template.kind,
    scheduledDate: placement.date,
    slot: placement.slot,
    required: placement.slot === "primary",
    objective: template.objective,
    whyNow: template.whyNow,
    primaryResourceId: template.primaryResourceId,
    alternativeResourceIds: [...template.alternativeResourceIds],
    steps: checkpointStepIds
      ? template.steps.filter((step) => checkpointStepIds.has(step.id))
      : [...template.steps],
    buildTask: template.buildTask,
    completionCriteria: [...template.completionCriteria],
    proofRequirement: template.proofRequirement,
    rubric: [...template.rubric],
    estimatedMinutes: pathUnit?.estimatedMinutes ?? template.estimatedMinutes,
  };
}

function summaryFor(dailyUnits: readonly DailyUnit[], estimatedCompletionDate: string): string {
  const requiredCount = dailyUnits.filter((unit) => unit.required).length;
  return `${requiredCount} required unit${requiredCount === 1 ? "" : "s"} scheduled; estimated completion ${estimatedCompletionDate}.`;
}

function scheduleErrorMessage(code: PlanningScheduleErrorCode): string {
  switch (code) {
    case "INVALID_SCHEDULE_INPUT": return "Planning schedule input is invalid.";
    case "UNIT_NEVER_FITS": return "A required unit cannot fit any available day.";
    case "SCHEDULE_HORIZON_EXCEEDED": return "The required units exceed the scheduling horizon.";
  }
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
