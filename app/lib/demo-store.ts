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
    kind: "commit",
    skillIds: [...unit.skillIds],
    verified: true,
  };

  return {
    ...state,
    completedUnitIds: [...state.completedUnitIds, unit.id],
    proofs: [...state.proofs, proof],
  };
}

export function loadDemoState(storage: Pick<Storage, "getItem"> = window.localStorage): DemoState {
  try {
    const raw = storage.getItem(storageKey);
    return raw ? { ...createDemoState(), ...JSON.parse(raw) } : createDemoState();
  } catch {
    return createDemoState();
  }
}

export function saveDemoState(state: DemoState, storage: Pick<Storage, "setItem"> = window.localStorage): void {
  try {
    storage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Device-local persistence is best effort.
  }
}
