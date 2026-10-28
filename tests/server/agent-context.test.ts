import { describe, expect, it } from "vitest";
import type { AgentRequest } from "../../app/contracts/agents";
import { planningEventSchema, type DailyUnit, type PlanningWorkspace } from "../../app/contracts/planning";
import { AgentServiceError, learningContext, promptContext } from "../../app/server/agents/context";
import { agentFixture } from "../helpers/agent-fixture";
import { researchAgentFixture } from "../helpers/research-agent-fixture";

const now = new Date("2026-10-15T16:30:00.000Z");
function complete(workspace: PlanningWorkspace, unit: DailyUnit) {
  const sequence = workspace.events.length + 1;
  workspace.events.push(planningEventSchema.parse({ kind: "completed", eventId: `event-${sequence}`,
    mutationId: `mutation-${sequence}`, sequence, targetPlanVersionId: unit.planVersionId,
    occurredAt: "2026-10-14T00:00:00.000Z", planningDate: unit.scheduledDate,
    unitId: unit.id, actualMinutes: unit.estimatedMinutes }));
  workspace.lastSequence = sequence;
  workspace.revision += 1;
}
function request(workspace: PlanningWorkspace): AgentRequest {
  return { requestId: "00000000-0000-4000-8000-000000000001", goalId: workspace.goalId,
    baseVersionId: workspace.activePlanVersionId, revision: workspace.revision,
    message: "Help with this learning task", page: "today", deep: false };
}

describe("learning agent context", () => {
  it("selects the earliest unfinished required task, including overdue work", () => {
    const f = researchAgentFixture();
    const required = f.workspace.dailyUnits.filter(unit => unit.required);
    complete(f.workspace, required[0]);
    f.workspace.dailyUnits.reverse();
    f.workspace.planVersions[0].days.reverse();
    const context = learningContext({ workspace: f.workspace, sourceContext: f.sourceContext }, now);
    expect(context.currentUnit?.id).toBe(required[1].id);
    expect(context.planningDate).toBe("2026-10-16");
    expect(context.learningContext).toMatchObject({ source: "research", date: "2026-10-16",
      timeZone: "Asia/Shanghai", completedUnits: 1, totalUnits: f.path.units.length,
      task: { id: required[1].id, scheduledDate: "2026-10-15" } });
    expect(context.units.some(unit => unit.id === required[0].id)).toBe(false);
  });

  it("uses the learner's local date at a UTC day boundary", () => {
    const instant = new Date("2026-10-13T16:30:00.000Z");
    const shanghai = researchAgentFixture();
    const utc = researchAgentFixture("UTC");
    expect(learningContext({ workspace: shanghai.workspace, sourceContext: shanghai.sourceContext }, instant).currentUnit?.scheduledDate)
      .toBe("2026-10-14");
    expect(learningContext({ workspace: utc.workspace, sourceContext: utc.sourceContext }, instant).currentUnit).toBeNull();
  });

  it("keeps future work available as catalog context without naming it the current task", () => {
    const f = researchAgentFixture();
    const context = learningContext({ workspace: f.workspace, sourceContext: f.sourceContext }, new Date("2026-10-13T00:00:00.000Z"));
    expect(context.currentTask).toBeNull();
    expect(context.learningContext.task).toBeNull();
    const body = JSON.parse(promptContext(context, request(f.workspace), false));
    expect(body.currentTask).toBeNull();
    expect(body.resources.length).toBeGreaterThan(0);
    expect(body.resources.length).toBeLessThanOrEqual(36);
  });

  it("exposes primary and alternative catalog resources with real progress to the tutor", () => {
    const f = researchAgentFixture();
    complete(f.workspace, f.workspace.dailyUnits.find(unit => unit.required)!);
    const context = learningContext({ workspace: f.workspace, sourceContext: f.sourceContext }, now);
    const current = context.currentUnit!;
    const expectedIds = [current.primaryResourceId, ...current.alternativeResourceIds];
    const expectedResources = expectedIds.map(id => {
      const { title, url, provider } = f.sourceContext.blueprint.resources.find(resource => resource.id === id)!;
      return { id, title, url, provider };
    });
    expect(expectedResources.length).toBeGreaterThan(1);
    expect(context.learningContext.resources).toEqual(expectedResources);
    const body = JSON.parse(promptContext(context, request(f.workspace), false));
    expect(body.resources).toEqual(expectedResources);
    expect(body.learningContext).toEqual(context.learningContext);
    expect(body.resourceContent).toBe("catalog_metadata_only");
    expect(body.role).toBe("Data Product Manager");
    expect(body.currentTask.id).toBe(current.id);
  });

  it("does not count duplicate completions or optional stretch work toward route progress", () => {
    const f = agentFixture();
    const required = f.workspace.dailyUnits.find(unit => unit.required)!;
    complete(f.workspace, required);
    complete(f.workspace, required);
    const stretch = { ...required, id: "optional-stretch", required: false, slot: "stretch" as const };
    f.workspace.dailyUnits.push(stretch);
    f.workspace.planVersions[0].dailyUnitIds.push(stretch.id);
    f.workspace.planVersions[0].days.find(day => day.date === stretch.scheduledDate)!.stretchUnitId = stretch.id;
    complete(f.workspace, stretch);
    const context = learningContext({ workspace: f.workspace, sourceContext: f.sourceContext }, now);
    expect(context.learningContext.completedUnits).toBe(1);
    expect(context.learningContext.totalUnits).toBe(f.path.units.length);
  });

  it("does not promote a future or optional task after all due required work is complete", () => {
    const f = researchAgentFixture();
    const required = f.workspace.dailyUnits.filter(unit => unit.required);
    complete(f.workspace, required[0]);
    const optional = { ...required[0], id: "optional-stretch", required: false, slot: "stretch" as const };
    f.workspace.dailyUnits.push(optional);
    f.workspace.planVersions[0].dailyUnitIds.push(optional.id);
    f.workspace.planVersions[0].days[0].stretchUnitId = optional.id;
    const context = learningContext({ workspace: f.workspace, sourceContext: f.sourceContext }, new Date("2026-10-14T00:00:00.000Z"));
    expect(context.currentUnit).toBeNull();
    expect(context.currentTask).toBeNull();
    expect(context.learningContext.resources).toEqual([]);
  });

  it.each(["missing", "blueprint", "registry", "reference", "unsafe-url"] as const)(
    "fails closed for %s Research source data", (kind) => {
      const f = researchAgentFixture();
      if (kind === "blueprint") f.sourceContext.blueprint.version = "2026.08.99";
      if (kind === "registry") f.sourceContext.registry.version = "2026.08.99";
      if (kind === "reference" && f.sourceContext.reference.source === "research") f.sourceContext.reference.blueprintId = "wrong-role";
      if (kind === "unsafe-url") f.sourceContext.blueprint.resources[0].url = "https://user:secret@example.com/course";
      const response = { workspace: f.workspace, sourceContext: kind === "missing" ? null : f.sourceContext };
      expect(() => learningContext(response, now)).toThrow(AgentServiceError);
      expect(() => learningContext(response, now)).toThrow("学习路线资料暂时无法读取");
    },
  );

  it("supports the exact legacy flagship workspace without a source envelope", () => {
    const f = agentFixture();
    expect(learningContext({ workspace: f.workspace }, now).learningContext.source).toBe("flagship");
  });

  it("rejects an active plan whose path does not match the active route", () => {
    const f = researchAgentFixture();
    f.workspace.pathVersions.push({ ...f.path, id: "another-path" });
    f.workspace.activePathVersionId = "another-path";
    expect(() => learningContext({ workspace: f.workspace, sourceContext: f.sourceContext }, now))
      .toThrow("学习路线资料暂时无法读取");
  });

  it("distinguishes an absent workspace from invalid route data", () => {
    expect(() => learningContext({ workspace: null }, now)).toThrow("请先完成学习设置");
  });
});
