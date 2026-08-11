import { describe, expect, it } from "vitest";
import {
  generatePlanningRequestSchema,
  planningEventRequestSchema,
  planningMutationResponseSchema,
  planningWorkspaceResponseSchema,
  replanDecisionRequestSchema,
} from "../../app/contracts/planning-api";
import { PLANNING_SCHEMA_VERSION } from "../../app/contracts/planning";

const audit = {
  id: "audit-1",
  schemaVersion: PLANNING_SCHEMA_VERSION,
  blueprintId: "ai-native-full-stack-engineer",
  blueprintVersion: "2026.08.1",
  answers: [{ skillId: "typescript", level: "unseen" as const, evidenceRefs: [] }],
  evidence: [],
  createdBy: "user-1",
  inputFingerprint: "p2-audit",
};

const availability = {
  id: "availability-1",
  schemaVersion: PLANNING_SCHEMA_VERSION,
  timeZone: "Asia/Shanghai",
  weekdays: {
    monday: 60, tuesday: 0, wednesday: 0, thursday: 0,
    friday: 0, saturday: 0, sunday: 0,
  },
  exceptions: [],
  weeklyMinutes: 60,
  inputFingerprint: "p2-availability",
};

const target = {
  id: "target-1",
  schemaVersion: PLANNING_SCHEMA_VERSION,
  targetWeeks: 8,
  inputFingerprint: "p2-target",
};

const generateRequest = {
  mutationId: "mutation-generate-1",
  roleId: "ai-native-full-stack-engineer" as const,
  planningDate: "2026-08-12",
  audit,
  availability,
  target,
  selectedScope: "full-scope" as const,
};

describe("adaptive planning API contracts", () => {
  it.each(["full-scope", "target-date", null] as const)(
    "accepts the exact GeneratePlanningRequest with %s scope",
    (selectedScope) => {
      const request = { ...generateRequest, selectedScope };
      expect(generatePlanningRequestSchema.parse(request)).toEqual(request);
    },
  );

  it("locks GeneratePlanningRequest to the flagship role and rejects extras", () => {
    expect(() => generatePlanningRequestSchema.parse({ ...generateRequest, roleId: "custom-role" })).toThrow();
    expect(() => generatePlanningRequestSchema.parse({ ...generateRequest, ownerId: "must-come-from-session" })).toThrow();
  });

  it("strictly parses PlanningEventRequest with a discriminated input", () => {
    const request = {
      mutationId: "mutation-event-1",
      baseVersionId: "plan-1",
      event: { kind: "skipped" as const, unitId: "daily-unit-1", planningDate: "2026-08-12" },
    };
    expect(planningEventRequestSchema.parse(request)).toEqual(request);
    expect(() => planningEventRequestSchema.parse({ ...request, goalId: "must-come-from-session" })).toThrow();
    expect(() => planningEventRequestSchema.parse({
      ...request,
      event: { ...request.event, actualMinutes: 30 },
    })).toThrow();
  });

  it("strictly parses ReplanDecisionRequest", () => {
    const request = {
      mutationId: "mutation-decision-1",
      baseVersionId: "plan-1",
      candidatePlanVersionId: "plan-2",
    };
    expect(replanDecisionRequestSchema.parse(request)).toEqual(request);
    expect(() => replanDecisionRequestSchema.parse({ ...request, accept: true })).toThrow();
  });

  it("uses strict wrappers for workspace and mutation responses", () => {
    expect(planningWorkspaceResponseSchema.parse({ workspace: null })).toEqual({ workspace: null });
    expect(() => planningWorkspaceResponseSchema.parse({ workspace: null, debug: true })).toThrow();
    expect(() => planningMutationResponseSchema.parse({ result: null })).toThrow();
    expect(() => planningMutationResponseSchema.parse({ result: null, debug: true })).toThrow();
  });
});
