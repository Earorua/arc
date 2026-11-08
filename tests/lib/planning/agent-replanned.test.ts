import { describe, expect, it } from "vitest";
import { planningEventInputSchema, planningEventSchema } from "../../../app/contracts/planning";
import { planningEventRequestSchema } from "../../../app/contracts/planning-api";
import { applyPlanningEvent, replayPlanningEvents } from "../../../app/lib/planning/event-reducer";
import { agentFixture } from "../../helpers/agent-fixture";

describe("agent planning proposals", () => {
  const input = () => {
    const fixture = agentFixture();
    const event = { kind: "agent_replanned", baseRevision: 0, unitOrder: fixture.path.units.map(u => u.id),
      planningDate: "2026-10-14", eventId: "agent-event", mutationId: "agent-mutation", sequence: 1,
      targetPlanVersionId: fixture.workspace.activePlanVersionId, occurredAt: "2026-10-14T01:00:00.000Z" };
    return { ...fixture, event };
  };
  it("creates a proposed plan without activating it and replays identically", () => {
    const f = input();
    expect(planningEventSchema.safeParse(f.event).success).toBe(true);
    const event = planningEventSchema.parse(f.event);
    const next = applyPlanningEvent({ workspace: f.workspace, event, blueprint: f.sourceContext.blueprint, registry: f.sourceContext.registry });
    expect(next.kind).toBe("proposed");
    expect(next.workspace.activePlanVersionId).toBe(f.workspace.activePlanVersionId);
    // This fixture's persisted ID predates material proposal fingerprints.
    expect(next.workspace.pendingPlanVersionId).toBe("plan-version-99727a989539f78219f6adb4a83e4fce");
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
