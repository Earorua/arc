import { describe, expect, it } from "vitest";
import {
  PLANNING_SCHEMA_VERSION,
  availabilityExceptionSchema,
  availabilityVersionSchema,
  dailyUnitSchema,
  deferredSkillSchema,
  learningPathPhaseSchema,
  learningPathVersionSchema,
  parsePlanningWorkspaceAtRepositoryBoundary,
  pathBuildResultSchema,
  pathUnitSchema,
  planDaySchema,
  planDiffItemSchema,
  planDiffSchema,
  planVersionSchema,
  planningEventInputSchema,
  planningEventSchema,
  planningMutationResultSchema,
  planningTargetSchema,
  planningWorkspaceSchema,
  skillAuditAnswerSchema,
  skillAuditVersionSchema,
  skillEvidenceSchema,
  skillUnitTrackSchema,
  unitCheckpointSchema,
  unitRegistrySchema,
  unitStepSchema,
  unitTemplateSchema,
  weekdayMinutesSchema,
} from "../../app/contracts/planning";

const repeat = (length: number, value = "x") => value.repeat(length);

function validAudit() {
  return {
    id: "audit-1",
    schemaVersion: PLANNING_SCHEMA_VERSION,
    blueprintId: "ai-native-full-stack-engineer",
    blueprintVersion: "2026.08.1",
    answers: [{ skillId: "typescript", level: "guided" as const, evidenceRefs: ["evidence-1"] }],
    evidence: [{
      id: "evidence-1",
      skillId: "typescript",
      kind: "repository" as const,
      url: "https://github.com/example/typescript-project",
      note: "A small typed application.",
    }],
    createdBy: "user-1",
    inputFingerprint: "p2-audit",
  };
}

function validAvailability() {
  return {
    id: "availability-1",
    schemaVersion: PLANNING_SCHEMA_VERSION,
    timeZone: "Asia/Shanghai",
    weekdays: {
      monday: 60,
      tuesday: 0,
      wednesday: 0,
      thursday: 0,
      friday: 0,
      saturday: 0,
      sunday: 0,
    },
    exceptions: [{ date: "2026-08-17", minutes: 30, reason: "Short session" }],
    weeklyMinutes: 60,
    inputFingerprint: "p2-availability",
  };
}

function validTarget() {
  return {
    id: "target-1",
    schemaVersion: PLANNING_SCHEMA_VERSION,
    targetWeeks: 8,
    inputFingerprint: "p2-target",
  };
}

function validTemplate() {
  return {
    id: "typescript-learn-01",
    version: "2026.08.1",
    skillId: "typescript",
    kind: "learn" as const,
    title: "Model a typed boundary",
    objective: "Model a complete UI-to-API boundary with strict types.",
    whyNow: "This creates the contract used by later application layers.",
    primaryResourceId: "typescript-official",
    alternativeResourceIds: ["typescript-guide"],
    steps: [
      { id: "read", label: "Read the official guide", minutes: 30 },
      { id: "build", label: "Build the strict boundary", minutes: 45 },
    ],
    checkpoints: [
      { id: "checkpoint-read", label: "Understand the boundary", stepIds: ["read"], estimatedMinutes: 30 },
      { id: "checkpoint-build", label: "Implement the boundary", stepIds: ["build"], estimatedMinutes: 45 },
    ],
    buildTask: "Implement a schema and infer its request and response types.",
    completionCriteria: ["The schema rejects unknown fields.", "The inferred types compile."],
    proofRequirement: "Save the focused test output and the reviewed implementation.",
    rubric: ["Needs revision", "Meets the contract", "Explains trade-offs"],
    estimatedMinutes: 75,
  };
}

function validRegistry() {
  return {
    id: "ai-native-full-stack-engineer-units",
    version: "2026.08.1",
    blueprintId: "ai-native-full-stack-engineer",
    blueprintVersion: "2026.08.1",
    tracks: [{ skillId: "typescript", templates: [validTemplate()] }],
  };
}

function validPath() {
  return {
    id: "path-1",
    schemaVersion: PLANNING_SCHEMA_VERSION,
    blueprintId: "ai-native-full-stack-engineer",
    blueprintVersion: "2026.08.1",
    registryId: "ai-native-full-stack-engineer-units",
    registryVersion: "2026.08.1",
    auditVersionId: "audit-1",
    availabilityVersionId: "availability-1",
    targetId: "target-1",
    scopeMode: "full-scope" as const,
    phases: [{
      phaseId: "foundations",
      name: "Foundations",
      outcome: "Build reliable typed application boundaries.",
      unitIds: ["path-unit-1"],
    }],
    units: [{
      id: "path-unit-1",
      templateId: "typescript-learn-01",
      templateVersion: "2026.08.1",
      checkpointId: null,
      skillId: "typescript",
      kind: "learn" as const,
      estimatedMinutes: 60,
      prerequisiteUnitIds: [],
    }],
    deferredSkills: [],
    estimatedStartDate: "2026-08-12",
    estimatedCompletionDate: "2026-08-17",
    inputFingerprint: "p2-path",
  };
}

function validDailyUnit() {
  return {
    id: "daily-unit-1",
    planVersionId: "plan-1",
    templateId: "typescript-learn-01",
    templateVersion: "2026.08.1",
    checkpointId: null,
    skillId: "typescript",
    kind: "learn" as const,
    scheduledDate: "2026-08-12",
    slot: "primary" as const,
    required: true,
    objective: "Model a complete UI-to-API boundary with strict types.",
    whyNow: "This creates the contract used by later application layers.",
    primaryResourceId: "typescript-official",
    alternativeResourceIds: ["typescript-guide"],
    steps: [{ id: "build", label: "Build the strict boundary", minutes: 60 }],
    buildTask: "Implement a schema and infer its request and response types.",
    completionCriteria: ["The schema rejects unknown fields."],
    proofRequirement: "Save the focused test output and the reviewed implementation.",
    rubric: ["Needs revision", "Meets the contract", "Explains trade-offs"],
    estimatedMinutes: 60,
  };
}

const planDates = [
  "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15",
  "2026-08-16", "2026-08-17", "2026-08-18",
];

function validPlan() {
  return {
    id: "plan-1",
    schemaVersion: PLANNING_SCHEMA_VERSION,
    generation: "initial" as const,
    baseVersionId: null,
    replanReason: null,
    planningDate: "2026-08-12",
    pathVersionId: "path-1",
    days: planDates.map((date, index) => ({
      date,
      budgetMinutes: index === 0 ? 60 : 0,
      status: index === 0 ? "scheduled" as const : "rest" as const,
      primaryUnitId: index === 0 ? "daily-unit-1" : null,
      stretchUnitId: null as string | null,
    })),
    dailyUnitIds: ["daily-unit-1"],
    estimatedCompletionDate: "2026-08-17",
    inputFingerprint: "p2-plan",
    summary: "One focused TypeScript unit starts this seven-day plan.",
  };
}

function validDiff() {
  return {
    id: "diff-1",
    basePlanVersionId: "plan-1",
    candidatePlanVersionId: "plan-2",
    items: [{
      unitId: "daily-unit-1",
      change: "moved" as const,
      fromDate: "2026-08-12",
      toDate: "2026-08-13",
      reason: "Availability changed.",
    }],
    previousEstimatedCompletionDate: "2026-08-17",
    nextEstimatedCompletionDate: "2026-08-18",
    summary: "One unit moves by one day.",
    inputFingerprint: "p2-diff",
  };
}

function validWorkspace() {
  return {
    id: "workspace-1",
    goalId: "goal-1",
    revision: 0,
    lastSequence: 0,
    audit: validAudit(),
    availability: validAvailability(),
    availabilityVersions: [validAvailability()],
    target: validTarget(),
    pathVersions: [validPath()],
    planVersions: [validPlan()],
    dailyUnits: [validDailyUnit()],
    events: [],
    activePathVersionId: "path-1",
    activePlanVersionId: "plan-1",
    pendingPlanVersionId: null,
  };
}

describe("adaptive planning contracts", () => {
  it("locks the planning schema version", () => {
    expect(PLANNING_SCHEMA_VERSION).toBe("2026.08.1");
    expect(() => planningTargetSchema.parse({ ...validTarget(), schemaVersion: "2026.08.2" })).toThrow();
  });

  it.each(["unseen", "conceptual", "guided", "independent"] as const)(
    "accepts the %s self-assessment level",
    (level) => {
      const audit = { ...validAudit(), answers: [{ ...validAudit().answers[0]!, level }] };
      expect(skillAuditVersionSchema.parse(audit).answers[0]?.level).toBe(level);
    },
  );

  it.each([
    ["skill evidence", skillEvidenceSchema, validAudit().evidence[0]],
    ["skill audit answer", skillAuditAnswerSchema, validAudit().answers[0]],
    ["skill audit version", skillAuditVersionSchema, validAudit()],
    ["weekday minutes", weekdayMinutesSchema, validAvailability().weekdays],
    ["availability exception", availabilityExceptionSchema, validAvailability().exceptions[0]],
    ["availability version", availabilityVersionSchema, validAvailability()],
    ["planning target", planningTargetSchema, validTarget()],
    ["unit step", unitStepSchema, validTemplate().steps[0]],
    ["unit checkpoint", unitCheckpointSchema, validTemplate().checkpoints[0]],
    ["unit template", unitTemplateSchema, validTemplate()],
    ["skill unit track", skillUnitTrackSchema, validRegistry().tracks[0]],
    ["unit registry", unitRegistrySchema, validRegistry()],
    ["path unit", pathUnitSchema, validPath().units[0]],
    ["learning path phase", learningPathPhaseSchema, validPath().phases[0]],
    ["deferred skill", deferredSkillSchema, { skillId: "retrieval", reason: "target-date-advantage" }],
    ["learning path version", learningPathVersionSchema, validPath()],
    ["path build result", pathBuildResultSchema, { fullScope: validPath(), targetDate: null, infeasibleReason: "Core work does not fit." }],
    ["daily unit", dailyUnitSchema, validDailyUnit()],
    ["plan day", planDaySchema, validPlan().days[0]],
    ["plan version", planVersionSchema, validPlan()],
    ["plan diff item", planDiffItemSchema, validDiff().items[0]],
    ["plan diff", planDiffSchema, validDiff()],
    ["planning workspace", planningWorkspaceSchema, validWorkspace()],
  ] as const)("rejects unknown fields on the strict %s object", (_name, schema, fixture) => {
    expect(() => schema.parse({ ...fixture, unexpected: true })).toThrow();
  });

  it.each([
    ["audit answers", () => ({ ...validAudit(), answers: Array.from({ length: 65 }, (_, index) => ({ skillId: `skill-${index}`, level: "unseen", evidenceRefs: [] })) }), skillAuditVersionSchema],
    ["audit evidence", () => ({ ...validAudit(), answers: [], evidence: Array.from({ length: 193 }, (_, index) => ({ ...validAudit().evidence[0], id: `evidence-${index}`, skillId: `skill-${index}` })) }), skillAuditVersionSchema],
    ["evidence references", () => ({ skillId: "typescript", level: "guided", evidenceRefs: ["a", "b", "c", "d"] }), skillAuditAnswerSchema],
    ["availability exceptions", () => ({ ...validAvailability(), exceptions: Array.from({ length: 91 }, (_, index) => ({ date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, "0")}-${String(index % 28 + 1).padStart(2, "0")}`, minutes: 30, reason: null })) }), availabilityVersionSchema],
    ["registry tracks", () => ({ ...validRegistry(), tracks: Array.from({ length: 65 }, (_, index) => ({ skillId: `skill-${index}`, templates: [{ ...validTemplate(), id: `template-${index}`, skillId: `skill-${index}` }] })) }), unitRegistrySchema],
    ["templates per track", () => ({ skillId: "typescript", templates: Array.from({ length: 9 }, (_, index) => ({ ...validTemplate(), id: `template-${index}` })) }), skillUnitTrackSchema],
    ["unit steps", () => ({ ...validTemplate(), steps: Array.from({ length: 13 }, (_, index) => ({ id: `step-${index}`, label: "Do focused work", minutes: 5 })), checkpoints: [{ id: "checkpoint-0", label: "Checkpoint", stepIds: ["step-0"], estimatedMinutes: 5 }] }), unitTemplateSchema],
    ["unit checkpoints", () => ({ ...validTemplate(), steps: Array.from({ length: 9 }, (_, index) => ({ id: `step-${index}`, label: "Do focused work", minutes: 10 })), checkpoints: Array.from({ length: 9 }, (_, index) => ({ id: `checkpoint-${index}`, label: "Checkpoint", stepIds: [`step-${index}`], estimatedMinutes: 10 })), estimatedMinutes: 90 }), unitTemplateSchema],
    ["completion criteria", () => ({ ...validTemplate(), completionCriteria: Array.from({ length: 9 }, (_, index) => `Criterion ${index}`) }), unitTemplateSchema],
    ["rubric rows", () => ({ ...validTemplate(), rubric: Array.from({ length: 7 }, (_, index) => `Rubric row ${index}`) }), unitTemplateSchema],
    ["path units", () => ({ ...validPath(), phases: [{ ...validPath().phases[0], unitIds: Array.from({ length: 2000 }, (_, index) => `unit-${index}`) }, { ...validPath().phases[0], phaseId: "phase-2", unitIds: ["unit-2000"] }], units: Array.from({ length: 2001 }, (_, index) => ({ ...validPath().units[0], id: `unit-${index}` })) }), learningPathVersionSchema],
    ["workspace daily units", () => ({ ...validWorkspace(), dailyUnits: Array.from({ length: 2001 }, (_, index) => ({ ...validDailyUnit(), id: `daily-${index}` })), planVersions: [{ ...validPlan(), dailyUnitIds: ["daily-0"], days: validPlan().days.map((day, index) => index === 0 ? { ...day, primaryUnitId: "daily-0" } : day) }] }), planningWorkspaceSchema],
    ["workspace plan versions", () => {
      const dailyUnits = Array.from({ length: 501 }, (_, index) => ({ ...validDailyUnit(), id: `daily-${index}`, planVersionId: `plan-${index}` }));
      const planVersions = Array.from({ length: 501 }, (_, index) => ({
        ...validPlan(),
        id: `plan-${index}`,
        dailyUnitIds: [`daily-${index}`],
        days: validPlan().days.map((day, dayIndex) => dayIndex === 0 ? { ...day, primaryUnitId: `daily-${index}` } : day),
      }));
      return { ...validWorkspace(), activePlanVersionId: "plan-0", planVersions, dailyUnits };
    }, planningWorkspaceSchema],
    ["workspace events", () => ({ ...validWorkspace(), lastSequence: 5001, events: Array.from({ length: 5001 }, (_, index) => ({ ...validCompletedEvent(), eventId: `event-${index}`, mutationId: `mutation-${index}`, sequence: index + 1 })) }), planningWorkspaceSchema],
  ] as const)("rejects %s above its cap", (_name, fixture, schema) => {
    expect(() => schema.parse(fixture())).toThrow();
  });

  it.each([
    ["evidence note", () => ({ ...validAudit().evidence[0], note: repeat(301) }), skillEvidenceSchema],
    ["title", () => ({ ...validTemplate(), title: repeat(181) }), unitTemplateSchema],
    ["objective", () => ({ ...validTemplate(), objective: repeat(501) }), unitTemplateSchema],
    ["why now", () => ({ ...validTemplate(), whyNow: repeat(501) }), unitTemplateSchema],
    ["build task", () => ({ ...validTemplate(), buildTask: repeat(801) }), unitTemplateSchema],
    ["proof requirement", () => ({ ...validTemplate(), proofRequirement: repeat(801) }), unitTemplateSchema],
    ["plan summary", () => ({ ...validPlan(), summary: repeat(1001) }), planVersionSchema],
  ] as const)("rejects an overlong %s", (_name, fixture, schema) => {
    expect(() => schema.parse(fixture())).toThrow();
  });

  it("rejects overlong planning identifiers and shared planning strings", () => {
    expect(() => planningTargetSchema.parse({ ...validTarget(), id: repeat(257) })).toThrow();
    expect(() => availabilityVersionSchema.parse({ ...validAvailability(), timeZone: repeat(257) })).toThrow();
    expect(() => unitTemplateSchema.parse({ ...validTemplate(), version: `2026.08.${repeat(257, "1")}` })).toThrow();
    expect(() => planVersionSchema.parse({ ...validPlan(), baseVersionId: repeat(257) })).toThrow();
    expect(() => planDiffSchema.parse({ ...validDiff(), candidatePlanVersionId: repeat(257) })).toThrow();
    expect(() => planningEventSchema.parse({ ...validCompletedEvent(), eventId: repeat(257) })).toThrow();
    expect(() => planningEventSchema.parse({ ...validCompletedEvent(), mutationId: repeat(257) })).toThrow();
    expect(() => planningEventSchema.parse({ ...validCompletedEvent(), occurredAt: `2026-08-12T08:00:00.${repeat(257, "1")}Z` })).toThrow();
  });

  it("requires exactly the seven weekday keys", () => {
    const missingSunday = Object.fromEntries(
      Object.entries(validAvailability().weekdays).filter(([day]) => day !== "sunday"),
    );
    expect(() => weekdayMinutesSchema.parse(missingSunday)).toThrow();
    expect(() => weekdayMinutesSchema.parse({ ...validAvailability().weekdays, holiday: 30 })).toThrow();
  });

  it.each([1, 14, 721, 30.5])("rejects the invalid daily minute value %s", (minutes) => {
    expect(() => weekdayMinutesSchema.parse({ ...validAvailability().weekdays, monday: minutes })).toThrow();
    expect(() => availabilityExceptionSchema.parse({ date: "2026-08-19", minutes, reason: null })).toThrow();
  });

  it("derives and bounds the weekly total from the seven-day template", () => {
    expect(() => availabilityVersionSchema.parse({ ...validAvailability(), weeklyMinutes: 999 })).toThrow();
    expect(() => availabilityVersionSchema.parse({
      ...validAvailability(),
      weekdays: { monday: 15, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 0 },
      weeklyMinutes: 15,
    })).toThrow();
    expect(() => availabilityVersionSchema.parse({
      ...validAvailability(),
      weekdays: { monday: 720, tuesday: 720, wednesday: 720, thursday: 720, friday: 0, saturday: 0, sunday: 0 },
      weeklyMinutes: 2880,
    })).toThrow();
  });

  it.each(["Asia/Shanghai", "America/New_York", "Europe/London"])(
    "accepts the runtime-supported IANA zone %s",
    (timeZone) => expect(availabilityVersionSchema.parse({ ...validAvailability(), timeZone }).timeZone).toBe(timeZone),
  );

  it.each(["UTC", "Etc/GMT+1", "US/Eastern"])("accepts named IANA zone %s", (timeZone) => {
    expect(availabilityVersionSchema.parse({ ...validAvailability(), timeZone }).timeZone).toBe(timeZone);
  });

  it.each(["+01:00", "-0230"])("rejects numeric offset zone %s", (timeZone) => {
    expect(() => availabilityVersionSchema.parse({ ...validAvailability(), timeZone })).toThrow();
  });

  it.each(["Mars/Olympus", "Not_A_Zone", ""])("rejects the unsupported time zone %s", (timeZone) => {
    expect(() => availabilityVersionSchema.parse({ ...validAvailability(), timeZone })).toThrow();
  });

  it.each(["0000-01-01", "2026-02-30", "2025-02-29", "2026-13-01", "2026-8-12"])(
    "rejects the impossible or non-ISO calendar date %s",
    (date) => {
      expect(() => availabilityExceptionSchema.parse({ date, minutes: 30, reason: null })).toThrow();
      expect(() => planDaySchema.parse({ ...validPlan().days[0], date })).toThrow();
      expect(() => planningEventInputSchema.parse({ kind: "skipped", unitId: "daily-unit-1", planningDate: date })).toThrow();
    },
  );

  it.each([
    "http://github.com/example/project",
    "https://user:password@example.com/project",
    "https://localhost/project",
    "https://service.local/project",
    "https://127.0.0.1/project",
    "https://[::1]/project",
    "https://intranet/project",
    "https://metadata.google.internal/project",
    "https://example.test/project",
    "https://service.example/project",
    "https://router.home.arpa/project",
  ])("rejects the non-public evidence URL %s", (url) => {
    expect(() => skillEvidenceSchema.parse({ ...validAudit().evidence[0], url })).toThrow();
  });

  it("rejects duplicate audit, evidence, evidence-reference, and exception identities", () => {
    expect(() => skillAuditVersionSchema.parse({
      ...validAudit(),
      answers: [validAudit().answers[0], validAudit().answers[0]],
    })).toThrow();
    expect(() => skillAuditVersionSchema.parse({
      ...validAudit(),
      evidence: [validAudit().evidence[0], validAudit().evidence[0]],
    })).toThrow();
    expect(() => skillAuditVersionSchema.parse({
      ...validAudit(),
      answers: [{ ...validAudit().answers[0], evidenceRefs: ["evidence-1", "evidence-1"] }],
    })).toThrow();
    expect(() => availabilityVersionSchema.parse({
      ...validAvailability(),
      exceptions: [validAvailability().exceptions[0], validAvailability().exceptions[0]],
    })).toThrow();
  });

  it("requires audit evidence references to resolve to evidence for the same skill", () => {
    expect(() => skillAuditVersionSchema.parse({
      ...validAudit(),
      answers: [{ ...validAudit().answers[0], evidenceRefs: ["missing-evidence"] }],
    })).toThrow();
    expect(() => skillAuditVersionSchema.parse({
      ...validAudit(),
      evidence: [{ ...validAudit().evidence[0], skillId: "react" }],
    })).toThrow();
  });

  it("rejects duplicate registry and path identities or unresolved path references", () => {
    expect(() => unitRegistrySchema.parse({
      ...validRegistry(),
      tracks: [validRegistry().tracks[0], validRegistry().tracks[0]],
    })).toThrow();
    expect(() => unitTemplateSchema.parse({
      ...validTemplate(),
      steps: [validTemplate().steps[0], validTemplate().steps[0]],
    })).toThrow();
    expect(() => learningPathVersionSchema.parse({
      ...validPath(),
      phases: [{ ...validPath().phases[0], unitIds: ["missing-unit"] }],
    })).toThrow();
    expect(() => learningPathVersionSchema.parse({
      ...validPath(),
      units: [{ ...validPath().units[0], prerequisiteUnitIds: ["missing-unit"] }],
    })).toThrow();
  });

  it("rejects a template that lists its primary resource as an alternative", () => {
    expect(() => unitTemplateSchema.parse({ ...validTemplate(), alternativeResourceIds: ["typescript-official"] })).toThrow();
  });

  it("rejects a daily unit that lists its primary resource as an alternative", () => {
    expect(() => dailyUnitSchema.parse({ ...validDailyUnit(), alternativeResourceIds: ["typescript-official"] })).toThrow();
  });

  it("correlates the target-date path and infeasibility reason", () => {
    expect(pathBuildResultSchema.parse({
      fullScope: validPath(),
      targetDate: null,
      infeasibleReason: "Core work does not fit the target window.",
    }).targetDate).toBeNull();
    expect(() => pathBuildResultSchema.parse({
      fullScope: validPath(),
      targetDate: null,
      infeasibleReason: null,
    })).toThrow();
    expect(() => pathBuildResultSchema.parse({
      fullScope: validPath(),
      targetDate: { ...validPath(), id: "path-2", scopeMode: "target-date" },
      infeasibleReason: "Contradictory reason",
    })).toThrow();
  });

  it("requires exactly seven unique plan dates", () => {
    expect(() => planVersionSchema.parse({ ...validPlan(), days: validPlan().days.slice(0, 6) })).toThrow();
    expect(() => planVersionSchema.parse({
      ...validPlan(),
      days: [...validPlan().days.slice(0, 6), { ...validPlan().days[0] }],
    })).toThrow();
  });

  it("rejects duplicate primary or stretch references across plan dates", () => {
    const duplicatePrimary = validPlan();
    duplicatePrimary.days[1] = {
      ...duplicatePrimary.days[1]!,
      budgetMinutes: 60,
      status: "scheduled",
      primaryUnitId: "daily-unit-1",
    };
    expect(() => planVersionSchema.parse(duplicatePrimary)).toThrow();

    const sameSlotReference = validPlan();
    sameSlotReference.days[0] = {
      ...sameSlotReference.days[0]!,
      stretchUnitId: "daily-unit-1",
    };
    expect(() => planVersionSchema.parse(sameSlotReference)).toThrow();
  });

  it("requires plan-day unit references to resolve exactly once", () => {
    expect(() => planVersionSchema.parse({ ...validPlan(), dailyUnitIds: [] })).toThrow();
    expect(() => planVersionSchema.parse({ ...validPlan(), dailyUnitIds: ["daily-unit-1", "daily-unit-1"] })).toThrow();
  });

  it("reports an unlisted late-day reference at its standalone plan-day path", () => {
    const plan = validPlan();
    const result = planVersionSchema.safeParse({
      ...plan,
      days: plan.days.map((day, index) => index === 6 ? { ...day, budgetMinutes: 60, status: "scheduled" as const, primaryUnitId: "unlisted-unit" } : day),
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.join(".") === "days.6.primaryUnitId")).toBe(true);
  });

  it.each([
    { kind: "completed", unitId: "daily-unit-1", actualMinutes: 48, planningDate: "2026-08-12" },
    { kind: "completed", unitId: "daily-unit-1", actualMinutes: null, planningDate: "2026-08-12" },
    { kind: "delayed", unitId: "daily-unit-1", planningDate: "2026-08-12" },
    { kind: "skipped", unitId: "daily-unit-1", planningDate: "2026-08-12" },
    { kind: "too_hard", unitId: "daily-unit-1", planningDate: "2026-08-12" },
    { kind: "already_known", unitId: "daily-unit-1", planningDate: "2026-08-12" },
    { kind: "availability_changed", availability: validAvailability(), planningDate: "2026-08-12" },
  ] as const)("accepts the discriminated $kind event input", (event) => {
    expect(planningEventInputSchema.parse(event)).toEqual(event);
  });

  it("rejects fields from a different event variant", () => {
    expect(() => planningEventInputSchema.parse({
      kind: "delayed",
      unitId: "daily-unit-1",
      actualMinutes: 20,
      planningDate: "2026-08-12",
    })).toThrow();
    expect(() => planningEventInputSchema.parse({
      kind: "availability_changed",
      availability: validAvailability(),
      unitId: "daily-unit-1",
      planningDate: "2026-08-12",
    })).toThrow();
  });

  it("requires availability-change events to retain an exact availability snapshot", () => {
    const event = validAvailabilityChangedEvent();
    const validWorkspaceWithEvent = { ...validWorkspace(), lastSequence: 1, events: [event] };
    expect(planningWorkspaceSchema.parse(validWorkspaceWithEvent)).toEqual(validWorkspaceWithEvent);
    expect(() => planningWorkspaceSchema.parse({
      ...validWorkspaceWithEvent,
      events: [{ ...event, availability: { ...event.availability, id: "availability-missing" } }],
    })).toThrow();
    expect(() => planningWorkspaceSchema.parse({
      ...validWorkspaceWithEvent,
      events: [{ ...event, availability: { ...event.availability, inputFingerprint: "different-event-snapshot" } }],
    })).toThrow();
  });

  it.each(["replan_accepted", "replan_discarded"] as const)(
    "accepts the repository-assigned %s decision event",
    (kind) => {
      const event = validDecisionEvent(kind);
      expect(planningEventSchema.parse(event)).toEqual(event);
    },
  );

  it("caps an otherwise valid availability event at 32 KiB serialized UTF-8", () => {
    const availability = validLargeAvailability();
    expect(availabilityVersionSchema.parse(availability)).toEqual(availability);
    const event = {
      eventId: "event-large-availability",
      mutationId: "mutation-large-availability",
      sequence: 1,
      targetPlanVersionId: "plan-1",
      occurredAt: "2026-08-12T08:00:00.000Z",
      kind: "availability_changed" as const,
      availability,
      planningDate: "2026-08-12",
    };
    expect(new TextEncoder().encode(JSON.stringify(event)).byteLength).toBeGreaterThan(32 * 1024);
    expect(() => planningEventSchema.parse(event)).toThrow();
  });

  it("resolves every workspace path, plan, unit, and event pointer", () => {
    expect(planningWorkspaceSchema.parse(validWorkspace())).toEqual(validWorkspace());
    expect(() => planningWorkspaceSchema.parse({ ...validWorkspace(), activePathVersionId: "missing-path" })).toThrow();
    expect(() => planningWorkspaceSchema.parse({ ...validWorkspace(), activePlanVersionId: "missing-plan" })).toThrow();
    expect(() => planningWorkspaceSchema.parse({ ...validWorkspace(), pendingPlanVersionId: "missing-plan" })).toThrow();
    expect(() => planningWorkspaceSchema.parse({
      ...validWorkspace(),
      planVersions: [{ ...validPlan(), pathVersionId: "missing-path" }],
    })).toThrow();
    expect(() => planningWorkspaceSchema.parse({
      ...validWorkspace(),
      dailyUnits: [],
    })).toThrow();
    expect(() => planningWorkspaceSchema.parse({
      ...validWorkspace(),
      lastSequence: 1,
      events: [{ ...validCompletedEvent(), targetPlanVersionId: "missing-plan" }],
    })).toThrow();
  });

  it("preserves a stable daily unit ID across immutable plan snapshots", () => {
    const historical = validHistoricalWorkspace();
    expect(planningWorkspaceSchema.parse(historical)).toEqual(historical);
    expect(() => planningWorkspaceSchema.parse({
      ...historical,
      dailyUnits: [...historical.dailyUnits, { ...historical.dailyUnits[0] }],
    })).toThrow();
    expect(() => planningWorkspaceSchema.parse({
      ...historical,
      dailyUnits: [{ ...historical.dailyUnits[0], planVersionId: "plan-2" }, { ...historical.dailyUnits[1], id: "candidate-unit" }],
    })).toThrow();
  });

  it("retains historical availability snapshots for active and candidate paths", () => {
    const historical = validAvailabilityHistoryWorkspace();
    expect(planningWorkspaceSchema.parse(historical)).toEqual(historical);
    expect(() => planningWorkspaceSchema.parse({
      ...historical,
      availabilityVersions: [historical.availability],
    })).toThrow();
    expect(() => planningWorkspaceSchema.parse({
      ...historical,
      availabilityVersions: [{ ...historical.availability, inputFingerprint: "different-snapshot" }, historical.availabilityVersions[0]],
    })).toThrow();
  });

  it("requires an ordered, gap-free event sequence and matching terminal sequence", () => {
    expect(planningWorkspaceSchema.parse(workspaceWithEventSequences([1, 2], 2)).events).toHaveLength(2);
    expect(() => planningWorkspaceSchema.parse(workspaceWithEventSequences([2, 1], 2))).toThrow();
    expect(() => planningWorkspaceSchema.parse(workspaceWithEventSequences([1, 3], 3))).toThrow();
    expect(() => planningWorkspaceSchema.parse(workspaceWithEventSequences([2], 2))).toThrow();
    expect(() => planningWorkspaceSchema.parse(workspaceWithEventSequences([1, 2], 1))).toThrow();
  });

  it("reports a late-day primary placement at its original day index", () => {
    const plan = validPlan();
    const result = planningWorkspaceSchema.safeParse({
      ...validWorkspace(),
      dailyUnits: [validDailyUnit(), { ...validDailyUnit(), id: "late-unit", scheduledDate: "2026-08-12" }],
      planVersions: [{
        ...plan,
        dailyUnitIds: ["daily-unit-1", "late-unit"],
        days: plan.days.map((day, index) => index === 6 ? { ...day, budgetMinutes: 60, status: "scheduled" as const, primaryUnitId: "late-unit" } : day),
      }],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.join(".") === "planVersions.0.days.6.primaryUnitId")).toBe(true);
  });

  it("rejects a workspace path whose audit reference differs from the workspace audit", () => {
    expect(() => planningWorkspaceSchema.parse({
      ...validWorkspace(),
      pathVersions: [{ ...validPath(), auditVersionId: "other-audit" }],
    })).toThrow();
  });

  it("rejects a workspace path whose availability reference differs from the workspace availability", () => {
    expect(() => planningWorkspaceSchema.parse({
      ...validWorkspace(),
      pathVersions: [{ ...validPath(), availabilityVersionId: "other-availability" }],
    })).toThrow();
  });

  it("rejects a workspace path whose target reference differs from the workspace target", () => {
    expect(() => planningWorkspaceSchema.parse({
      ...validWorkspace(),
      pathVersions: [{ ...validPath(), targetId: "other-target" }],
    })).toThrow();
  });

  it("rejects a plan version whose base version does not resolve in its workspace", () => {
    expect(() => planningWorkspaceSchema.parse({
      ...validWorkspace(),
      planVersions: [{ ...validPlan(), baseVersionId: "other-plan" }],
    })).toThrow();
  });

  it("rejects an event unit that is outside its target plan", () => {
    expect(() => planningWorkspaceSchema.parse({
      ...validWorkspace(),
      dailyUnits: [{ ...validDailyUnit(), id: "daily-unit-1" }, { ...validDailyUnit(), id: "daily-unit-2" }],
      lastSequence: 1,
      events: [{ ...validCompletedEvent(), unitId: "daily-unit-2" }],
    })).toThrow();
  });

  it.each(["active", "proposed", "accepted", "discarded"] as const)(
    "accepts the %s planning mutation outcome",
    (outcome) => {
      expect(planningMutationResultSchema.parse({
        outcome,
        workspace: validWorkspace(),
        diff: null,
      }).outcome).toBe(outcome);
    },
  );

  it("rejects a replayed planning mutation outcome", () => {
    expect(() => planningMutationResultSchema.parse({
      outcome: "replayed",
      workspace: validWorkspace(),
      diff: null,
    })).toThrow();
  });

  it("enforces the 4 MiB repository boundary for an otherwise valid workspace", () => {
    const workspace = validLargeWorkspace();
    expect(planningWorkspaceSchema.safeParse(workspace).success).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(workspace)).byteLength).toBeGreaterThan(4 * 1024 * 1024);
    expect(() => parsePlanningWorkspaceAtRepositoryBoundary(workspace)).toThrow();
  });
});

function validCompletedEvent() {
  return {
    eventId: "event-1",
    mutationId: "mutation-1",
    sequence: 1,
    targetPlanVersionId: "plan-1",
    occurredAt: "2026-08-12T08:00:00.000Z",
    kind: "completed" as const,
    unitId: "daily-unit-1",
    actualMinutes: 48,
    planningDate: "2026-08-12",
  };
}

function validAvailabilityChangedEvent() {
  return {
    eventId: "event-availability-1",
    mutationId: "mutation-availability-1",
    sequence: 1,
    targetPlanVersionId: "plan-1",
    occurredAt: "2026-08-12T08:00:00.000Z",
    kind: "availability_changed" as const,
    availability: validAvailability(),
    planningDate: "2026-08-12",
  };
}

function validDecisionEvent(kind: "replan_accepted" | "replan_discarded") {
  return {
    eventId: "event-2",
    mutationId: "mutation-2",
    sequence: 2,
    targetPlanVersionId: "plan-1",
    occurredAt: "2026-08-12T09:00:00.000Z",
    kind,
    candidatePlanVersionId: "plan-2",
  };
}

function validLargeAvailability() {
  return {
    ...validAvailability(),
    exceptions: Array.from({ length: 90 }, (_, index) => ({
      date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, "0")}-${String(index % 28 + 1).padStart(2, "0")}`,
      minutes: 30,
      reason: repeat(300, "测"),
    })),
  };
}

function maxPlanningId(prefix: string, index?: number) {
  const stem = index === undefined ? prefix : `${prefix}-${index}`;
  return `${stem}-${"a".repeat(256 - stem.length - 1)}`;
}

function validLargeWorkspace() {
  const unitId = maxPlanningId("daily-unit");
  const planId = maxPlanningId("plan");
  const events = Array.from({ length: 5000 }, (_, index) => ({
    eventId: maxPlanningId("event", index),
    mutationId: maxPlanningId("mutation", index),
    sequence: index + 1,
    targetPlanVersionId: planId,
    occurredAt: "2026-08-12T08:00:00.000Z",
    kind: "completed" as const,
    unitId,
    actualMinutes: 48,
    planningDate: "2026-08-12",
  }));
  const plan = validPlan();
  return {
    ...validWorkspace(),
    lastSequence: events.length,
    dailyUnits: [{ ...validDailyUnit(), id: unitId, planVersionId: planId }],
    planVersions: [{
      ...plan,
      id: planId,
      dailyUnitIds: [unitId],
      days: plan.days.map((day, index) => index === 0 ? { ...day, primaryUnitId: unitId } : day),
    }],
    events,
    activePlanVersionId: planId,
  };
}

function validHistoricalWorkspace() {
  const basePlan = validPlan();
  const candidatePlan = {
    ...validPlan(),
    id: "plan-2",
    generation: "proposed" as const,
    baseVersionId: "plan-1",
    days: validPlan().days.map((day, index) => {
      if (index === 0) return { ...day, budgetMinutes: 0, status: "rest" as const, primaryUnitId: null };
      if (index === 1) return { ...day, budgetMinutes: 60, status: "scheduled" as const, primaryUnitId: "daily-unit-1" };
      return day;
    }),
  };
  return {
    ...validWorkspace(),
    planVersions: [basePlan, candidatePlan],
    dailyUnits: [
      validDailyUnit(),
      { ...validDailyUnit(), planVersionId: "plan-2", scheduledDate: "2026-08-13" },
    ],
    pendingPlanVersionId: "plan-2",
  };
}

function validAvailabilityHistoryWorkspace() {
  const oldAvailability = validAvailability();
  const currentAvailability = { ...validAvailability(), id: "availability-2", inputFingerprint: "p2-availability-current" };
  const historical = validHistoricalWorkspace();
  const candidatePath = {
    ...validPath(),
    id: "path-2",
    availabilityVersionId: currentAvailability.id,
  };
  return {
    ...historical,
    availability: currentAvailability,
    availabilityVersions: [oldAvailability, currentAvailability],
    pathVersions: [validPath(), candidatePath],
    planVersions: historical.planVersions.map((plan) => plan.id === "plan-2" ? { ...plan, pathVersionId: "path-2" } : plan),
  };
}

function workspaceWithEventSequences(sequences: number[], lastSequence: number) {
  return {
    ...validWorkspace(),
    lastSequence,
    events: sequences.map((sequence) => ({
      ...validCompletedEvent(),
      eventId: `event-${sequence}`,
      mutationId: `mutation-${sequence}`,
      sequence,
    })),
  };
}
