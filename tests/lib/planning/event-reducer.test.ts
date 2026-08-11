import { describe, expect, it } from "vitest";
import { roleBlueprintSchema, type RoleBlueprint } from "../../../app/contracts/intelligence";
import {
  PLANNING_SCHEMA_VERSION,
  planningWorkspaceSchema,
  unitRegistrySchema,
  type AvailabilityVersion,
  type PlanningEvent,
  type PlanningWorkspace,
  type UnitRegistry,
  type UnitTemplate,
} from "../../../app/contracts/planning";
import { buildLearningPaths } from "../../../app/lib/planning/path-builder";
import { buildPlanVersion } from "../../../app/lib/planning/scheduler";
import {
  applyPlanningEvent,
  replayPlanningEvents,
  type PlanningTransition,
} from "../../../app/lib/planning/event-reducer";

const PLANNING_DATE = "2026-08-12";

function resource(skillId: string) {
  return {
    id: `${skillId}-resource`, title: `${skillId} official reference`,
    url: `https://example.com/${skillId}`, provider: "Example Docs", language: "en" as const,
    cost: "free" as const, format: "documentation" as const, sourceTier: "primary" as const,
    purpose: "primary" as const, estimatedMinutes: 30, lastVerifiedAt: "2026-08-01",
    skillIds: [skillId],
  };
}

const blueprint: RoleBlueprint = roleBlueprintSchema.parse({
  id: "test-role", name: "Test Role",
  summary: "A deterministic role used to verify adaptive event transitions.",
  version: "2026.08.1", status: "ready", updatedAt: "2026-08-01", languagePolicy: "english-first",
  skills: [
    { id: "alpha", name: "Alpha Skill", category: "foundations", importance: "core", why: "Alpha establishes the required learning foundation.", confidence: 1, masteryCriteria: ["Explain the complete alpha system boundary.", "Build and verify the complete alpha artifact."], prerequisiteIds: [], resourceIds: ["alpha-resource"] },
    { id: "beta", name: "Beta Skill", category: "backend", importance: "strong", why: "Beta applies alpha in a dependent system outcome.", confidence: 1, masteryCriteria: ["Explain how beta depends on the alpha boundary.", "Build and verify the complete beta artifact."], prerequisiteIds: ["alpha"], resourceIds: ["beta-resource"] },
  ],
  resources: [resource("alpha"), resource("beta")],
  phases: [{ id: "foundation", name: "Foundation", weeks: 4, outcome: "Deliver alpha before the dependent beta outcome.", skillIds: ["alpha", "beta"] }],
});

function template(skillId: string, kind: UnitTemplate["kind"], minutes: number): UnitTemplate {
  const id = `${skillId}-${kind}-01`;
  return {
    id, version: "2026.08.1", skillId, kind, title: `${kind} ${skillId}`,
    objective: `Produce a reviewable ${kind} outcome for ${skillId}.`,
    whyNow: `This ${kind} unit is the next useful step for ${skillId}.`,
    primaryResourceId: `${skillId}-resource`, alternativeResourceIds: [],
    steps: [{ id: `${id}-step`, label: `Complete ${kind} work for ${skillId}`, minutes }],
    checkpoints: [], buildTask: `Build the ${kind} artifact for ${skillId}.`,
    completionCriteria: [`The ${kind} artifact for ${skillId} is reviewable.`],
    proofRequirement: `Provide proof for the ${kind} artifact for ${skillId}.`,
    rubric: [`Level 2: The ${kind} artifact for ${skillId} meets its outcome.`], estimatedMinutes: minutes,
  };
}

const registry: UnitRegistry = unitRegistrySchema.parse({
  id: "test-units", version: "2026.08.1", blueprintId: blueprint.id, blueprintVersion: blueprint.version,
  tracks: ["alpha", "beta"].map((skillId) => ({
    skillId,
    templates: [template(skillId, "learn", 60), template(skillId, "calibrate", 30), template(skillId, "reinforce", 30)],
  })),
});

function availability(id = "availability-01", firstDayMinutes = 60): AvailabilityVersion {
  return {
    id, schemaVersion: PLANNING_SCHEMA_VERSION, timeZone: "Asia/Shanghai",
    weekdays: { monday: 60, tuesday: 60, wednesday: 60, thursday: 60, friday: 60, saturday: 60, sunday: 60 },
    exceptions: firstDayMinutes === 60 ? [] : [{ date: PLANNING_DATE, minutes: firstDayMinutes, reason: "Changed schedule" }],
    weeklyMinutes: 420, inputFingerprint: `${id}-fingerprint`,
  };
}

function workspace(inputRegistry: UnitRegistry = registry): PlanningWorkspace {
  const audit = {
    id: "audit-01", schemaVersion: PLANNING_SCHEMA_VERSION, blueprintId: blueprint.id,
    blueprintVersion: blueprint.version,
    answers: blueprint.skills.map(({ id }) => ({ skillId: id, level: "guided" as const, evidenceRefs: [] })),
    evidence: [], createdBy: "test-user", inputFingerprint: "audit-fingerprint",
  };
  const target = { id: "target-01", schemaVersion: PLANNING_SCHEMA_VERSION, targetWeeks: 8, inputFingerprint: "target-fingerprint" };
  const currentAvailability = availability();
  const paths = buildLearningPaths({ blueprint, registry: inputRegistry, audit, availability: currentAvailability, target, planningDate: PLANNING_DATE });
  const built = buildPlanVersion({ path: paths.fullScope, registry: inputRegistry, availability: currentAvailability, planningDate: PLANNING_DATE, generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() });
  return planningWorkspaceSchema.parse({
    id: "workspace-01", goalId: "goal-01", revision: 0, lastSequence: 0,
    audit, availability: currentAvailability, availabilityVersions: [currentAvailability], target,
    pathVersions: [paths.fullScope], planVersions: [built.plan], dailyUnits: built.dailyUnits, events: [],
    activePathVersionId: paths.fullScope.id, activePlanVersionId: built.plan.id, pendingPlanVersionId: null,
  });
}

function activeUnit(state: PlanningWorkspace, skillId: string) {
  return state.dailyUnits.find((unit) => unit.planVersionId === state.activePlanVersionId && unit.skillId === skillId && unit.required)!;
}

function event(
  state: PlanningWorkspace,
  body: Record<string, unknown>,
  metadata: Partial<PlanningEvent> = {},
): PlanningEvent {
  return {
    eventId: `event-${state.lastSequence + 1}`, mutationId: `mutation-${state.lastSequence + 1}`,
    sequence: state.lastSequence + 1, targetPlanVersionId: state.activePlanVersionId,
    occurredAt: "2026-08-12T08:00:00.000Z", ...body, ...metadata,
  } as PlanningEvent;
}

function propose(
  state: PlanningWorkspace,
  kind: "delayed" | "skipped" | "too_hard" | "already_known",
): Extract<PlanningTransition, { kind: "proposed" }> {
  const alpha = activeUnit(state, "alpha");
  const result = applyPlanningEvent({ workspace: state, blueprint, registry, event: event(state, { kind, unitId: alpha.id, planningDate: PLANNING_DATE }) });
  if (result.kind !== "proposed") throw new Error("Expected proposed transition");
  return result;
}

describe("applyPlanningEvent", () => {
  it("completes atomically, preserves historical placement, and rolls seven dates", () => {
    const initial = workspace();
    const alpha = activeUnit(initial, "alpha");
    const transition = applyPlanningEvent({
      workspace: initial, blueprint, registry,
      event: event(initial, { kind: "completed", unitId: alpha.id, actualMinutes: 55, planningDate: "2026-08-13" }),
    });

    expect(transition.kind).toBe("automatic");
    expect(transition.workspace.activePlanVersionId).not.toBe(initial.activePlanVersionId);
    expect(transition.workspace.events.at(-1)).toMatchObject({ kind: "completed", unitId: alpha.id, actualMinutes: 55 });
    expect(transition.workspace.planVersions.find(({ id }) => id === initial.activePlanVersionId)?.days[0]?.primaryUnitId).toBe(alpha.id);
    expect(transition.workspace.planVersions.find(({ id }) => id === transition.workspace.activePlanVersionId)?.days.map(({ date }) => date))
      .toEqual(["2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17", "2026-08-18", "2026-08-19"]);
    expect(activeUnit(transition.workspace, "beta")).toBeDefined();
    expect(transition.workspace.dailyUnits.filter(({ planVersionId, id }) => planVersionId === transition.workspace.activePlanVersionId && id === alpha.id)).toEqual([]);
  });

  it("proposes delayed, skipped, too-hard, known, and availability replans without replacing active", () => {
    const initial = workspace();
    const alpha = activeUnit(initial, "alpha");
    const originalDate = alpha.scheduledDate;

    const delayed = propose(initial, "delayed");
    expect(delayed.kind).toBe("proposed");
    expect(delayed.workspace.activePlanVersionId).toBe(initial.activePlanVersionId);
    expect(delayed.workspace.pendingPlanVersionId).toBeTruthy();
    expect(delayed.diff.items.find(({ unitId }) => unitId === alpha.id)).toMatchObject({ change: "moved", fromDate: originalDate, toDate: "2026-08-13" });
    const delayedBeta = delayed.diff.items.find(({ unitId }) => unitId === activeUnit(initial, "beta").id);
    expect(delayedBeta).toMatchObject({ change: "moved", toDate: "2026-08-14" });

    const skipped = propose(initial, "skipped");
    expect(skipped.kind).toBe("proposed");
    expect(skipped.workspace.events.at(-1)?.kind).toBe("skipped");
    expect(skipped.workspace.events.some((item) => item.kind === "completed")).toBe(false);

    const hard = propose(initial, "too_hard");
    const hardCandidateId = hard.workspace.pendingPlanVersionId!;
    expect(hard.kind).toBe("proposed");
    expect(hard.workspace.dailyUnits.some((unit) => unit.planVersionId === hardCandidateId && unit.kind === "reinforce" && unit.skillId === "alpha")).toBe(true);

    const known = propose(initial, "already_known");
    const knownCandidateId = known.workspace.pendingPlanVersionId!;
    const knownUnits = known.workspace.dailyUnits.filter((unit) => unit.planVersionId === knownCandidateId && unit.skillId === "alpha" && unit.required);
    expect(knownUnits).toHaveLength(1);
    expect(knownUnits[0]?.kind).toBe("calibrate");

    const changed = availability("availability-02", 0);
    const availabilityTransition = applyPlanningEvent({
      workspace: initial, blueprint, registry,
      event: event(initial, { kind: "availability_changed", availability: changed, planningDate: PLANNING_DATE }),
    });
    expect(availabilityTransition.kind).toBe("proposed");
    if (availabilityTransition.kind !== "proposed") throw new Error("Expected proposed transition");
    expect(availabilityTransition.workspace.availability).toEqual(initial.availability);
    expect(availabilityTransition.workspace.availabilityVersions).toEqual([initial.availability, changed]);
    const availabilityCandidate = availabilityTransition.workspace.planVersions.find(({ id }) => id === availabilityTransition.workspace.pendingPlanVersionId)!;
    const availabilityCandidatePath = availabilityTransition.workspace.pathVersions.find(({ id }) => id === availabilityCandidate.pathVersionId)!;
    expect(availabilityCandidatePath.availabilityVersionId).toBe(changed.id);
    expect(availabilityTransition.diff.items.find(({ unitId }) => unitId === alpha.id)?.toDate).toBe("2026-08-13");
  });

  it("switches a proposed availability snapshot only on acceptance", () => {
    const initial = workspace();
    const changed = availability("availability-02", 0);
    const proposalEvent = event(initial, { kind: "availability_changed", availability: changed, planningDate: PLANNING_DATE });
    const proposed = applyPlanningEvent({ workspace: initial, blueprint, registry, event: proposalEvent }).workspace;
    const candidateId = proposed.pendingPlanVersionId!;

    expect(proposed.availability).toEqual(initial.availability);
    expect(propose(initial, "skipped").workspace.availability).toEqual(initial.availability);

    const discarded = applyPlanningEvent({
      workspace: proposed, blueprint, registry,
      event: event(proposed, { kind: "replan_discarded", candidatePlanVersionId: candidateId }, { targetPlanVersionId: initial.activePlanVersionId }),
    }).workspace;
    expect(discarded.availability).toEqual(initial.availability);

    const proposedAgain = applyPlanningEvent({ workspace: initial, blueprint, registry, event: proposalEvent }).workspace;
    const accepted = applyPlanningEvent({
      workspace: proposedAgain, blueprint, registry,
      event: event(proposedAgain, { kind: "replan_accepted", candidatePlanVersionId: proposedAgain.pendingPlanVersionId! }, { targetPlanVersionId: initial.activePlanVersionId }),
    }).workspace;
    expect(accepted.availability).toEqual(changed);
  });

  it("rejects unavailable reinforcement without changing caller state", () => {
    const initial = workspace();
    const withoutReinforcement = {
      ...registry,
      tracks: registry.tracks.map((track) => ({ ...track, templates: track.templates.filter(({ kind }) => kind !== "reinforce") })),
    } as UnitRegistry;
    const before = JSON.stringify(initial);

    expect(() => proposeWithRegistry(initial, withoutReinforcement, "too_hard"))
      .toThrowError(expect.objectContaining({ code: "REINFORCEMENT_UNAVAILABLE" }));
    expect(JSON.stringify(initial)).toBe(before);
  });

  it("reschedules the accepted adaptive path without reviving replaced learn units", () => {
    const initial = workspace();
    const proposed = propose(initial, "already_known").workspace;
    const candidateId = proposed.pendingPlanVersionId!;
    const accepted = applyPlanningEvent({
      workspace: proposed, blueprint, registry,
      event: event(proposed, { kind: "replan_accepted", candidatePlanVersionId: candidateId }, { targetPlanVersionId: initial.activePlanVersionId }),
    }).workspace;
    const changed = availability("availability-02", 0);
    const rescheduled = applyPlanningEvent({
      workspace: accepted, blueprint, registry,
      event: event(accepted, { kind: "availability_changed", availability: changed, planningDate: PLANNING_DATE }),
    });
    if (rescheduled.kind !== "proposed") throw new Error("Expected proposed transition");
    const rescheduledUnits = rescheduled.workspace.dailyUnits.filter(({ planVersionId }) => planVersionId === rescheduled.workspace.pendingPlanVersionId);

    expect(rescheduledUnits.filter(({ skillId, required }) => skillId === "alpha" && required).map(({ kind }) => kind))
      .toEqual(["calibrate"]);
  });

  it("replaces only unfinished learn units and preserves completed skill history across later replans", () => {
    const alphaTrack = registry.tracks.find(({ skillId }) => skillId === "alpha")!;
    const firstLearn = alphaTrack.templates.find(({ kind }) => kind === "learn")!;
    const secondLearn = {
      ...firstLearn,
      id: "alpha-learn-02",
      title: "learn alpha continuation",
      steps: [{ ...firstLearn.steps[0]!, id: "alpha-learn-02-step" }],
    };
    const multiRegistry = unitRegistrySchema.parse({
      ...registry,
      tracks: registry.tracks.map((track) => track.skillId === "alpha"
        ? { ...track, templates: [firstLearn, secondLearn, ...track.templates.filter(({ kind }) => kind !== "learn")] }
        : track),
    });
    const initial = workspace(multiRegistry);
    const completedUnit = activeUnit(initial, "alpha");
    const historicalDate = completedUnit.scheduledDate;
    const afterCompletion = applyPlanningEvent({
      workspace: initial, blueprint, registry: multiRegistry,
      event: event(initial, { kind: "completed", unitId: completedUnit.id, actualMinutes: 60, planningDate: "2026-08-13" }),
    }).workspace;
    const unfinishedUnit = activeUnit(afterCompletion, "alpha");
    const knownProposal = applyPlanningEvent({
      workspace: afterCompletion, blueprint, registry: multiRegistry,
      event: event(afterCompletion, { kind: "already_known", unitId: unfinishedUnit.id, planningDate: "2026-08-13" }),
    });
    if (knownProposal.kind !== "proposed") throw new Error("Expected proposed transition");
    const candidatePlan = knownProposal.workspace.planVersions.find(({ id }) => id === knownProposal.workspace.pendingPlanVersionId)!;
    const candidatePath = knownProposal.workspace.pathVersions.find(({ id }) => id === candidatePlan.pathVersionId)!;
    const alphaPathUnits = candidatePath.units.filter(({ skillId }) => skillId === "alpha");
    const calibration = alphaPathUnits.find(({ kind }) => kind === "calibrate")!;
    const betaUnit = candidatePath.units.find(({ skillId }) => skillId === "beta")!;

    expect(alphaPathUnits.filter(({ kind }) => kind === "learn").map(({ id }) => id)).toEqual([completedUnit.id]);
    expect(alphaPathUnits.filter(({ kind }) => kind === "calibrate")).toHaveLength(1);
    expect(alphaPathUnits.some(({ id }) => id === unfinishedUnit.id)).toBe(false);
    expect(calibration.prerequisiteUnitIds).toContain(completedUnit.id);
    expect(betaUnit.prerequisiteUnitIds).toContain(calibration.id);
    expect(knownProposal.workspace.dailyUnits.find(({ planVersionId, id }) => planVersionId === initial.activePlanVersionId && id === completedUnit.id)?.scheduledDate)
      .toBe(historicalDate);

    const accepted = applyPlanningEvent({
      workspace: knownProposal.workspace, blueprint, registry: multiRegistry,
      event: event(knownProposal.workspace, { kind: "replan_accepted", candidatePlanVersionId: candidatePlan.id }, { targetPlanVersionId: afterCompletion.activePlanVersionId }),
    }).workspace;
    const activeCalibration = activeUnit(accepted, "alpha");
    const secondProposal = applyPlanningEvent({
      workspace: accepted, blueprint, registry: multiRegistry,
      event: event(accepted, { kind: "already_known", unitId: activeCalibration.id, planningDate: "2026-08-13" }),
    }).workspace;
    const secondCandidate = secondProposal.planVersions.find(({ id }) => id === secondProposal.pendingPlanVersionId)!;
    const secondPath = secondProposal.pathVersions.find(({ id }) => id === secondCandidate.pathVersionId)!;
    expect(secondPath.units.filter(({ skillId, kind }) => skillId === "alpha" && kind === "calibrate")).toHaveLength(1);
    expect(secondPath.units.some(({ id }) => id === completedUnit.id)).toBe(true);

    const secondAccepted = applyPlanningEvent({
      workspace: secondProposal, blueprint, registry: multiRegistry,
      event: event(secondProposal, { kind: "replan_accepted", candidatePlanVersionId: secondCandidate.id }, { targetPlanVersionId: accepted.activePlanVersionId }),
    }).workspace;
    const changed = {
      ...availability("availability-02"),
      exceptions: [{ date: "2026-08-13", minutes: 0, reason: "Changed schedule" }],
    };
    const availabilityProposal = applyPlanningEvent({
      workspace: secondAccepted, blueprint, registry: multiRegistry,
      event: event(secondAccepted, { kind: "availability_changed", availability: changed, planningDate: "2026-08-13" }),
    }).workspace;
    const availabilityCandidate = availabilityProposal.planVersions.find(({ id }) => id === availabilityProposal.pendingPlanVersionId)!;
    const availabilityPath = availabilityProposal.pathVersions.find(({ id }) => id === availabilityCandidate.pathVersionId)!;
    expect(availabilityPath.units.filter(({ skillId, kind }) => skillId === "alpha" && kind === "calibrate")).toHaveLength(1);
    expect(availabilityPath.units.some(({ id }) => id === completedUnit.id)).toBe(true);
  });

  it("accepts and discards only the exact pending candidate against its base", () => {
    const initial = workspace();
    const proposed = propose(initial, "delayed").workspace;
    const candidateId = proposed.pendingPlanVersionId!;
    const accept = event(proposed, { kind: "replan_accepted", candidatePlanVersionId: candidateId }, { targetPlanVersionId: initial.activePlanVersionId });
    const accepted = applyPlanningEvent({ workspace: proposed, blueprint, registry, event: accept });
    expect(accepted.kind).toBe("accepted");
    expect(accepted.workspace.activePlanVersionId).toBe(candidateId);
    expect(accepted.workspace.pendingPlanVersionId).toBeNull();

    const proposedAgain = propose(initial, "skipped").workspace;
    const discardedId = proposedAgain.pendingPlanVersionId!;
    const discarded = applyPlanningEvent({
      workspace: proposedAgain, blueprint, registry,
      event: event(proposedAgain, { kind: "replan_discarded", candidatePlanVersionId: discardedId }, { targetPlanVersionId: initial.activePlanVersionId }),
    });
    expect(discarded.kind).toBe("discarded");
    expect(discarded.workspace.activePlanVersionId).toBe(initial.activePlanVersionId);
    expect(discarded.workspace.pendingPlanVersionId).toBeNull();
    expect(discarded.workspace.planVersions.some(({ id }) => id === discardedId)).toBe(true);

    const noPendingDecision = event(initial, { kind: "replan_accepted", candidatePlanVersionId: candidateId });
    expect(() => applyPlanningEvent({ workspace: initial, blueprint, registry, event: noPendingDecision }))
      .toThrowError(expect.objectContaining({ code: "PENDING_REPLAN_REQUIRED" }));
    const wrongBase = { ...event(proposedAgain, { kind: "replan_discarded", candidatePlanVersionId: discardedId }), targetPlanVersionId: candidateId } as PlanningEvent;
    expect(() => applyPlanningEvent({ workspace: proposedAgain, blueprint, registry, event: wrongBase }))
      .toThrowError(expect.objectContaining({ code: "BASE_REVISION_MISMATCH" }));
  });

  it("enforces contiguous sequence, duplicate mutation, active unit, and strict boundaries", () => {
    const initial = workspace();
    const alpha = activeUnit(initial, "alpha");
    const first = event(initial, { kind: "skipped", unitId: alpha.id, planningDate: PLANNING_DATE });
    const proposed = applyPlanningEvent({ workspace: initial, blueprint, registry, event: first }).workspace;

    expect(() => applyPlanningEvent({ workspace: proposed, blueprint, registry, event: { ...first, sequence: proposed.lastSequence + 1, eventId: "event-duplicate" } as PlanningEvent }))
      .toThrowError(expect.objectContaining({ code: "DUPLICATE_MUTATION" }));
    expect(() => applyPlanningEvent({ workspace: initial, blueprint, registry, event: { ...first, sequence: 2 } as PlanningEvent }))
      .toThrowError(expect.objectContaining({ code: "STALE_SEQUENCE" }));
    expect(() => applyPlanningEvent({ workspace: initial, blueprint, registry, event: { ...first, unitId: "missing-unit" } as PlanningEvent }))
      .toThrowError(expect.objectContaining({ code: "UNIT_NOT_ACTIVE" }));
    expect(() => applyPlanningEvent({ workspace: { ...initial, extra: true } as unknown as PlanningWorkspace, blueprint, registry, event: first })).toThrow();
  });
});

describe("replayPlanningEvents", () => {
  it("uses sequence rather than occurredAt and reconstructs pending, accepted, and discarded states", () => {
    const initial = workspace();
    const proposedTransition = propose(initial, "delayed");
    const proposed = proposedTransition.workspace;
    const candidateId = proposed.pendingPlanVersionId!;
    const proposalEvent = { ...proposed.events[0]!, occurredAt: "2026-08-13T10:00:00.000Z" };
    const discardEvent = event(proposed, { kind: "replan_discarded", candidatePlanVersionId: candidateId }, {
      targetPlanVersionId: initial.activePlanVersionId,
      occurredAt: "2026-08-12T01:00:00.000Z",
    });

    const pendingReplay = replayPlanningEvents({ initial, events: [proposalEvent], blueprint, registry });
    expect(pendingReplay.pendingPlanVersionId).toBe(candidateId);
    expect(pendingReplay.planVersions.at(-1)?.inputFingerprint).toBe(proposed.planVersions.at(-1)?.inputFingerprint);

    const discardedReplay = replayPlanningEvents({ initial, events: [proposalEvent, discardEvent], blueprint, registry });
    expect(discardedReplay.activePlanVersionId).toBe(initial.activePlanVersionId);
    expect(discardedReplay.pendingPlanVersionId).toBeNull();

    const acceptEvent = { ...discardEvent, eventId: "event-accept", mutationId: "mutation-accept", kind: "replan_accepted" as const } as PlanningEvent;
    const acceptedReplay = replayPlanningEvents({ initial, events: [proposalEvent, acceptEvent], blueprint, registry });
    expect(acceptedReplay.activePlanVersionId).toBe(candidateId);
    expect(acceptedReplay.pendingPlanVersionId).toBeNull();
  });

  it("replays completion deterministically without consulting occurredAt", () => {
    const initial = workspace();
    const alpha = activeUnit(initial, "alpha");
    const completion = event(initial, { kind: "completed", unitId: alpha.id, actualMinutes: 55, planningDate: "2026-08-13" });
    const first = replayPlanningEvents({ initial, events: [completion], blueprint, registry });
    const second = replayPlanningEvents({ initial, events: [{ ...completion, occurredAt: "2030-01-01T00:00:00.000Z" }], blueprint, registry });

    expect(second.activePlanVersionId).toBe(first.activePlanVersionId);
    expect(second.planVersions.map(({ inputFingerprint }) => inputFingerprint)).toEqual(first.planVersions.map(({ inputFingerprint }) => inputFingerprint));
    expect(second.events.map(({ sequence, kind }) => ({ sequence, kind }))).toEqual(first.events.map(({ sequence, kind }) => ({ sequence, kind })));
  });
});

function proposeWithRegistry(state: PlanningWorkspace, customRegistry: UnitRegistry, kind: "too_hard") {
  const alpha = activeUnit(state, "alpha");
  return applyPlanningEvent({ workspace: state, blueprint, registry: customRegistry, event: event(state, { kind, unitId: alpha.id, planningDate: PLANNING_DATE }) });
}
