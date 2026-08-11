import type { LearningUnit, ProofItem } from "../domain/learning";

export type LearnerLevel = "new" | "beginner" | "intermediate" | "advanced";

export interface SetupAnswers {
  roleId: string;
  level: LearnerLevel;
  weeklyMinutes: number;
  targetWeeks: number;
}

export interface DemoState {
  setup: SetupAnswers;
  completedUnitIds: string[];
  proofs: ProofItem[];
}

export const DEMO_STORAGE_KEY = "arc-demo-state-v1";
const learnerLevels: LearnerLevel[] = ["new", "beginner", "intermediate", "advanced"];
const proofKinds: ProofItem["kind"][] = ["completion", "commit", "project", "note", "upload"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isLearnerLevel(value: unknown): value is LearnerLevel {
  return typeof value === "string" && learnerLevels.includes(value as LearnerLevel);
}

function isFiniteIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function isProofItem(value: unknown): value is ProofItem {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && isNonEmptyString(value.title)
    && typeof value.kind === "string"
    && proofKinds.includes(value.kind as ProofItem["kind"])
    && Array.isArray(value.skillIds)
    && value.skillIds.every(isNonEmptyString)
    && typeof value.verified === "boolean";
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isStrictProofItem(value: unknown): value is ProofItem {
  return isRecord(value)
    && isProofItem(value)
    && hasExactKeys(value, ["id", "title", "kind", "skillIds", "verified"]);
}

function parseStrictDemoState(value: unknown): DemoState | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ["setup", "completedUnitIds", "proofs"])
    || !isRecord(value.setup)
    || !hasExactKeys(value.setup, ["roleId", "level", "weeklyMinutes", "targetWeeks"])
    || !isNonEmptyString(value.setup.roleId)
    || !isLearnerLevel(value.setup.level)
    || !isFiniteIntegerInRange(value.setup.weeklyMinutes, 30, 2400)
    || !isFiniteIntegerInRange(value.setup.targetWeeks, 4, 52)
    || !Array.isArray(value.completedUnitIds)
    || !value.completedUnitIds.every(isNonEmptyString)
    || !Array.isArray(value.proofs)
    || !value.proofs.every(isStrictProofItem)) {
    return null;
  }

  return {
    setup: {
      roleId: value.setup.roleId,
      level: value.setup.level,
      weeklyMinutes: value.setup.weeklyMinutes,
      targetWeeks: value.setup.targetWeeks,
    },
    completedUnitIds: [...value.completedUnitIds],
    proofs: value.proofs.map((proof) => ({ ...proof, skillIds: [...proof.skillIds] })),
  };
}

export function createDemoState(): DemoState {
  return {
    setup: {
      roleId: "ai-native-full-stack-engineer",
      level: "beginner",
      weeklyMinutes: 420,
      targetWeeks: 18,
    },
    completedUnitIds: [],
    proofs: [],
  };
}

export function hasMeaningfulDemoState(state: DemoState): boolean {
  const defaults = createDemoState();
  return state.completedUnitIds.length > 0
    || state.proofs.length > 0
    || JSON.stringify(state.setup) !== JSON.stringify(defaults.setup);
}

export function fingerprintDemoState(state: DemoState): string {
  const serialized = JSON.stringify({
    setup: state.setup,
    completedUnitIds: state.completedUnitIds,
    proofs: state.proofs,
  });
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }

  const high = (first >>> 0).toString(16).padStart(8, "0");
  const low = (second >>> 0).toString(16).padStart(8, "0");
  return `v1-${high}${low}`;
}

export function mergeSetup(state: DemoState, setup: SetupAnswers): DemoState {
  return { ...state, setup: { ...setup } };
}

export function completeDemoUnit(state: DemoState, unit: LearningUnit): DemoState {
  if (state.completedUnitIds.includes(unit.id)) return state;

  const proof: ProofItem = {
    id: `proof-${unit.id}`,
    title: unit.deliverable,
    kind: "completion",
    skillIds: [...unit.skillIds],
    verified: true,
  };

  return {
    ...state,
    completedUnitIds: [...state.completedUnitIds, unit.id],
    proofs: [...state.proofs, proof],
  };
}

export function loadDemoState(storage?: Pick<Storage, "getItem">): DemoState {
  try {
    const resolvedStorage = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!resolvedStorage) return createDemoState();

    const raw = resolvedStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return createDemoState();

    const persisted = JSON.parse(raw);
    if (!isRecord(persisted)) return createDemoState();

    const defaults = createDemoState();
    const persistedSetup = isRecord(persisted.setup) ? persisted.setup : {};
    const setup: SetupAnswers = {
      roleId: isNonEmptyString(persistedSetup.roleId) ? persistedSetup.roleId.trim() : defaults.setup.roleId,
      level: isLearnerLevel(persistedSetup.level) ? persistedSetup.level : defaults.setup.level,
      weeklyMinutes: isFiniteIntegerInRange(persistedSetup.weeklyMinutes, 30, 2400)
        ? persistedSetup.weeklyMinutes
        : defaults.setup.weeklyMinutes,
      targetWeeks: isFiniteIntegerInRange(persistedSetup.targetWeeks, 4, 52)
        ? persistedSetup.targetWeeks
        : defaults.setup.targetWeeks,
    };

    return {
      setup,
      completedUnitIds: Array.isArray(persisted.completedUnitIds)
        ? persisted.completedUnitIds.filter(isNonEmptyString)
        : [],
      proofs: Array.isArray(persisted.proofs) ? persisted.proofs.filter(isProofItem) : [],
    };
  } catch {
    return createDemoState();
  }
}

export function readDemoStateForMigration(
  storage?: Pick<Storage, "getItem">,
): { found: false } | { found: true; state: DemoState; fingerprint: string } {
  try {
    const resolvedStorage = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!resolvedStorage) return { found: false };
    const raw = resolvedStorage.getItem(DEMO_STORAGE_KEY);
    if (raw === null) return { found: false };
    const state = parseStrictDemoState(JSON.parse(raw) as unknown);
    if (!state) return { found: false };
    return { found: true, state, fingerprint: fingerprintDemoState(state) };
  } catch {
    return { found: false };
  }
}

export function saveDemoState(state: DemoState, storage?: Pick<Storage, "setItem">): boolean {
  try {
    const resolvedStorage = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!resolvedStorage) return false;
    resolvedStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
