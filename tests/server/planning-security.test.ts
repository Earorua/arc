import { describe, expect, it, vi } from "vitest";
import {
  availabilityVersionSchema,
  MAX_PLANNING_WORKSPACE_BYTES,
  planningWorkspaceSchema,
  planningSourceContextSchema,
  PLANNING_SCHEMA_VERSION,
  parsePlanningWorkspaceAtRepositoryBoundary,
  skillAuditVersionSchema,
  skillEvidenceSchema,
  type DailyUnit,
  type PlanVersion,
  type PlanningWorkspace,
} from "../../app/contracts/planning";
import { planningMutationResponseSchema, planningWorkspaceResponseSchema } from "../../app/contracts/planning-api";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { buildLearningPaths } from "../../app/lib/planning/path-builder";
import { buildPlanVersion } from "../../app/lib/planning/scheduler";
import {
  createPlanningGenerateHandler,
  type PlanningRouteDependencies,
} from "../../app/server/http/planning-route-factories";
import type { PlanningRepository } from "../../app/server/planning/repository";
import {
  PlanningNotFoundError,
  PlanningService,
  PlanningUnavailableError,
} from "../../app/server/planning/service";

const PLANNING_DATE = "2026-08-17";

function auditFixture() {
  return {
    id: "security-audit",
    schemaVersion: PLANNING_SCHEMA_VERSION,
    blueprintId: flagshipBlueprint.id,
    blueprintVersion: flagshipBlueprint.version,
    answers: flagshipBlueprint.skills.map(({ id: skillId }) => ({
      skillId,
      level: "conceptual" as const,
      evidenceRefs: [],
    })),
    evidence: [],
    createdBy: "security-learner",
    inputFingerprint: "security-audit-fingerprint",
  };
}

function availabilityFixture() {
  return {
    id: "security-availability",
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
    inputFingerprint: "security-availability-fingerprint",
  };
}

function targetFixture() {
  return {
    id: "security-target",
    schemaVersion: PLANNING_SCHEMA_VERSION,
    targetWeeks: 18,
    inputFingerprint: "security-target-fingerprint",
  };
}

function baseWorkspace(): PlanningWorkspace {
  const audit = auditFixture();
  const availability = availabilityFixture();
  const target = targetFixture();
  const path = buildLearningPaths({
    blueprint: flagshipBlueprint,
    registry: flagshipUnitRegistry,
    audit,
    availability,
    target,
    planningDate: PLANNING_DATE,
  }).fullScope;
  const built = buildPlanVersion({
    path,
    registry: flagshipUnitRegistry,
    availability,
    planningDate: PLANNING_DATE,
    generation: "initial",
    baseVersionId: null,
    replanReason: null,
    completedUnitIds: new Set(),
  });
  return planningWorkspaceSchema.parse({
    id: "security-workspace",
    goalId: "security-goal",
    revision: 0,
    lastSequence: 0,
    audit,
    availability,
    availabilityVersions: [availability],
    target,
    pathVersions: [path],
    planVersions: [built.plan],
    dailyUnits: built.dailyUnits,
    events: [],
    activePathVersionId: path.id,
    activePlanVersionId: built.plan.id,
    pendingPlanVersionId: null,
  });
}

function maximumCardinalityWorkspace(): PlanningWorkspace {
  const base = baseWorkspace();
  const prototype = base.dailyUnits[0]!;
  const pathId = base.pathVersions[0]!.id;
  const plans: PlanVersion[] = [];
  const dailyUnits: DailyUnit[] = [];
  for (let planIndex = 0; planIndex < 500; planIndex += 1) {
    const planId = `security-plan-${planIndex}`;
    const unitIds = Array.from({ length: 4 }, (_, dayIndex) => `security-unit-${planIndex}-${dayIndex}`);
    const days = base.planVersions[0]!.days.map((day, dayIndex) => ({
      ...day,
      status: dayIndex < 4 ? "scheduled" as const : day.budgetMinutes === 0 ? "rest" as const : "open" as const,
      primaryUnitId: unitIds[dayIndex] ?? null,
      stretchUnitId: null,
    }));
    plans.push({
      ...base.planVersions[0]!,
      id: planId,
      pathVersionId: pathId,
      baseVersionId: null,
      days,
      dailyUnitIds: unitIds,
      inputFingerprint: `security-plan-fingerprint-${planIndex}`,
      summary: "Bounded plan",
    });
    dailyUnits.push(...unitIds.map((id, dayIndex) => ({
      ...prototype,
      id,
      planVersionId: planId,
      scheduledDate: days[dayIndex]!.date,
      slot: "primary" as const,
      objective: "Objective",
      whyNow: "Why now",
      steps: [{ id: `step-${planIndex}-${dayIndex}`, label: "Do the work", minutes: 15 }],
      buildTask: "Build one artifact",
      completionCriteria: ["Artifact exists"],
      proofRequirement: "Show the artifact",
      rubric: ["Artifact is correct"],
    })));
  }
  return {
    ...base,
    planVersions: plans,
    dailyUnits,
    activePlanVersionId: plans.at(-1)!.id,
  };
}

function generateRequest() {
  return {
    mutationId: "security-generate",
    roleId: "ai-native-full-stack-engineer" as const,
    planningDate: PLANNING_DATE,
    audit: auditFixture(),
    availability: availabilityFixture(),
    target: targetFixture(),
    selectedScope: "full-scope" as const,
  };
}

describe("planning contract resource and security boundaries", () => {
  it.each([
    ["blueprint version", { blueprint: { ...flagshipBlueprint, version: "2026.08.999" } }],
    ["registry id", { registry: { ...flagshipUnitRegistry, id: "tampered-flagship-registry" } }],
    ["registry version", { registry: { ...flagshipUnitRegistry, version: "2026.08.999" } }],
  ] as const)("rejects a tampered Flagship %s in workspace and mutation HTTP envelopes", (_label, override) => {
    const workspace = baseWorkspace();
    const sourceContext = {
      reference: { source: "flagship", roleId: "ai-native-full-stack-engineer" },
      blueprint: flagshipBlueprint,
      registry: flagshipUnitRegistry,
      ...override,
    };
    expect(planningSourceContextSchema.safeParse(sourceContext).success).toBe(false);
    expect(planningWorkspaceResponseSchema.safeParse({ workspace, sourceContext }).success).toBe(false);
    expect(planningMutationResponseSchema.safeParse({
      result: { outcome: "active", workspace, diff: null }, sourceContext,
    }).success).toBe(false);
  });

  it("keeps legacy planning error envelopes distinct from Research top-level request IDs", async () => {
    const dependencies: PlanningRouteDependencies = {
      requireUser: async () => { throw new Error("legacy planning auth failure"); },
      createService: () => ({
        getWorkspaceResponse: async () => ({ workspace: null, sourceContext: null }),
        generateResponse: async () => { throw new Error("not used"); },
        appendEventResponse: async () => { throw new Error("not used"); },
        acceptReplanResponse: async () => { throw new Error("not used"); },
        discardReplanResponse: async () => { throw new Error("not used"); },
      }),
      rateLimiter: { reserve: async () => ({ allowed: true, retryAfterSeconds: 0 }) },
      recordEvent: async () => undefined,
      createRequestId: () => "00000000-0000-4000-8000-000000000001",
    };
    const response = await createPlanningGenerateHandler(dependencies)(new Request("https://arc.example/api/planning/generate", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(generateRequest()),
    }));
    const body = await response.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty("requestId");
    expect(body).toHaveProperty("error.requestId", "00000000-0000-4000-8000-000000000001");
    expect(body).not.toHaveProperty("error.recovery");
  });

  it("accepts exact audit/evidence maxima and rejects the first item beyond either cap", () => {
    const answers = Array.from({ length: 64 }, (_, answerIndex) => ({
      skillId: `security-skill-${answerIndex}`,
      level: "guided" as const,
      evidenceRefs: Array.from({ length: 3 }, (_, evidenceIndex) => `security-evidence-${answerIndex}-${evidenceIndex}`),
    }));
    const evidence = answers.flatMap(({ skillId, evidenceRefs }) => evidenceRefs.map((id) => ({
      id,
      skillId,
      kind: "repository" as const,
      url: `https://example.com/${id}`,
      note: "Learner-supplied evidence metadata",
    })));
    const maximum = { ...auditFixture(), answers, evidence };

    expect(answers).toHaveLength(64);
    expect(evidence).toHaveLength(192);
    expect(skillAuditVersionSchema.safeParse(maximum).success).toBe(true);
    expect(skillAuditVersionSchema.safeParse({
      ...maximum,
      answers: [...answers, { skillId: "security-skill-over", level: "unseen", evidenceRefs: [] }],
    }).success).toBe(false);
    expect(skillAuditVersionSchema.safeParse({
      ...maximum,
      evidence: [...evidence, {
        id: "security-evidence-over",
        skillId: "security-skill-over",
        kind: "other",
        url: "https://example.com/over",
        note: "Over",
      }],
    }).success).toBe(false);
  });

  it("accepts 90 unique availability exceptions and rejects exception 91", () => {
    const exceptions = Array.from({ length: 90 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
      return { date, minutes: index % 2 === 0 ? 0 : 90, reason: `Exception ${index}` };
    });
    const maximum = { ...availabilityFixture(), exceptions };

    expect(availabilityVersionSchema.safeParse(maximum).success).toBe(true);
    expect(availabilityVersionSchema.safeParse({
      ...maximum,
      exceptions: [...exceptions, { date: "2026-04-01", minutes: 60, reason: "Over" }],
    }).success).toBe(false);
  });

  it("accepts 500 plans with 2,000 Daily Units and rejects the first plan or unit above the cap", () => {
    const maximum = maximumCardinalityWorkspace();
    const parsed = planningWorkspaceSchema.safeParse(maximum);
    expect(parsed.success).toBe(true);
    expect(maximum.planVersions).toHaveLength(500);
    expect(maximum.dailyUnits).toHaveLength(2000);

    const extraPlan = { ...maximum.planVersions[0]!, id: "security-plan-over", inputFingerprint: "security-plan-over-fingerprint" };
    const plansOver = planningWorkspaceSchema.safeParse({ ...maximum, planVersions: [...maximum.planVersions, extraPlan] });
    expect(plansOver.success).toBe(false);
    if (!plansOver.success) expect(plansOver.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "too_big", path: ["planVersions"] }),
    ]));

    const unitOver = planningWorkspaceSchema.safeParse({
      ...maximum,
      dailyUnits: [...maximum.dailyUnits, { ...maximum.dailyUnits[0]!, id: "security-unit-over" }],
    });
    expect(unitOver.success).toBe(false);
    if (!unitOver.success) expect(unitOver.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "too_big", path: ["dailyUnits"] }),
    ]));
  });

  it("accepts 5,000 ordered events and rejects event 5,001", () => {
    const base = baseWorkspace();
    const unit = base.dailyUnits.find(({ planVersionId }) => planVersionId === base.activePlanVersionId)!;
    const events = Array.from({ length: 5000 }, (_, index) => ({
      kind: "completed" as const,
      unitId: unit.id,
      actualMinutes: 15,
      planningDate: unit.scheduledDate,
      eventId: `security-event-${index}`,
      mutationId: `security-mutation-${index}`,
      sequence: index + 1,
      targetPlanVersionId: base.activePlanVersionId,
      occurredAt: "2026-08-17T00:00:00.000Z",
    }));
    const maximum = { ...base, revision: 5000, lastSequence: 5000, events };

    expect(planningWorkspaceSchema.safeParse(maximum).success).toBe(true);
    const over = planningWorkspaceSchema.safeParse({
      ...maximum,
      revision: 5001,
      lastSequence: 5001,
      events: [...events, { ...events[0]!, eventId: "security-event-over", mutationId: "security-mutation-over", sequence: 5001 }],
    });
    expect(over.success).toBe(false);
    if (!over.success) expect(over.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "too_big", path: ["events"] }),
    ]));
  });

  it("accepts a compact maximum-cardinality workspace below 4 MiB and rejects a schema-valid expansion before parsing", () => {
    const maximum = maximumCardinalityWorkspace();
    const compactBytes = new TextEncoder().encode(JSON.stringify(maximum)).byteLength;
    expect(compactBytes).toBeLessThanOrEqual(MAX_PLANNING_WORKSPACE_BYTES);
    expect(parsePlanningWorkspaceAtRepositoryBoundary(maximum)).toEqual(maximum);

    const expanded = {
      ...maximum,
      dailyUnits: maximum.dailyUnits.map((unit) => ({
        ...unit,
        objective: "o".repeat(500),
        whyNow: "w".repeat(500),
        buildTask: "b".repeat(800),
        completionCriteria: Array.from({ length: 8 }, (_, index) => `${index}-${"c".repeat(490)}`),
        proofRequirement: "p".repeat(800),
        rubric: Array.from({ length: 6 }, (_, index) => `${index}-${"r".repeat(490)}`),
      })),
    };
    expect(planningWorkspaceSchema.safeParse(expanded).success).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(expanded)).byteLength).toBeGreaterThan(MAX_PLANNING_WORKSPACE_BYTES);
    expect(() => parsePlanningWorkspaceAtRepositoryBoundary(expanded)).toThrow("exceeds the 4 MiB repository boundary");
  });

  it.each([
    "https://user:secret@example.com/evidence",
    "https://127.0.0.1/private",
    "https://metadata.google.internal/latest",
    "https://intranet/evidence",
  ])("rejects non-public evidence URL %s", (url) => {
    expect(skillEvidenceSchema.safeParse({
      id: "security-evidence",
      skillId: "security-skill",
      kind: "repository",
      url,
      note: "Private URL",
    }).success).toBe(false);
  });

  it("fails closed on owner/cross-goal payloads and never exposes repository errors", async () => {
    const workspace = baseWorkspace();
    const repository: PlanningRepository = {
      findActiveGoal: async () => ({ ownerId: "security-owner", goalId: "security-goal" }),
      load: async () => ({ ownerId: "security-owner", goalId: "foreign-goal", payload: workspace }),
      findMutation: async () => null,
      saveGeneration: async (command) => ({ ...command, payload: command.result }),
      saveEvent: async (command) => ({ ...command, payload: command.result }),
    };
    const service = new PlanningService({
      repository,
      intelligence: { getPublished: async () => flagshipBlueprint },
      registry: flagshipUnitRegistry,
    });

    await expect(service.getWorkspace("security-owner")).rejects.toBeInstanceOf(PlanningNotFoundError);
    repository.findActiveGoal = async () => { throw new Error("token=private-token sql=private-row"); };
    const error = await service.getWorkspace("security-owner").catch((caught) => caught);
    expect(error).toBeInstanceOf(PlanningUnavailableError);
    expect(error.message).toBe("Planning is unavailable. The previous valid state is unchanged.");
    expect(JSON.stringify(error)).not.toMatch(/private-token|private-row/iu);
  });

  it("redacts thrown service payloads from API bodies and operational events", async () => {
    const recordEvent = vi.fn(async () => undefined);
    const dependencies: PlanningRouteDependencies = {
      requireUser: async () => ({ id: "security-owner", name: "Private Learner", email: "private@example.com" }),
      createService: () => ({
        getWorkspaceResponse: async () => ({ workspace: null, sourceContext: null }),
        generateResponse: async () => { throw new Error("token=private-token body=private-audit"); },
        appendEventResponse: async () => { throw new Error("not used"); },
        acceptReplanResponse: async () => { throw new Error("not used"); },
        discardReplanResponse: async () => { throw new Error("not used"); },
      }),
      rateLimiter: { reserve: async () => ({ allowed: true, retryAfterSeconds: 0 }) },
      recordEvent,
      createRequestId: () => "00000000-0000-4000-8000-000000000001",
      now: () => 100,
    };
    const response = await createPlanningGenerateHandler(dependencies)(new Request("https://arc.example/api/planning/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(generateRequest()),
    }));
    const serialized = JSON.stringify(await response.json());
    const recorded = JSON.stringify(recordEvent.mock.calls);

    expect(response.status).toBe(500);
    expect(serialized).toContain("Arc could not complete this planning request.");
    expect(serialized).not.toMatch(/private-token|private-audit|private@example.com|Private Learner/iu);
    expect(recorded).not.toMatch(/private-token|private-audit|private@example.com|Private Learner/iu);
  });
});
