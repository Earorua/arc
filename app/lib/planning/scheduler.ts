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
import {
  addCalendarDays,
  calendarDates,
  compareCalendarDates,
  validateAvailabilityHorizon,
  weekdayForDate,
} from "./calendar";
import { canonicalJson, deterministicId, fingerprint } from "./fingerprint";

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
  return estimateParsedCompletionDate(parsed);
}

export function buildPlanVersion(input: PlanBuildInput): {
  plan: PlanVersion;
  dailyUnits: DailyUnit[];
} {
  const parsed = parseBuildInput(input);
  const templates = resolvePathTemplates(parsed.path, parsed.registry);
  const estimatedCompletionDate = estimateParsedCompletionDate({
    units: parsed.path.units,
    graph: parsed.graph,
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
  const schedule = createScheduleState(parsed.graph, parsed.completedUnitIds);
  const budget = createBudgetResolver(parsed.availability, parsed.planningDate);
  const placements: Placement[] = [];
  const days = sevenDates(parsed.planningDate).map((date, dayIndex) => {
    const budgetMinutes = budget.minutes(date, dayIndex);
    if (budgetMinutes === 0) {
      return {
        date,
        budgetMinutes,
        status: "rest" as const,
        primaryUnitId: null,
        stretchUnitId: null,
      };
    }

    const primaryIndex = schedule.nextIndex();
    const primary = primaryIndex === null ? null : parsed.path.units[primaryIndex]!;
    if (!primary || primary.estimatedMinutes > budgetMinutes) {
      return {
        date,
        budgetMinutes,
        status: "open" as const,
        primaryUnitId: null,
        stretchUnitId: null,
      };
    }

    schedule.complete(primaryIndex!);
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
  graph: ValidatedUnitGraph;
  availability: AvailabilityVersion;
  planningDate: string;
  completedUnitIds: Set<string>;
};

function parseEstimateInput(input: CompletionEstimateInput): ParsedEstimateInput {
  const fields = readExactDataObject(
    input,
    ["units", "availability", "planningDate"],
    ["completedUnitIds"],
  );
  const units = parseOrInvalid(z.array(pathUnitSchema).max(2000), fields.units);
  const graph = validateUnitGraph(units);
  const availability = parseOrInvalid(availabilityVersionSchema, fields.availability);
  const planningDate = parseOrInvalid(calendarDateSchema, fields.planningDate);
  validateAvailabilityBoundary(availability, planningDate);
  const completedUnitIds = parseCompletedUnitIds(fields.completedUnitIds ?? new Set(), units);
  return { units, graph, availability, planningDate, completedUnitIds };
}

function parseBuildInput(input: PlanBuildInput): PlanBuildInput & {
  completedUnitIds: Set<string>;
  graph: ValidatedUnitGraph;
} {
  const fields = readExactDataObject(input, [
    "path", "registry", "availability", "planningDate", "generation", "baseVersionId", "replanReason",
    "completedUnitIds",
  ]);
  const path = parseOrInvalid(learningPathVersionSchema, fields.path);
  const graph = validateUnitGraph(path.units);
  const registry = parseOrInvalid(unitRegistrySchema, fields.registry);
  const availability = parseOrInvalid(availabilityVersionSchema, fields.availability);
  const planningDate = parseOrInvalid(calendarDateSchema, fields.planningDate);
  validateAvailabilityBoundary(availability, planningDate);
  const generation = parseOrInvalid(planGenerationSchema, fields.generation);
  const baseVersionId = fields.baseVersionId === null
    ? null
    : parseOrInvalid(z.string().max(256).regex(ID_PATTERN), fields.baseVersionId);
  const replanReason = fields.replanReason === null
    ? null
    : parseOrInvalid(learningEventKindSchema, fields.replanReason);
  const completedUnitIds = parseCompletedUnitIds(fields.completedUnitIds, path.units);
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
    graph,
  };
}

function parseCompletedUnitIds(value: unknown, units: readonly PathUnit[]): Set<string> {
  try {
    if (!(value instanceof Set)) invalidInput();
    const availableIds = new Set(units.map((unit) => unit.id));
    const parsed = new Set<string>();
    for (const item of value) {
      if (typeof item !== "string" || !ID_PATTERN.test(item) || !availableIds.has(item)) invalidInput();
      parsed.add(item);
    }
    return parsed;
  } catch {
    return invalidInput();
  }
}

type StrictSchema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };

function parseOrInvalid<T>(schema: StrictSchema<T>, value: unknown): T {
  try {
    const isolated = JSON.parse(canonicalJson(value)) as unknown;
    const parsed = schema.safeParse(isolated);
    if (!parsed.success) invalidInput();
    return parsed.data;
  } catch {
    return invalidInput();
  }
}

function readExactDataObject(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
      return invalidInput();
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(descriptors).length > 0) return invalidInput();
    const allowedSet = new Set([...required, ...optional]);
    const optionalSet = new Set(optional);
    const snapshot: Record<string, unknown> = {};
    for (const key of Object.getOwnPropertyNames(descriptors)) {
      const descriptor = descriptors[key]!;
      if (!allowedSet.has(key) || !descriptor.enumerable || !("value" in descriptor)) return invalidInput();
      snapshot[key] = descriptor.value;
    }
    if (required.some((key) => !Object.hasOwn(snapshot, key))) return invalidInput();
    if (Object.keys(snapshot).some((key) => !required.includes(key) && !optionalSet.has(key))) return invalidInput();
    return snapshot;
  } catch {
    return invalidInput();
  }
}

function invalidInput(): never {
  throw new PlanningScheduleError("INVALID_SCHEDULE_INPUT");
}

function validateAvailabilityBoundary(
  availability: AvailabilityVersion,
  planningDate: string,
): void {
  try {
    validateAvailabilityHorizon(availability, planningDate);
  } catch {
    // The shared validator computes planningDate + 365 eagerly. At the terminal
    // representable year, every valid future exception is necessarily within
    // that conceptual bound, so retain its past-date rule without overflowing.
    if (availability.exceptions.every((exception) =>
      compareCalendarDates(exception.date, planningDate) >= 0)) {
      try {
        addCalendarDays(planningDate, 365);
      } catch {
        return;
      }
    }
    invalidInput();
  }
}

type ValidatedUnitGraph = Readonly<{
  units: readonly PathUnit[];
  prerequisiteIndexes: readonly (readonly number[])[];
  dependentIndexes: readonly (readonly number[])[];
}>;

function validateUnitGraph(units: readonly PathUnit[]): ValidatedUnitGraph {
  const indexById = new Map<string, number>();
  units.forEach((unit, index) => {
    if (indexById.has(unit.id)) invalidInput();
    indexById.set(unit.id, index);
  });
  const prerequisiteIndexes = units.map((unit) => unit.prerequisiteUnitIds.map((id) => {
    const index = indexById.get(id);
    if (index === undefined || index === indexById.get(unit.id)) return invalidInput();
    return index;
  }));
  const dependentIndexes = units.map(() => [] as number[]);
  prerequisiteIndexes.forEach((prerequisites, dependentIndex) => {
    prerequisites.forEach((prerequisiteIndex) => dependentIndexes[prerequisiteIndex]!.push(dependentIndex));
  });

  const remaining = prerequisiteIndexes.map((prerequisites) => prerequisites.length);
  const ready = new MinIndexHeap();
  remaining.forEach((count, index) => { if (count === 0) ready.push(index); });
  let visited = 0;
  while (ready.size > 0) {
    const index = ready.pop()!;
    visited += 1;
    for (const dependentIndex of dependentIndexes[index]!) {
      remaining[dependentIndex] -= 1;
      if (remaining[dependentIndex] === 0) ready.push(dependentIndex);
    }
  }
  if (visited !== units.length) invalidInput();
  return { units, prerequisiteIndexes, dependentIndexes };
}

function estimateParsedCompletionDate(input: ParsedEstimateInput): string {
  const schedule = createScheduleState(input.graph, input.completedUnitIds);
  if (schedule.remaining === 0) return input.planningDate;
  const budget = createBudgetResolver(input.availability, input.planningDate);
  if (input.units.some((unit, index) => schedule.isPending(index)
    && unit.estimatedMinutes > budget.maximumMinutes)) {
    throw new PlanningScheduleError("UNIT_NEVER_FITS");
  }

  let date = input.planningDate;
  for (let dayIndex = 0; dayIndex < SCHEDULE_HORIZON_DAYS; dayIndex += 1) {
    const nextIndex = schedule.nextIndex();
    if (nextIndex !== null
      && input.units[nextIndex]!.estimatedMinutes <= budget.minutes(date, dayIndex)) {
      schedule.complete(nextIndex);
      if (schedule.remaining === 0) return date;
    }
    if (dayIndex === SCHEDULE_HORIZON_DAYS - 1) break;
    try {
      date = addCalendarDays(date, 1);
    } catch {
      throw new PlanningScheduleError("SCHEDULE_HORIZON_EXCEEDED");
    }
  }
  throw new PlanningScheduleError("SCHEDULE_HORIZON_EXCEEDED");
}

type ScheduleState = Readonly<{
  nextIndex(): number | null;
  complete(index: number): void;
  isPending(index: number): boolean;
  readonly remaining: number;
}>;

function createScheduleState(
  graph: ValidatedUnitGraph,
  completedUnitIds: ReadonlySet<string>,
): ScheduleState {
  const completed = graph.units.map((unit) => completedUnitIds.has(unit.id));
  const pending = completed.map((isCompleted) => !isCompleted);
  const remainingPrerequisites = graph.prerequisiteIndexes.map((prerequisites) =>
    prerequisites.reduce((count, index) => count + (completed[index] ? 0 : 1), 0));
  const ready = new MinIndexHeap();
  pending.forEach((isPending, index) => {
    if (isPending && remainingPrerequisites[index] === 0) ready.push(index);
  });
  let remaining = pending.filter(Boolean).length;

  return {
    nextIndex: () => ready.peek(),
    complete(index: number) {
      if (!pending[index] || ready.peek() !== index) invalidInput();
      ready.pop();
      pending[index] = false;
      completed[index] = true;
      remaining -= 1;
      for (const dependentIndex of graph.dependentIndexes[index]!) {
        if (!pending[dependentIndex]) continue;
        remainingPrerequisites[dependentIndex] -= 1;
        if (remainingPrerequisites[dependentIndex] === 0) ready.push(dependentIndex);
      }
    },
    isPending: (index: number) => pending[index] ?? false,
    get remaining() { return remaining; },
  };
}

const WEEKDAY_KEYS: (keyof AvailabilityVersion["weekdays"])[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

function createBudgetResolver(availability: AvailabilityVersion, planningDate: string) {
  const exceptionMinutes = new Map(availability.exceptions.map((exception) => [exception.date, exception.minutes]));
  const startWeekdayIndex = WEEKDAY_KEYS.indexOf(weekdayForDate(planningDate));
  const maximumMinutes = Math.max(
    ...Object.values(availability.weekdays),
    ...availability.exceptions.map((exception) => exception.minutes),
  );
  return {
    maximumMinutes,
    minutes(date: string, dayIndex: number): number {
      return exceptionMinutes.get(date)
        ?? availability.weekdays[WEEKDAY_KEYS[(startWeekdayIndex + dayIndex) % 7]!]!;
    },
  };
}

class MinIndexHeap {
  private readonly values: number[] = [];

  get size(): number { return this.values.length; }

  peek(): number | null { return this.values[0] ?? null; }

  push(value: number): void {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.values[parent]! <= value) break;
      this.values[index] = this.values[parent]!;
      index = parent;
    }
    this.values[index] = value;
  }

  pop(): number | null {
    const first = this.values[0];
    const last = this.values.pop();
    if (first === undefined || last === undefined) return null;
    if (this.values.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= this.values.length) break;
      const right = left + 1;
      const child = right < this.values.length && this.values[right]! < this.values[left]! ? right : left;
      if (this.values[child]! >= last) break;
      this.values[index] = this.values[child]!;
      index = child;
    }
    this.values[index] = last;
    return first;
  }
}

function sevenDates(planningDate: string): string[] {
  try {
    return calendarDates(planningDate, 7);
  } catch {
    return invalidInput();
  }
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
