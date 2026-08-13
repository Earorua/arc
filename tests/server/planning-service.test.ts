import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import type { PlanningMutationResult } from "../../app/contracts/planning";
import {
  PlanningConflictError,
  PlanningNotFoundError,
  PlanningService,
  PlanningUnavailableError,
} from "../../app/server/planning/service";
import type { PlanningRepository } from "../../app/server/planning/repository";

const userId = "user-private-1";
const goalId = "goal-private-1";

function generateRequest() {
  return {
    mutationId: "mutation-generate-1",
    roleId: "ai-native-full-stack-engineer" as const,
    planningDate: "2026-08-17",
    audit: {
      id: "audit-1",
      schemaVersion: "2026.08.1" as const,
      blueprintId: flagshipBlueprint.id,
      blueprintVersion: flagshipBlueprint.version,
      answers: flagshipBlueprint.skills.map(({ id: skillId }) => ({
        skillId,
        level: "conceptual" as const,
        evidenceRefs: [],
      })),
      evidence: [],
      createdBy: "learner",
      inputFingerprint: "audit-fingerprint",
    },
    availability: {
      id: "availability-1",
      schemaVersion: "2026.08.1" as const,
      timeZone: "Asia/Shanghai",
      weekdays: {
        monday: 60, tuesday: 60, wednesday: 60, thursday: 60,
        friday: 60, saturday: 60, sunday: 60,
      },
      exceptions: [],
      weeklyMinutes: 420,
      inputFingerprint: "availability-fingerprint",
    },
    target: {
      id: "target-1",
      schemaVersion: "2026.08.1" as const,
      targetWeeks: 18,
      inputFingerprint: "target-fingerprint",
    },
    selectedScope: "full-scope" as const,
  };
}

function fakeRepository(overrides: Partial<PlanningRepository> = {}): PlanningRepository {
  return {
    findActiveGoal: vi.fn(async () => ({ ownerId: userId, goalId })),
    load: vi.fn(async () => null),
    findMutation: vi.fn(async () => null),
    saveGeneration: vi.fn(async (command) => ({
      ownerId: command.ownerId,
      goalId: command.goalId,
      payload: command.result,
    })),
    saveEvent: vi.fn(async (command) => ({
      ownerId: command.ownerId,
      goalId: command.goalId,
      payload: command.result,
    })),
    ...overrides,
  };
}

function createService(
  repository: PlanningRepository,
  registry: unknown = flagshipUnitRegistry,
  blueprint = flagshipBlueprint,
) {
  const getPublished = vi.fn(async () => structuredClone(blueprint));
  return {
    getPublished,
    service: new PlanningService({
      repository,
      intelligence: { getPublished },
      registry,
      createId: () => "event-service-1",
      now: () => new Date("2026-08-17T00:00:00.000Z"),
    }),
  };
}

async function generatedResult(): Promise<PlanningMutationResult> {
  const repository = fakeRepository();
  return createService(repository).service.generate(userId, generateRequest());
}

describe("PlanningService", () => {
  it("rejects an empty authenticated owner before touching the repository", async () => {
    const repository = fakeRepository();
    const { service } = createService(repository);

    await expect(service.getWorkspace("  ")).rejects.toMatchObject({ code: "PLANNING_UNAVAILABLE" });
    expect(repository.findActiveGoal).not.toHaveBeenCalled();
  });

  it("rejects empty owners before parsing every mutation body or calling dependencies", async () => {
    const invocations = [
      (service: PlanningService) => service.generate(" ", {}),
      (service: PlanningService) => service.appendEvent(" ", {}),
      (service: PlanningService) => service.acceptReplan(" ", {}),
      (service: PlanningService) => service.discardReplan(" ", {}),
    ];

    for (const invoke of invocations) {
      const repository = fakeRepository();
      const { service, getPublished } = createService(repository);
      const error = await invoke(service).catch((caught) => caught);

      expect(error).toBeInstanceOf(PlanningUnavailableError);
      expect(error.message).toBe("Planning is unavailable. The previous valid state is unchanged.");
      expect(repository.findActiveGoal).not.toHaveBeenCalled();
      expect(repository.load).not.toHaveBeenCalled();
      expect(repository.findMutation).not.toHaveBeenCalled();
      expect(repository.saveGeneration).not.toHaveBeenCalled();
      expect(repository.saveEvent).not.toHaveBeenCalled();
      expect(getPublished).not.toHaveBeenCalled();
    }
  });

  it("resolves the active goal only through the repository and loads an owner-scoped workspace", async () => {
    const result = await generatedResult();
    const repository = fakeRepository({
      load: vi.fn(async () => ({ ownerId: userId, goalId, payload: result.workspace })),
    });

    const workspace = await createService(repository).service.getWorkspace(userId);

    expect(workspace).toEqual(result.workspace);
    expect(repository.findActiveGoal).toHaveBeenCalledWith(userId);
    expect(repository.load).toHaveBeenCalledWith({ ownerId: userId, goalId });
  });

  it("requests only the flagship intelligence and validates every generation input before writing", async () => {
    const repository = fakeRepository();
    const { service, getPublished } = createService(repository);

    const result = await service.generate(userId, generateRequest());

    expect(getPublished).toHaveBeenCalledWith("ai-native-full-stack-engineer");
    expect(result.outcome).toBe("active");
    expect(repository.saveGeneration).toHaveBeenCalledOnce();
    expect(result.workspace.goalId).toBe(goalId);
  });

  it("does not write a candidate when blueprint, registry, command, or output validation fails", async () => {
    const cases: Array<{ request: unknown; registry: unknown }> = [
      { request: { ...generateRequest(), unknown: true }, registry: flagshipUnitRegistry },
      { request: generateRequest(), registry: { ...flagshipUnitRegistry, unknown: true } },
    ];
    for (const candidate of cases) {
      const repository = fakeRepository();
      const { service } = createService(repository, candidate.registry);
      await expect(service.generate(userId, candidate.request)).rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect(repository.saveGeneration).not.toHaveBeenCalled();
    }

    const repository = fakeRepository({
      saveGeneration: vi.fn(async () => ({ ownerId: userId, goalId, payload: { private: "broken" } })),
    });
    await expect(createService(repository).service.generate(userId, generateRequest()))
      .rejects.toBeInstanceOf(PlanningUnavailableError);
  });

  it("fails closed on schema-valid semantic blueprint and registry defects before any write", async () => {
    const cyclicBlueprint = structuredClone(flagshipBlueprint);
    const [firstSkill, secondSkill] = cyclicBlueprint.skills;
    firstSkill!.prerequisiteIds = [secondSkill!.id];
    secondSkill!.prerequisiteIds = [firstSkill!.id];
    const mismatchedRegistry = structuredClone(flagshipUnitRegistry);
    mismatchedRegistry.blueprintVersion = "2026.08.999";

    for (const candidate of [
      { blueprint: cyclicBlueprint, registry: flagshipUnitRegistry },
      { blueprint: flagshipBlueprint, registry: mismatchedRegistry },
    ]) {
      const repository = fakeRepository();
      const { service } = createService(repository, candidate.registry, candidate.blueprint);
      const error = await service.generate(userId, generateRequest()).catch((caught) => caught);

      expect(error).toBeInstanceOf(PlanningUnavailableError);
      expect(error.issues).toEqual([...error.issues].sort());
      expect(error.message).not.toContain(firstSkill!.id);
      expect(repository.saveGeneration).not.toHaveBeenCalled();
    }

    const current = await generatedResult();
    for (const candidate of [
      { blueprint: cyclicBlueprint, registry: flagshipUnitRegistry },
      { blueprint: flagshipBlueprint, registry: mismatchedRegistry },
    ]) {
      const repository = fakeRepository({
        load: vi.fn(async () => ({ ownerId: userId, goalId, payload: structuredClone(current.workspace) })),
      });
      const { service } = createService(repository, candidate.registry, candidate.blueprint);
      const error = await service.appendEvent(userId, {
        mutationId: "mutation-semantic-invalid",
        baseVersionId: current.workspace.activePlanVersionId,
        event: {
          kind: "completed",
          unitId: current.workspace.dailyUnits[0]!.id,
          actualMinutes: 30,
          planningDate: "2026-08-17",
        },
      }).catch((caught) => caught);

      expect(error).toBeInstanceOf(PlanningUnavailableError);
      expect(error.issues).toEqual([...error.issues].sort());
      expect(repository.saveEvent).not.toHaveBeenCalled();
    }

    const proposedRepository = fakeRepository({
      load: vi.fn(async () => ({ ownerId: userId, goalId, payload: structuredClone(current.workspace) })),
    });
    const proposedService = createService(proposedRepository).service;
    const proposed = await proposedService.appendEvent(userId, {
      mutationId: "mutation-proposal",
      baseVersionId: current.workspace.activePlanVersionId,
      event: {
        kind: "delayed",
        unitId: current.workspace.dailyUnits[0]!.id,
        planningDate: "2026-08-17",
      },
    });
    for (const decision of ["acceptReplan", "discardReplan"] as const) {
      const repository = fakeRepository({
        load: vi.fn(async () => ({ ownerId: userId, goalId, payload: structuredClone(proposed.workspace) })),
      });
      const { service } = createService(repository, mismatchedRegistry);
      const error = await service[decision](userId, {
        mutationId: decision === "acceptReplan" ? "mutation-accept" : "mutation-discard",
        baseVersionId: proposed.workspace.activePlanVersionId,
        candidatePlanVersionId: proposed.workspace.pendingPlanVersionId,
      }).catch((caught) => caught);

      expect(error).toBeInstanceOf(PlanningUnavailableError);
      expect(error.issues).toEqual([...error.issues].sort());
      expect(repository.saveEvent).not.toHaveBeenCalled();
    }
  });

  it("returns the exact stored public result for an idempotent replay without recomputing", async () => {
    const stored = await generatedResult();
    const repository = fakeRepository({
      findMutation: vi.fn(async () => ({ ownerId: userId, goalId, payload: structuredClone(stored) })),
    });
    const { service, getPublished } = createService(repository);

    const replay = await service.generate(userId, generateRequest());

    expect(replay).toEqual(stored);
    expect(getPublished).not.toHaveBeenCalled();
    expect(repository.saveGeneration).not.toHaveBeenCalled();
  });

  it("rejects owner and goal mismatches with private-safe typed errors", async () => {
    const repository = fakeRepository({
      findActiveGoal: vi.fn(async () => ({ ownerId: "another-private-user", goalId })),
    });

    const error = await createService(repository).service.getWorkspace(userId).catch((caught) => caught);

    expect(error).toBeInstanceOf(PlanningNotFoundError);
    expect(error.message).not.toContain(userId);
    expect(error.message).not.toContain(goalId);
    expect(error.message).not.toContain("another-private-user");
  });

  it("reports a stale active plan as a typed conflict before saving", async () => {
    const current = await generatedResult();
    const repository = fakeRepository({
      load: vi.fn(async () => ({ ownerId: userId, goalId, payload: current.workspace })),
    });

    await expect(createService(repository).service.appendEvent(userId, {
      mutationId: "mutation-event-1",
      baseVersionId: "stale-plan",
      event: { kind: "completed", unitId: current.workspace.dailyUnits[0]!.id, actualMinutes: 30, planningDate: "2026-08-17" },
    })).rejects.toBeInstanceOf(PlanningConflictError);
    expect(repository.saveEvent).not.toHaveBeenCalled();
  });

  it("pre-validates a completed transition and returns its exact replay", async () => {
    const current = await generatedResult();
    const repository = fakeRepository({
      load: vi.fn(async () => ({ ownerId: userId, goalId, payload: structuredClone(current.workspace) })),
    });
    const service = createService(repository).service;
    const input = {
      mutationId: "mutation-complete-1",
      baseVersionId: current.workspace.activePlanVersionId,
      event: {
        kind: "completed" as const,
        unitId: current.workspace.dailyUnits[0]!.id,
        actualMinutes: 30,
        planningDate: "2026-08-17",
      },
    };

    const first = await service.appendEvent(userId, input);
    expect(first.workspace.revision).toBe(current.workspace.revision + 1);
    expect(first.workspace.events.at(-1)?.mutationId).toBe(input.mutationId);
    expect(repository.saveEvent).toHaveBeenCalledOnce();

    vi.mocked(repository.findMutation).mockResolvedValueOnce({
      ownerId: userId, goalId, payload: structuredClone(first),
    });
    const replay = await service.appendEvent(userId, input);
    expect(replay).toEqual(first);
    expect(repository.saveEvent).toHaveBeenCalledOnce();
  });

  it("keeps forbidden providers and legacy persistence outside the service boundary", () => {
    const source = readFileSync(resolve(process.cwd(), "app/server/planning/service.ts"), "utf8");
    expect(source).not.toMatch(/openrouter|proof_items|learning_events|r2|legacy/iu);
  });
});
