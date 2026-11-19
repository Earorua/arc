import { describe, expect, it } from "vitest";
import { planningEventInputSchema, planningEventSchema, planningWorkspaceSchema } from "../../../app/contracts/planning";
import { planningEventRequestSchema } from "../../../app/contracts/planning-api";
import { applyPlanningEvent, replayPlanningEvents } from "../../../app/lib/planning/event-reducer";
import { buildLearningPaths } from "../../../app/lib/planning/path-builder";
import { buildPlanVersion } from "../../../app/lib/planning/scheduler";
import { agentFixture } from "../../helpers/agent-fixture";

describe("agent planning proposals", () => {
  const input = (historicalName?: string) => {
    let fixture = agentFixture();
    if (historicalName) {
      // The old persisted ID used this blueprint display name; every other input is unchanged.
      const blueprint = { ...fixture.sourceContext.blueprint, name: historicalName };
      const registry = fixture.sourceContext.registry;
      const path = buildLearningPaths({ ...fixture.request, blueprint, registry }).fullScope;
      const built = buildPlanVersion({ path, registry, availability: fixture.request.availability,
        planningDate: fixture.request.planningDate, generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() });
      fixture = { ...fixture, path, sourceContext: { ...fixture.sourceContext, blueprint },
        workspace: planningWorkspaceSchema.parse({ ...fixture.workspace, pathVersions: [path], planVersions: [built.plan], dailyUnits: built.dailyUnits,
          activePathVersionId: path.id, activePlanVersionId: built.plan.id }) };
    }
    const event = { kind: "agent_replanned", baseRevision: 0, unitOrder: fixture.path.units.map(u => u.id),
      planningDate: "2026-10-14", eventId: "agent-event", mutationId: "agent-mutation", sequence: 1,
      targetPlanVersionId: fixture.workspace.activePlanVersionId, occurredAt: "2026-10-14T01:00:00.000Z" };
    return { ...fixture, event };
  };
  it.each([
    ["historical role display", "AI 原生全栈工程师", "plan-version-99727a989539f78219f6adb4a83e4fce"],
    ["current role display", undefined, "plan-version-354a875eebd378e0774cd87aa9c7533c"],
  ] as const)("creates and replays the %s proposal without activating it", (_label, historicalName, expectedPlanId) => {
    const f = input(historicalName);
    expect(planningEventSchema.safeParse(f.event).success).toBe(true);
    const event = planningEventSchema.parse(f.event);
    const next = applyPlanningEvent({ workspace: f.workspace, event, blueprint: f.sourceContext.blueprint, registry: f.sourceContext.registry });
    expect(next.kind).toBe("proposed");
    expect(next.workspace.activePlanVersionId).toBe(f.workspace.activePlanVersionId);
    // Keep the pre-material historical ID and bind the translated fixture separately.
    expect(next.workspace.pendingPlanVersionId).toBe(expectedPlanId);
    expect(replayPlanningEvents({ initial: f.workspace, events: [event], blueprint: f.sourceContext.blueprint, registry: f.sourceContext.registry }))
      .toEqual(next.workspace);
  });
  it("accepts material context evidence only on the stored proposal, outside the client event contract", () => {
    const { event } = input();
    const body = { kind: event.kind, baseRevision: event.baseRevision, unitOrder: event.unitOrder, planningDate: event.planningDate };
    const materialContextFingerprint = "a".repeat(64);
    expect(planningEventInputSchema.safeParse(body).success).toBe(true);
    expect(planningEventInputSchema.safeParse({ ...body, materialContextFingerprint }).success).toBe(false);
    expect(planningEventSchema.safeParse({ ...event, materialContextFingerprint }).success).toBe(true);
    expect(planningEventSchema.safeParse({ ...event, materialContextFingerprint: "unverified" }).success).toBe(false);
  });
  it("accepts the display indicator only as literal true on a recorded agent proposal and still reads old events", () => {
    const { event } = input();
    expect(planningEventSchema.parse(event)).not.toHaveProperty("materialProposal");
    expect(planningEventSchema.safeParse({ ...event, materialProposal: true }).success).toBe(true);
    for (const materialProposal of [false, "true", 1, null]) {
      expect(planningEventSchema.safeParse({ ...event, materialProposal }).success).toBe(false);
    }
    const { eventId, mutationId, sequence, targetPlanVersionId, occurredAt } = event;
    expect(planningEventSchema.safeParse({ eventId, mutationId, sequence, targetPlanVersionId, occurredAt,
      kind: "replan_discarded", candidatePlanVersionId: targetPlanVersionId, materialProposal: true }).success).toBe(false);
  });
  it.each([true, false, "true"])("rejects a client-injected material proposal indicator: %s", materialProposal => {
    const { event } = input();
    const body = { kind: event.kind, baseRevision: event.baseRevision, unitOrder: event.unitOrder, planningDate: event.planningDate };
    expect(planningEventRequestSchema.safeParse({ mutationId: event.mutationId, baseVersionId: event.targetPlanVersionId, event: body }).success).toBe(true);
    expect(planningEventInputSchema.safeParse({ ...body, materialProposal }).success).toBe(false);
    expect(planningEventRequestSchema.safeParse({ mutationId: event.mutationId, baseVersionId: event.targetPlanVersionId,
      event: { ...body, materialProposal } }).success).toBe(false);
  });
  it.each(["missing", "duplicate", "unknown", "dependency"] as const)("rejects %s unit order", (kind) => {
    const f = input();
    if (kind === "missing") f.event.unitOrder.pop();
    if (kind === "duplicate") f.event.unitOrder[1] = f.event.unitOrder[0];
    if (kind === "unknown") f.event.unitOrder[0] = "invented-unit";
    if (kind === "dependency") f.event.unitOrder.reverse();
    expect(() => applyPlanningEvent({ workspace: f.workspace, event: planningEventSchema.parse(f.event),
      blueprint: f.sourceContext.blueprint, registry: f.sourceContext.registry })).toThrow();
  });
  it.each(["replan_accepted", "replan_discarded"] as const)("preserves completed history through %s and replay", kind => {
    const f = input();
    const active = f.workspace.planVersions.find(plan => plan.id === f.workspace.activePlanVersionId)!;
    const unitId = active.days.find(day => day.primaryUnitId)?.primaryUnitId;
    const completed = planningEventSchema.parse({ kind: "completed", planningDate: f.event.planningDate,
      occurredAt: f.event.occurredAt, targetPlanVersionId: active.id, sequence: 1,
      unitId, actualMinutes: 30, eventId: "completed-event", mutationId: "completed-mutation" });
    const apply = (workspace: typeof f.workspace, event: typeof completed) =>
      applyPlanningEvent({ workspace, event, blueprint: f.sourceContext.blueprint, registry: f.sourceContext.registry });
    const afterCompletion = apply(f.workspace, completed).workspace;
    const proposal = planningEventSchema.parse({ ...f.event, baseRevision: afterCompletion.revision,
      sequence: 2, targetPlanVersionId: afterCompletion.activePlanVersionId,
      unitOrder: f.event.unitOrder.filter(id => id !== unitId) });
    const candidate = apply(afterCompletion, proposal).workspace;
    const decision = planningEventSchema.parse({ kind, candidatePlanVersionId: candidate.pendingPlanVersionId,
      eventId: "decision-event", mutationId: "decision-mutation", sequence: 3,
      targetPlanVersionId: candidate.activePlanVersionId, occurredAt: "2026-10-14T01:10:00.000Z" });
    const final = apply(candidate, decision).workspace;
    expect(final.pendingPlanVersionId).toBeNull();
    expect(final.activePlanVersionId).toBe(kind === "replan_accepted" ? candidate.pendingPlanVersionId : afterCompletion.activePlanVersionId);
    expect(final.events[0]).toEqual(completed);
    expect(final.dailyUnits.filter(unit => unit.planVersionId === active.id)).toEqual(f.workspace.dailyUnits.filter(unit => unit.planVersionId === active.id));
    expect(replayPlanningEvents({ initial: f.workspace, events: [completed, proposal, decision],
      blueprint: f.sourceContext.blueprint, registry: f.sourceContext.registry })).toEqual(final);
  });
});
