import type { RoleBlueprint, RoleSkill } from "../../contracts/intelligence";
import {
  calendarDateSchema,
  roleBlueprintSchema,
} from "../../contracts/intelligence";
import {
  availabilityVersionSchema,
  pathBuildResultSchema,
  planningTargetSchema,
  skillAuditVersionSchema,
  unitRegistrySchema,
  type AvailabilityVersion,
  type DeferredSkill,
  type LearningPathPhase,
  type LearningPathVersion,
  type PathBuildResult,
  type PathUnit,
  type PlanningTarget,
  type SkillAuditVersion,
  type UnitRegistry,
  type UnitTemplate,
} from "../../contracts/planning";
import { validateRoleBlueprint } from "../intelligence-validation";
import { addCalendarDays, compareCalendarDates, validateAvailabilityHorizon } from "./calendar";
import { deterministicId, fingerprint } from "./fingerprint";
import { validateUnitRegistry } from "./registry-validation";

export type PathBuildInput = {
  blueprint: RoleBlueprint;
  registry: UnitRegistry;
  audit: SkillAuditVersion;
  availability: AvailabilityVersion;
  target: PlanningTarget;
  planningDate: string;
};

export type CompletionEstimator = (
  units: readonly PathUnit[],
  availability: AvailabilityVersion,
  planningDate: string,
) => string;

export type PlanningInputIssue = Readonly<{
  code: string;
  path: string;
}>;

export class PlanningInputError extends Error {
  readonly issues: readonly PlanningInputIssue[];

  constructor(issues: readonly PlanningInputIssue[]) {
    super("Planning input is invalid.");
    this.name = "PlanningInputError";
    this.issues = Object.freeze([...issues].sort(compareIssues).map((issue) => Object.freeze({ ...issue })));
  }
}

export function createPathBuilder(estimate: CompletionEstimator) {
  if (typeof estimate !== "function") throw new TypeError("A completion estimator is required");
  return (input: PathBuildInput): PathBuildResult => buildValidatedPathAlternatives(input, estimate);
}

function buildValidatedPathAlternatives(
  input: PathBuildInput,
  estimate: CompletionEstimator,
): PathBuildResult {
  const parsed = parseAndValidateInput(input);
  const orderedSkills = topologicallyOrderSkills(parsed.blueprint);
  const allUnits = expandPathUnits(parsed, orderedSkills);
  const fullCompletionDate = estimate(allUnits, parsed.availability, parsed.planningDate);
  const fullScope = buildPathVersion(parsed, "full-scope", allUnits, [], fullCompletionDate);
  const deadline = addCalendarDays(parsed.planningDate, parsed.target.targetWeeks * 7 - 1);

  let targetDate: LearningPathVersion | null = null;
  let infeasibleReason: string | null = null;

  if (compareCalendarDates(fullCompletionDate, deadline) <= 0) {
    targetDate = buildPathVersion(parsed, "target-date", allUnits, [], fullCompletionDate);
  } else {
    const retained = new Set(orderedSkills.map((skill) => skill.id));
    const protectedSkills = protectedCoreClosure(parsed.blueprint);
    const deferred: DeferredSkill[] = [];

    while (targetDate === null) {
      const candidate = nextDeferCandidate(parsed.blueprint, retained, protectedSkills);
      if (!candidate) break;
      retained.delete(candidate.id);
      deferred.push({
        skillId: candidate.id,
        reason: candidate.importance === "advantage" ? "target-date-advantage" : "target-date-strong",
      });

      const retainedUnits = allUnits.filter((unit) => retained.has(unit.skillId));
      if (retainedUnits.length === 0) break;
      const completionDate = estimate(retainedUnits, parsed.availability, parsed.planningDate);
      if (compareCalendarDates(completionDate, deadline) <= 0) {
        targetDate = buildPathVersion(parsed, "target-date", retainedUnits, deferred, completionDate);
      }
    }

    if (targetDate === null) {
      infeasibleReason = "The protected learning scope cannot be completed by the target date without shortening authored units.";
    }
  }

  return deepFreeze(pathBuildResultSchema.parse({ fullScope, targetDate, infeasibleReason }));
}

type ValidatedPathInput = {
  blueprint: RoleBlueprint;
  registry: UnitRegistry;
  audit: SkillAuditVersion;
  availability: AvailabilityVersion;
  target: PlanningTarget;
  planningDate: string;
};

function parseAndValidateInput(input: PathBuildInput): ValidatedPathInput {
  const issues: PlanningInputIssue[] = [];
  const blueprint = parseContract(roleBlueprintSchema, input?.blueprint, "blueprint", issues);
  const registry = parseContract(unitRegistrySchema, input?.registry, "registry", issues);
  const audit = parseContract(skillAuditVersionSchema, input?.audit, "audit", issues);
  const availability = parseContract(availabilityVersionSchema, input?.availability, "availability", issues);
  const target = parseContract(planningTargetSchema, input?.target, "target", issues);
  const planningDate = parseContract(calendarDateSchema, input?.planningDate, "planning-date", issues);

  if (!blueprint || !registry || !audit || !availability || !target || !planningDate) {
    throw new PlanningInputError(issues);
  }

  for (const issue of validateRoleBlueprint(blueprint).issues) {
    issues.push({ code: `blueprint-${issue.code}`, path: `blueprint.${issue.path}` });
  }
  for (const issue of validateUnitRegistry(registry, blueprint).issues) {
    issues.push({ code: `registry-${issue.code}`, path: `registry.${issue.path}` });
  }

  validateAuditCoverage(blueprint, audit, issues);
  try {
    validateAvailabilityHorizon(availability, planningDate);
  } catch {
    issues.push({ code: "availability-horizon-invalid", path: "availability.exceptions" });
  }

  if (issues.length > 0) throw new PlanningInputError(issues);
  return { blueprint, registry, audit, availability, target, planningDate };
}

type StrictSchema<T> = {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: readonly { code: string; path: readonly PropertyKey[] }[] } };
};

function parseContract<T>(
  schema: StrictSchema<T>,
  value: unknown,
  root: string,
  issues: PlanningInputIssue[],
): T | null {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  for (const issue of parsed.error.issues) {
    issues.push({
      code: `${root}-contract-${issue.code}`,
      path: semanticPath(root, issue.path),
    });
  }
  return null;
}

function semanticPath(root: string, path: readonly PropertyKey[]): string {
  return path.reduce<string>((result, part) =>
    typeof part === "number" ? `${result}[${part}]` : `${result}.${String(part)}`, root);
}

function validateAuditCoverage(
  blueprint: RoleBlueprint,
  audit: SkillAuditVersion,
  issues: PlanningInputIssue[],
): void {
  if (audit.blueprintId !== blueprint.id) {
    issues.push({ code: "audit-blueprint-mismatch", path: "audit.blueprintId" });
  }
  if (audit.blueprintVersion !== blueprint.version) {
    issues.push({ code: "audit-blueprint-version-mismatch", path: "audit.blueprintVersion" });
  }

  const blueprintSkillIds = new Set(blueprint.skills.map((skill) => skill.id));
  const answerSkillIds = new Set(audit.answers.map((answer) => answer.skillId));
  for (const skill of blueprint.skills) {
    if (!answerSkillIds.has(skill.id)) {
      issues.push({ code: "audit-answer-missing", path: `audit.answers.skill:${skill.id}` });
    }
  }
  for (const answer of audit.answers) {
    if (!blueprintSkillIds.has(answer.skillId)) {
      issues.push({ code: "audit-answer-extra", path: `audit.answers.skill:${answer.skillId}` });
    }
  }
}

function topologicallyOrderSkills(blueprint: RoleBlueprint): RoleSkill[] {
  const skillById = new Map(blueprint.skills.map((skill) => [skill.id, skill]));
  const indegree = new Map(blueprint.skills.map((skill) => [skill.id, skill.prerequisiteIds.length]));
  const dependents = new Map<string, string[]>();
  for (const skill of blueprint.skills) {
    for (const prerequisiteId of skill.prerequisiteIds) {
      const current = dependents.get(prerequisiteId) ?? [];
      current.push(skill.id);
      dependents.set(prerequisiteId, current);
    }
  }

  const comparator = skillComparator(blueprint);
  const ready = blueprint.skills.filter((skill) => indegree.get(skill.id) === 0).sort(comparator);
  const ordered: RoleSkill[] = [];
  while (ready.length > 0) {
    const skill = ready.shift()!;
    ordered.push(skill);
    for (const dependentId of dependents.get(skill.id) ?? []) {
      const remaining = indegree.get(dependentId)! - 1;
      indegree.set(dependentId, remaining);
      if (remaining === 0) {
        ready.push(skillById.get(dependentId)!);
        ready.sort(comparator);
      }
    }
  }
  return ordered;
}

function skillComparator(blueprint: RoleBlueprint): (left: RoleSkill, right: RoleSkill) => number {
  const phaseIndexes = new Map<string, number>();
  blueprint.phases.forEach((phase, phaseIndex) => {
    phase.skillIds.forEach((skillId) => phaseIndexes.set(skillId, phaseIndex));
  });
  const blueprintIndexes = new Map(blueprint.skills.map((skill, index) => [skill.id, index]));
  return (left, right) =>
    phaseIndexes.get(left.id)! - phaseIndexes.get(right.id)!
    || blueprintIndexes.get(left.id)! - blueprintIndexes.get(right.id)!
    || compareOrdinal(left.id, right.id);
}

function expandPathUnits(input: ValidatedPathInput, orderedSkills: readonly RoleSkill[]): PathUnit[] {
  const tracks = new Map(input.registry.tracks.map((track) => [track.skillId, track]));
  const answers = new Map(input.audit.answers.map((answer) => [answer.skillId, answer]));
  const finalUnitIds = new Map<string, string>();
  const units: PathUnit[] = [];

  for (const skill of orderedSkills) {
    const answer = answers.get(skill.id)!;
    const templates = tracks.get(skill.id)!.templates.filter((template) =>
      answer.level === "independent" ? template.kind === "calibrate" : template.kind === "learn");
    let previousUnitId: string | null = null;

    for (const template of templates) {
      const parts = template.checkpoints.length > 0 ? template.checkpoints : [null];
      for (const checkpoint of parts) {
        const unitId = stableUnitId(input, template, checkpoint?.id ?? null);
        const prerequisiteUnitIds = previousUnitId
          ? [previousUnitId]
          : skill.prerequisiteIds.map((id) => finalUnitIds.get(id)!);
        const unit: PathUnit = {
          id: unitId,
          templateId: template.id,
          templateVersion: template.version,
          checkpointId: checkpoint?.id ?? null,
          skillId: skill.id,
          kind: template.kind,
          estimatedMinutes: checkpoint?.estimatedMinutes ?? template.estimatedMinutes,
          prerequisiteUnitIds,
        };
        units.push(deepFreeze(unit));
        previousUnitId = unitId;
      }
    }
    finalUnitIds.set(skill.id, previousUnitId!);
  }
  return units;
}

function stableUnitId(
  input: ValidatedPathInput,
  template: UnitTemplate,
  checkpointId: string | null,
): string {
  return deterministicId("path-unit", {
    blueprintId: input.blueprint.id,
    blueprintVersion: input.blueprint.version,
    registryId: input.registry.id,
    registryVersion: input.registry.version,
    templateId: template.id,
    templateVersion: template.version,
    checkpointId,
  });
}

function protectedCoreClosure(blueprint: RoleBlueprint): ReadonlySet<string> {
  const byId = new Map(blueprint.skills.map((skill) => [skill.id, skill]));
  const protectedIds = new Set<string>();
  const stack = blueprint.skills.filter((skill) => skill.importance === "core").map((skill) => skill.id);
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (protectedIds.has(id)) continue;
    protectedIds.add(id);
    stack.push(...byId.get(id)!.prerequisiteIds);
  }
  return protectedIds;
}

function nextDeferCandidate(
  blueprint: RoleBlueprint,
  retained: ReadonlySet<string>,
  protectedSkills: ReadonlySet<string>,
): RoleSkill | null {
  const requiredByRetained = prerequisiteClosure(blueprint, retained);
  const candidates = blueprint.skills.filter((skill) =>
    retained.has(skill.id)
    && !protectedSkills.has(skill.id)
    && !requiredByRetained.has(skill.id)
    && (skill.importance === "advantage" || skill.importance === "strong"));
  const baseComparator = skillComparator(blueprint);
  candidates.sort((left, right) =>
    importanceRank(left) - importanceRank(right) || baseComparator(left, right));
  return candidates[0] ?? null;
}

function prerequisiteClosure(blueprint: RoleBlueprint, retained: ReadonlySet<string>): ReadonlySet<string> {
  const byId = new Map(blueprint.skills.map((skill) => [skill.id, skill]));
  const closure = new Set<string>();
  const stack: string[] = [];
  for (const skillId of retained) stack.push(...byId.get(skillId)!.prerequisiteIds);
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (closure.has(id)) continue;
    closure.add(id);
    stack.push(...byId.get(id)!.prerequisiteIds);
  }
  return closure;
}

function importanceRank(skill: RoleSkill): number {
  return skill.importance === "advantage" ? 0 : 1;
}

function buildPathVersion(
  input: ValidatedPathInput,
  scopeMode: LearningPathVersion["scopeMode"],
  units: readonly PathUnit[],
  deferredSkills: readonly DeferredSkill[],
  estimatedCompletionDate: string,
): LearningPathVersion {
  const unitIds = new Set(units.map((unit) => unit.id));
  const phases: LearningPathPhase[] = input.blueprint.phases.flatMap((phase) => {
    const phaseSkillIds = new Set(phase.skillIds);
    const phaseUnitIds = units
      .filter((unit) => phaseSkillIds.has(unit.skillId) && unitIds.has(unit.id))
      .map((unit) => unit.id);
    return phaseUnitIds.length > 0 ? [{
      phaseId: phase.id,
      name: phase.name,
      outcome: phase.outcome,
      unitIds: phaseUnitIds,
    }] : [];
  });
  const inputFingerprint = fingerprint({
    blueprint: input.blueprint,
    registry: input.registry,
    audit: input.audit,
    availability: input.availability,
    target: input.target,
    planningDate: input.planningDate,
    scopeMode,
    units,
    deferredSkills,
    estimatedCompletionDate,
  });
  return {
    id: deterministicId("learning-path", { inputFingerprint }),
    schemaVersion: input.audit.schemaVersion,
    blueprintId: input.blueprint.id,
    blueprintVersion: input.blueprint.version,
    registryId: input.registry.id,
    registryVersion: input.registry.version,
    auditVersionId: input.audit.id,
    availabilityVersionId: input.availability.id,
    targetId: input.target.id,
    scopeMode,
    phases,
    units: [...units],
    deferredSkills: [...deferredSkills],
    estimatedStartDate: input.planningDate,
    estimatedCompletionDate,
    inputFingerprint,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function compareIssues(left: PlanningInputIssue, right: PlanningInputIssue): number {
  return compareOrdinal(left.code, right.code) || compareOrdinal(left.path, right.path);
}

function compareOrdinal(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
