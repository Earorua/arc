import {
  planDiffSchema,
  planVersionSchema,
  type PlanDiff,
  type PlanDiffItem,
  type PlanVersion,
} from "../../contracts/planning";
import { canonicalJson, deterministicId, fingerprint } from "./fingerprint";

export type PlanningEventErrorCode =
  | "STALE_SEQUENCE"
  | "DUPLICATE_MUTATION"
  | "UNIT_NOT_ACTIVE"
  | "REINFORCEMENT_UNAVAILABLE"
  | "PENDING_REPLAN_REQUIRED"
  | "BASE_REVISION_MISMATCH"
  | "COMPLETED_HISTORY_CHANGED";

export class PlanningEventError extends Error {
  readonly code: PlanningEventErrorCode;

  constructor(code: PlanningEventErrorCode) {
    super(errorMessage(code));
    this.name = "PlanningEventError";
    this.code = code;
  }
}

export function diffPlans(input: {
  active: PlanVersion;
  candidate: PlanVersion;
  completedUnitIds: ReadonlySet<string>;
}): PlanDiff {
  const parsed = parseDiffInput(input);
  const activeDates = indexPlacements(parsed.active);
  const candidateDates = indexPlacements(parsed.candidate);
  const unitIds = [...new Set([...activeDates.keys(), ...candidateDates.keys()])].sort(compareOrdinal);
  const items = unitIds.map((unitId): PlanDiffItem => {
    const fromDate = activeDates.get(unitId) ?? null;
    const toDate = candidateDates.get(unitId) ?? null;
    const change = classify(fromDate, toDate);
    if (parsed.completedUnitIds.has(unitId) && change !== "unchanged") {
      throw new PlanningEventError("COMPLETED_HISTORY_CHANGED");
    }
    return { unitId, change, fromDate, toDate, reason: reasonFor(change, fromDate, toDate) };
  }).sort(compareDiffItems);
  const core = {
    basePlanVersionId: parsed.active.id,
    candidatePlanVersionId: parsed.candidate.id,
    items,
    previousEstimatedCompletionDate: parsed.active.estimatedCompletionDate,
    nextEstimatedCompletionDate: parsed.candidate.estimatedCompletionDate,
    summary: completionSummary(parsed.active, parsed.candidate),
  };
  const inputFingerprint = fingerprint(core);
  return deepFreeze(planDiffSchema.parse({
    id: deterministicId("plan-diff", { inputFingerprint }),
    ...core,
    inputFingerprint,
  }));
}

function parseDiffInput(input: unknown): {
  active: PlanVersion;
  candidate: PlanVersion;
  completedUnitIds: Set<string>;
} {
  const snapshot = exactObject(input, ["active", "candidate", "completedUnitIds"]);
  const active = parsePlan(snapshot.active);
  const candidate = parsePlan(snapshot.candidate);
  const completedUnitIds = parseNativeStringSet(snapshot.completedUnitIds);
  return { active, candidate, completedUnitIds };
}

function parsePlan(value: unknown): PlanVersion {
  return planVersionSchema.parse(JSON.parse(canonicalJson(value)) as unknown);
}

function exactObject(value: unknown, required: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError("Plan diff input is invalid.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(descriptors).length > 0
    || Object.keys(descriptors).some((key) => !required.includes(key))
    || required.some((key) => !Object.hasOwn(descriptors, key))) {
    throw new TypeError("Plan diff input is invalid.");
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of required) {
    const descriptor = descriptors[key]!;
    if (!descriptor.enumerable || !("value" in descriptor)) throw new TypeError("Plan diff input is invalid.");
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function parseNativeStringSet(value: unknown): Set<string> {
  if (!(value instanceof Set) || Object.getPrototypeOf(value) !== Set.prototype) {
    throw new TypeError("Completed unit IDs must be a native Set.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length > 0) throw new TypeError("Completed unit IDs must be a native Set.");
  const result = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") throw new TypeError("Completed unit IDs must be strings.");
    result.add(item);
  }
  return result;
}

function indexPlacements(plan: PlanVersion): Map<string, string> {
  const dates = new Map<string, string>();
  for (const day of plan.days) {
    if (day.primaryUnitId !== null) dates.set(day.primaryUnitId, day.date);
    if (day.stretchUnitId !== null) dates.set(day.stretchUnitId, day.date);
  }
  return dates;
}

function classify(fromDate: string | null, toDate: string | null): PlanDiffItem["change"] {
  if (fromDate === null) return "added";
  if (toDate === null) return "removed";
  return fromDate === toDate ? "unchanged" : "moved";
}

function reasonFor(change: PlanDiffItem["change"], fromDate: string | null, toDate: string | null): string {
  switch (change) {
    case "added": return "Added to the candidate plan.";
    case "removed": return "Removed from the candidate plan.";
    case "moved": return `Moved from ${fromDate} to ${toDate}.`;
    case "unchanged": return `Remains scheduled for ${toDate}.`;
  }
}

const CHANGE_RANK: Record<PlanDiffItem["change"], number> = {
  added: 0,
  moved: 1,
  removed: 2,
  unchanged: 3,
};

function compareDiffItems(left: PlanDiffItem, right: PlanDiffItem): number {
  return CHANGE_RANK[left.change] - CHANGE_RANK[right.change]
    || compareOrdinal(left.toDate ?? left.fromDate!, right.toDate ?? right.fromDate!)
    || compareOrdinal(left.unitId, right.unitId);
}

function completionSummary(active: PlanVersion, candidate: PlanVersion): string {
  if (active.estimatedCompletionDate === candidate.estimatedCompletionDate) {
    return `Estimated completion remains ${candidate.estimatedCompletionDate}.`;
  }
  return `Estimated completion moves from ${active.estimatedCompletionDate} to ${candidate.estimatedCompletionDate}.`;
}

function compareOrdinal(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function errorMessage(code: PlanningEventErrorCode): string {
  switch (code) {
    case "STALE_SEQUENCE": return "The planning event sequence is stale.";
    case "DUPLICATE_MUTATION": return "The planning mutation was already applied.";
    case "UNIT_NOT_ACTIVE": return "The learning unit is not active.";
    case "REINFORCEMENT_UNAVAILABLE": return "No matching reinforcement unit is available.";
    case "PENDING_REPLAN_REQUIRED": return "A matching pending replan is required.";
    case "BASE_REVISION_MISMATCH": return "The planning base revision does not match.";
    case "COMPLETED_HISTORY_CHANGED": return "Completed learning history cannot be changed.";
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
