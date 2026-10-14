import { describe, expect, it } from "vitest";
import { planningEventSchema } from "../../../app/contracts/planning";
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
    expect(next.workspace.pendingPlanVersionId).not.toBeNull();
    expect(replayPlanningEvents({ initial: f.workspace, events: [event], blueprint: f.sourceContext.blueprint, registry: f.sourceContext.registry }))
      .toEqual(next.workspace);
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
