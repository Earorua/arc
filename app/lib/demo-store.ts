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

const storageKey = "arc-demo-state-v1";
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

    const raw = resolvedStorage.getItem(storageKey);
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

export function saveDemoState(state: DemoState, storage?: Pick<Storage, "setItem">): boolean {
  try {
    const resolvedStorage = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!resolvedStorage) return false;
    resolvedStorage.setItem(storageKey, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
