import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  GeneratePlanningRequest,
  PlanningEventRequest,
  ReplanDecisionRequest,
} from "../../../app/contracts/planning-api";
import {
  PLANNING_SCHEMA_VERSION,
  type PlanningMutationResult,
  type PlanningWorkspace,
} from "../../../app/contracts/planning";
import { flagshipBlueprint } from "../../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../../app/data/flagship-unit-registry";
import { createLocalPlanningRepository } from "../../../app/lib/planning/local-repository";
import { fingerprint } from "../../../app/lib/planning/fingerprint";
import type {
  PlanningOwnerGoal,
  PlanningRepository,
  PlanningRepositoryPayload,
} from "../../../app/server/planning/repository";
import { PlanningService } from "../../../app/server/planning/service";

const OWNER_ID = "parity-owner";
const GOAL_ID = "parity-goal";
const PLANNING_DATE = "2026-08-17";
const NOW = new Date("2026-08-17T00:00:00.000Z");

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

class MemoryPlanningRepository implements PlanningRepository {
  private current: PlanningRepositoryPayload | null = null;
  private readonly results = new Map<string, PlanningRepositoryPayload>();

  async findActiveGoal(ownerId: string): Promise<PlanningOwnerGoal | null> {
    return ownerId === OWNER_ID ? { ownerId, goalId: GOAL_ID } : null;
  }

  async load(scope: PlanningOwnerGoal): Promise<PlanningRepositoryPayload | null> {
    return this.current && sameScope(this.current, scope) ? structuredClone(this.current) : null;
  }

  async findMutation(input: PlanningOwnerGoal & { mutationId: string }): Promise<PlanningRepositoryPayload | null> {
    const stored = this.results.get(input.mutationId);
    return stored && sameScope(stored, input) ? structuredClone(stored) : null;
  }

  async saveGeneration(command: PlanningOwnerGoal & { mutationId: string; result: PlanningMutationResult }) {
    return this.save(command);
  }

  async saveEvent(command: PlanningOwnerGoal & {
    mutationId: string;
    result: PlanningMutationResult;
    baseRevision: number;
    baseVersionId: string;
    previous: unknown;
  }) {
    return this.save(command);
  }

  private save(command: PlanningOwnerGoal & { mutationId: string; result: PlanningMutationResult }) {
    const resultPayload = {
      ownerId: command.ownerId,
      goalId: command.goalId,
      payload: structuredClone(command.result),
    };
    this.current = {
      ownerId: command.ownerId,
      goalId: command.goalId,
      payload: structuredClone(command.result.workspace),
    };
    this.results.set(command.mutationId, resultPayload);
    return Promise.resolve(structuredClone(resultPayload));
  }
}

function sameScope(left: PlanningOwnerGoal, right: PlanningOwnerGoal): boolean {
  return left.ownerId === right.ownerId && left.goalId === right.goalId;
}

function generationRequest(): GeneratePlanningRequest {
  return {
    mutationId: "parity-generation",
    roleId: "ai-native-full-stack-engineer",
    planningDate: PLANNING_DATE,
    audit: {
      id: "parity-audit",
      schemaVersion: PLANNING_SCHEMA_VERSION,
      blueprintId: flagshipBlueprint.id,
      blueprintVersion: flagshipBlueprint.version,
      answers: flagshipBlueprint.skills.map(({ id: skillId }) => ({
        skillId,
        level: "guided" as const,
        evidenceRefs: [],
      })),
      evidence: [],
      createdBy: "parity-learner",
      inputFingerprint: "parity-audit-fingerprint",
    },
    availability: {
      id: "parity-availability",
      schemaVersion: PLANNING_SCHEMA_VERSION,
      timeZone: "Asia/Shanghai",
      weekdays: {
        monday: 120,
        tuesday: 120,
        wednesday: 120,
        thursday: 120,
        friday: 120,
        saturday: 120,
        sunday: 120,
      },
      exceptions: [],
      weeklyMinutes: 840,
      inputFingerprint: "parity-availability-fingerprint",
    },
    target: {
      id: "parity-target",
      schemaVersion: PLANNING_SCHEMA_VERSION,
      targetWeeks: 18,
      inputFingerprint: "parity-target-fingerprint",
    },
    selectedScope: "full-scope",
  };
}

function requiredUnit(workspace: PlanningWorkspace) {
  const unit = workspace.dailyUnits.find((candidate) =>
    candidate.planVersionId === workspace.activePlanVersionId && candidate.required);
  if (!unit) throw new Error("Expected an active required unit");
  return unit;
}

function eventRequest(
  workspace: PlanningWorkspace,
  mutationId: string,
  kind: "completed" | "delayed" | "too_hard" | "already_known",
): PlanningEventRequest {
  const unit = requiredUnit(workspace);
  return {
    mutationId,
    baseVersionId: workspace.activePlanVersionId,
    event: kind === "completed"
      ? { kind, unitId: unit.id, actualMinutes: unit.estimatedMinutes, planningDate: unit.scheduledDate }
      : { kind, unitId: unit.id, planningDate: unit.scheduledDate },
  };
}

function availabilityEvent(workspace: PlanningWorkspace): PlanningEventRequest {
  return {
    mutationId: "parity-availability-change",
    baseVersionId: workspace.activePlanVersionId,
    event: {
      kind: "availability_changed",
      planningDate: PLANNING_DATE,
      availability: {
        ...workspace.availability,
        id: "parity-availability-revised",
        weekdays: { ...workspace.availability.weekdays, monday: 105 },
        weeklyMinutes: workspace.availability.weeklyMinutes - 15,
        inputFingerprint: "parity-availability-revised-fingerprint",
      },
    },
  };
}

function decisionRequest(
  workspace: PlanningWorkspace,
  mutationId: string,
): ReplanDecisionRequest {
  if (!workspace.pendingPlanVersionId) throw new Error("Expected a pending candidate");
  return {
    mutationId,
    baseVersionId: workspace.activePlanVersionId,
    candidatePlanVersionId: workspace.pendingPlanVersionId,
  };
}

function parityProjection(result: PlanningMutationResult) {
  const { workspace } = result;
  const activePlan = workspace.planVersions.find(({ id }) => id === workspace.activePlanVersionId);
  return {
    outcome: result.outcome,
    diff: result.diff,
    auditFingerprint: workspace.audit.inputFingerprint,
    availabilityFingerprints: workspace.availabilityVersions.map(({ inputFingerprint }) => inputFingerprint),
    pathFingerprints: workspace.pathVersions.map(({ inputFingerprint }) => inputFingerprint),
    planFingerprints: workspace.planVersions.map(({ inputFingerprint }) => inputFingerprint),
    dailyUnits: workspace.dailyUnits.map((unit) => ({
      planVersionId: unit.planVersionId,
      id: unit.id,
      templateId: unit.templateId,
      scheduledDate: unit.scheduledDate,
      slot: unit.slot,
      required: unit.required,
    })),
    eventFingerprints: workspace.events.map((event) => fingerprint(event)),
    eventKinds: workspace.events.map(({ kind }) => kind),
    activePathVersionId: workspace.activePathVersionId,
    activePlanVersionId: workspace.activePlanVersionId,
    pendingPlanVersionId: workspace.pendingPlanVersionId,
    completedUnitIds: workspace.events
      .filter((event) => event.kind === "completed")
      .map(({ unitId }) => unitId),
    estimatedCompletionDate: activePlan?.estimatedCompletionDate,
  };
}

describe("guest and cloud adaptive planning parity", () => {
  let restoreLocks: (() => void) | undefined;

  beforeEach(() => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
    const locks = { request: async <T>(_name: string, _options: unknown, callback: () => T | Promise<T>) => callback() };
    Object.defineProperty(navigator, "locks", { configurable: true, value: locks });
    restoreLocks = () => {
      if (descriptor) Object.defineProperty(navigator, "locks", descriptor);
      else Reflect.deleteProperty(navigator, "locks");
    };
  });

  afterEach(() => restoreLocks?.());

  it("keeps the full ordered event stream, diffs, pointers, fingerprints, replay, and conflicts identical", async () => {
    const storage = new MemoryStorage();
    let localId = 0;
    const local = createLocalPlanningRepository({
      storage,
      createId: () => ["parity-workspace", GOAL_ID][localId++] ?? `parity-event-${localId - 2}`,
      now: () => NOW,
    });
    const cloudStore = new MemoryPlanningRepository();
    let cloudId = 0;
    const cloud = new PlanningService({
      repository: cloudStore,
      intelligence: { getPublished: async () => structuredClone(flagshipBlueprint) },
      registry: flagshipUnitRegistry,
      createId: () => cloudId++ === 0 ? "parity-workspace" : `parity-event-${cloudId - 1}`,
      now: () => NOW,
    });

    let localResult = await local.generate(generationRequest());
    let cloudResult = await cloud.generate(OWNER_ID, generationRequest());
    expect(parityProjection(localResult)).toEqual(parityProjection(cloudResult));
    const oldBaseVersionId = localResult.workspace.activePlanVersionId;

    const runEvent = async (mutationId: string, kind: "completed" | "delayed" | "too_hard" | "already_known") => {
      const localRequest = eventRequest(localResult.workspace, mutationId, kind);
      const cloudRequest = eventRequest(cloudResult.workspace, mutationId, kind);
      localResult = await local.appendEvent(localRequest);
      cloudResult = await cloud.appendEvent(OWNER_ID, cloudRequest);
      expect(parityProjection(localResult)).toEqual(parityProjection(cloudResult));
    };
    const decide = async (mutationId: string, decision: "accept" | "discard") => {
      const localRequest = decisionRequest(localResult.workspace, mutationId);
      const cloudRequest = decisionRequest(cloudResult.workspace, mutationId);
      localResult = decision === "accept" ? await local.accept(localRequest) : await local.discard(localRequest);
      cloudResult = decision === "accept"
        ? await cloud.acceptReplan(OWNER_ID, cloudRequest)
        : await cloud.discardReplan(OWNER_ID, cloudRequest);
      expect(parityProjection(localResult)).toEqual(parityProjection(cloudResult));
    };

    await runEvent("parity-completed", "completed");
    await runEvent("parity-delayed", "delayed");
    await decide("parity-discarded", "discard");
    await runEvent("parity-too-hard", "too_hard");
    await decide("parity-hard-accepted", "accept");
    await runEvent("parity-already-known", "already_known");
    await decide("parity-known-accepted", "accept");
    const localAvailability = availabilityEvent(localResult.workspace);
    const cloudAvailability = availabilityEvent(cloudResult.workspace);
    localResult = await local.appendEvent(localAvailability);
    cloudResult = await cloud.appendEvent(OWNER_ID, cloudAvailability);
    const localAvailabilityProposal = structuredClone(localResult);
    const cloudAvailabilityProposal = structuredClone(cloudResult);
    expect(parityProjection(localResult)).toEqual(parityProjection(cloudResult));
    await decide("parity-availability-accepted", "accept");

    expect(localResult.workspace.events.map(({ kind }) => kind)).toEqual([
      "completed",
      "delayed",
      "replan_discarded",
      "too_hard",
      "replan_accepted",
      "already_known",
      "replan_accepted",
      "availability_changed",
      "replan_accepted",
    ]);

    const localReplay = await local.appendEvent(localAvailability);
    const cloudReplay = await cloud.appendEvent(OWNER_ID, cloudAvailability);
    expect(localReplay).toEqual(localAvailabilityProposal);
    expect(cloudReplay).toEqual(cloudAvailabilityProposal);
    expect(parityProjection(localReplay)).toEqual(parityProjection(cloudReplay));

    const staleLocal = eventRequest(localResult.workspace, "parity-stale", "delayed");
    const staleCloud = eventRequest(cloudResult.workspace, "parity-stale", "delayed");
    staleLocal.baseVersionId = oldBaseVersionId;
    staleCloud.baseVersionId = oldBaseVersionId;
    await expect(local.appendEvent(staleLocal)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(cloud.appendEvent(OWNER_ID, staleCloud)).rejects.toMatchObject({ code: "CONFLICT" });
  }, 30_000);
});
