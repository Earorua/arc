import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { AdaptiveTodaySession } from "../../app/components/today/adaptive-today-session";
import { PLANNING_SCHEMA_VERSION, planningWorkspaceSchema } from "../../app/contracts/planning";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { buildLearningPaths } from "../../app/lib/planning/path-builder";
import { buildPlanVersion } from "../../app/lib/planning/scheduler";
import { applyPlanningEvent } from "../../app/lib/planning/event-reducer";

function workspace() {
  const audit = { id: "audit-today", schemaVersion: PLANNING_SCHEMA_VERSION, blueprintId: flagshipBlueprint.id, blueprintVersion: flagshipBlueprint.version, answers: flagshipBlueprint.skills.map(({ id }) => ({ skillId: id, level: "unseen" as const, evidenceRefs: [] })), evidence: [], createdBy: "learner", inputFingerprint: "audit-today-fingerprint" };
  const availability = { id: "availability-today", schemaVersion: PLANNING_SCHEMA_VERSION, timeZone: "UTC", weekdays: { monday: 180, tuesday: 180, wednesday: 180, thursday: 180, friday: 180, saturday: 180, sunday: 180 }, exceptions: [], weeklyMinutes: 1260, inputFingerprint: "availability-today-fingerprint" };
  const target = { id: "target-today", schemaVersion: PLANNING_SCHEMA_VERSION, targetWeeks: 18, inputFingerprint: "target-today-fingerprint" };
  const path = buildLearningPaths({ blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, audit, availability, target, planningDate: "2026-08-14" }).fullScope;
  const built = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability, planningDate: "2026-08-14", generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() });
  return planningWorkspaceSchema.parse({ id: "workspace-today", goalId: "goal-today", revision: 0, lastSequence: 0, audit, availability, availabilityVersions: [availability], target, pathVersions: [path], planVersions: [built.plan], dailyUnits: built.dailyUnits, events: [], activePathVersionId: path.id, activePlanVersionId: built.plan.id, pendingPlanVersionId: null });
}

const fixedNow = () => new Date("2026-08-14T10:00:00.000Z");

async function openAdjustments(user: ReturnType<typeof userEvent.setup>) {
  const summary = screen.getByText("调整这项任务");
  if (!summary.closest("details")!.open) await user.click(summary);
}

afterEach(cleanup);
describe("AdaptiveTodaySession", () => {
  it("shows a completed route after its saved week instead of a version error or a repeated task", () => {
    const current = workspace();
    const path = current.pathVersions[0];
    path.units = path.units.slice(0, 3);
    path.phases = path.phases.map(phase => ({ ...phase, unitIds: phase.unitIds.filter(id => path.units.some(unit => unit.id === id)) })).filter(phase => phase.unitIds.length > 0);
    current.events = current.pathVersions[0].units.map((unit, index) => ({ kind: "completed" as const, unitId: unit.id, actualMinutes: null, planningDate: "2026-08-14", occurredAt: "2026-08-14T10:00:00.000Z", eventId: `done-${index}`, mutationId: `done-${index}`, sequence: index + 1, targetPlanVersionId: current.activePlanVersionId }));
    current.lastSequence = current.events.length;
    planningWorkspaceSchema.parse(current);
    render(<AdaptiveTodaySession workspace={current} now={() => new Date("2026-10-28T10:00:00.000Z")} record={vi.fn()} accept={vi.fn()} discard={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "这条路线已完成。" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "完成任务" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "回顾学习路线" })).toHaveAttribute("href", "/path");
  });
  it("links the actual task skill and keeps mobile resources available on demand", () => {
    const previous = window.matchMedia;
    window.matchMedia = vi.fn(query => ({ matches: query === "(max-width: 760px)", media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }));
    try {
      const current = workspace();
      const plan = current.planVersions.find(item => item.id === current.activePlanVersionId)!;
      const task = current.dailyUnits.find(item => item.id === plan.days[0]!.primaryUnitId)!;
      render(<AdaptiveTodaySession workspace={current} now={fixedNow} record={vi.fn()} accept={vi.fn()} discard={vi.fn()} />);
      expect(screen.getByRole("link", { name: "查看当前技能与资料" })).toHaveAttribute("href", `/stack?skill=${encodeURIComponent(task.skillId)}&returnTo=%2Ftoday`);
      const disclosure = screen.getByText("学习资料").closest("details")!;
      expect(disclosure).not.toHaveAttribute("open");
      fireEvent.click(screen.getByText("学习资料"));
      expect(disclosure).toHaveAttribute("open");
      expect(screen.getByRole("link", { name: flagshipBlueprint.resources[0]!.title })).toBeVisible();
    } finally { cleanup(); window.matchMedia = previous; }
  });
  it("uses the short template title and retains the full objective as body copy", () => {
    const current = workspace();
    const plan = current.planVersions.find(({ id }) => id === current.activePlanVersionId)!;
    const primary = current.dailyUnits.find(({ id }) => id === plan.days[0]!.primaryUnitId)!;
    const template = flagshipUnitRegistry.tracks.flatMap(({ templates }) => templates).find(({ id }) => id === primary.templateId)!;
    render(<AdaptiveTodaySession workspace={current} now={fixedNow} record={vi.fn()} accept={vi.fn()} discard={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: template.title })).toBeInTheDocument();
    expect(screen.getByText(primary.objective).tagName).toBe("P");
  });

  it("discloses adjustment actions without recording an event", async () => {
    const record = vi.fn();
    const user = userEvent.setup();
    render(<AdaptiveTodaySession workspace={workspace()} now={fixedNow} record={record} accept={vi.fn()} discard={vi.fn()} />);
    const disclosure = screen.getByText("调整这项任务").closest("details")!;
    expect(disclosure).not.toHaveAttribute("open");
    await user.click(screen.getByText("调整这项任务"));
    expect(disclosure).toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "延后" })).toBeVisible();
    expect(record).not.toHaveBeenCalled();
  });

  it("shows overdue original scheduling while recording the current planning date", async () => {
    const record = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(<AdaptiveTodaySession workspace={workspace()} now={() => new Date("2026-08-15T10:00:00.000Z")} record={record} accept={vi.fn()} discard={vi.fn()} />);
    expect(screen.getByText("待补任务 · 原定 2026-08-14")).toBeInTheDocument();
    await user.click(screen.getByText("调整这项任务"));
    await openAdjustments(user);
    await user.click(screen.getByRole("button", { name: "延后" }));
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ kind: "delayed", planningDate: "2026-08-15" }));
  });

  it("requires an explicit completion and resets local checks when reopened", async () => {
    const record = vi.fn();
    const user = userEvent.setup();
    const props = { workspace: workspace(), now: fixedNow, record, accept: vi.fn(), discard: vi.fn() };
    const view = render(<AdaptiveTodaySession {...props} />);
    for (const box of screen.getAllByRole("checkbox")) await user.click(box);
    expect(screen.getByRole("button", { name: "完成任务" })).toBeEnabled();
    expect(record).not.toHaveBeenCalled();
    expect(screen.getByText("勾选仅保留在本次页面中；点击「完成任务」才会记录进度。")).toBeInTheDocument();
    view.unmount();
    render(<AdaptiveTodaySession {...props} />);
    expect(screen.getByRole("button", { name: "完成任务" })).toBeDisabled();
    expect(screen.getAllByRole("checkbox").every((box) => !(box as HTMLInputElement).checked)).toBe(true);
  });

  it("renders one complete primary brief, exact source attributes, and at most one optional stretch", () => {
    render(<AdaptiveTodaySession workspace={workspace()} now={fixedNow} record={vi.fn()} accept={vi.fn()} discard={vi.fn()} />);
    expect(screen.getByText(/今日 · 2026-08-14 · 主要任务/)).toBeInTheDocument();
    expect(screen.getByText("本次交付")).toBeInTheDocument(); expect(screen.getByText("完成标准")).toBeInTheDocument();
    expect(screen.getByText("证据要求")).toBeInTheDocument(); expect(screen.getByText("评价细则")).toBeInTheDocument();
    const source = screen.getByRole("link", { name: flagshipBlueprint.resources[0]!.title });
    expect(source).toHaveAttribute("target", "_blank"); expect(source).toHaveAttribute("rel", "noreferrer"); expect(source).toHaveAttribute("lang", "en");
    expect(within(screen.getByRole("article")).queryAllByText(/可选拓展/).length).toBeLessThanOrEqual(1);
    expect(screen.queryByText(/verified|demo/i)).not.toBeInTheDocument();
  });

  it("keeps step checks ephemeral, requires them for Complete, and emits contextual event kinds", async () => {
    const user = userEvent.setup(); const record = vi.fn().mockResolvedValue(true);
    render(<AdaptiveTodaySession workspace={workspace()} now={fixedNow} record={record} accept={vi.fn()} discard={vi.fn()} />);
    const complete = screen.getByRole("button", { name: "完成任务" }); expect(complete).toBeDisabled();
    for (const box of screen.getAllByRole("checkbox")) await user.click(box);
    await user.click(complete); expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "completed" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "任务已完成，技能已进入练习状态。添加作品证据，展示你的能力。",
    );
    const receipt = new URL(screen.getByRole("link", { name: "添加作品证据" }).getAttribute("href")!, "http://localhost");
    expect(receipt.pathname).toBe("/proof");
    expect(receipt.searchParams.get("compose")).toBe("1");
    expect(receipt.searchParams.get("unit")).toBe(record.mock.calls.at(-1)![0].unitId);
    expect(receipt.searchParams.get("returnTo")).toBe("/today");
    await openAdjustments(user);
    for (const [label, kind] of [["延后", "delayed"], ["跳过", "skipped"], ["难度太高", "too_hard"], ["已经掌握", "already_known"]] as const) { await user.click(screen.getByRole("button", { name: label })); expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ kind })); }
    expect(screen.getByRole("status")).toHaveTextContent("当前计划尚未改变");
  });

  it("shows no status promotion language after a failed completion mutation", async () => {
    const user = userEvent.setup();
    render(<AdaptiveTodaySession
      workspace={workspace()} now={fixedNow} record={vi.fn().mockResolvedValue(false)}
      accept={vi.fn()} discard={vi.fn()}
    />);
    for (const box of screen.getAllByRole("checkbox")) await user.click(box);
    await user.click(screen.getByRole("button", { name: "完成任务" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Arc 未能更新计划");
    expect(screen.queryByText(/技能已进入练习状态|添加作品证据/iu)).not.toBeInTheDocument();
  });

  it("reveals optional stretch only after the primary checklist is complete", async () => {
    const user = userEvent.setup();
    const current = workspace();
    const active = current.planVersions.find(({ id }) => id === current.activePlanVersionId)!;
    const firstDay = active.days[0]!;
    expect(firstDay.stretchUnitId).not.toBeNull();

    render(<AdaptiveTodaySession workspace={current} now={fixedNow} record={vi.fn()} accept={vi.fn()} discard={vi.fn()} />);

    const article = screen.getByRole("article");
    expect(within(article).queryByText(/可选拓展/)).not.toBeInTheDocument();
    for (const box of screen.getAllByRole("checkbox")) await user.click(box);
    expect(within(article).getByText(/可选拓展/)).toBeInTheDocument();
  });

  it("uses the current availability-zone date for overdue work and event rollover", async () => {
    const user = userEvent.setup();
    const record = vi.fn().mockResolvedValue(true);
    render(<AdaptiveTodaySession
      workspace={workspace()}
      now={() => new Date("2026-08-15T10:00:00.000Z")}
      record={record}
      accept={vi.fn()}
      discard={vi.fn()}
    />);

    expect(screen.getByText(/今日 · 2026-08-15 · 主要任务/)).toBeInTheDocument();
    await openAdjustments(user);
    await user.click(screen.getByRole("button", { name: "延后" }));
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ planningDate: "2026-08-15" }));
  });

  it("uses the current availability-zone date on a Rest day", () => {
    const current = workspace();
    const availability = {
      ...current.availability,
      id: "availability-today-rest",
      weekdays: { ...current.availability.weekdays, friday: 0, saturday: 0 },
      weeklyMinutes: 900,
      inputFingerprint: "availability-today-rest-fingerprint",
    };
    const path = buildLearningPaths({
      blueprint: flagshipBlueprint,
      registry: flagshipUnitRegistry,
      audit: current.audit,
      availability,
      target: current.target,
      planningDate: "2026-08-14",
    }).fullScope;
    const built = buildPlanVersion({
      path,
      registry: flagshipUnitRegistry,
      availability,
      planningDate: "2026-08-14",
      generation: "initial",
      baseVersionId: null,
      replanReason: null,
      completedUnitIds: new Set(),
    });
    const restDay = built.plan.days.find(({ date }) => date === "2026-08-15")!;
    const restWorkspace = planningWorkspaceSchema.parse({
      ...current,
      availability,
      availabilityVersions: [availability],
      pathVersions: [path],
      planVersions: [built.plan],
      dailyUnits: built.dailyUnits,
      activePathVersionId: path.id,
      activePlanVersionId: built.plan.id,
    });

    render(<AdaptiveTodaySession
      workspace={restWorkspace}
      now={() => new Date(`${restDay.date}T10:00:00.000Z`)}
      record={vi.fn()}
      accept={vi.fn()}
      discard={vi.fn()}
    />);

    expect(screen.getByText(`今日 · ${restDay.date}`)).toBeInTheDocument();
    expect(screen.queryByText("今日 · 2026-08-14")).not.toBeInTheDocument();
  });

  it("contains a rejected action and restores the controls for retry", async () => {
    const user = userEvent.setup();
    const record = vi.fn()
      .mockRejectedValueOnce(new Error("private transport detail"))
      .mockResolvedValueOnce(true);
    render(<AdaptiveTodaySession workspace={workspace()} now={fixedNow} record={record} accept={vi.fn()} discard={vi.fn()} />);
    await openAdjustments(user);
    const delay = screen.getByRole("button", { name: "延后" });

    await user.click(delay);

    expect(await screen.findByRole("alert")).toHaveTextContent("Arc 未能更新计划");
    expect(screen.getByRole("alert")).not.toHaveTextContent("private transport detail");
    expect(delay).toBeEnabled();

    await user.click(delay);
    expect(record).toHaveBeenCalledTimes(2);
  });

  it("fails closed before rendering Today when the active path lineage diverges", () => {
    const current = workspace();
    const activePath = current.pathVersions.find(({ id }) => id === current.activePathVersionId)!;
    const activePlan = current.planVersions.find(({ id }) => id === current.activePlanVersionId)!;
    const alternatePath = { ...activePath, id: "path-ui-alternate", inputFingerprint: "path-ui-alternate-fingerprint" };
    const mismatched = planningWorkspaceSchema.parse({
      ...current,
      pathVersions: [activePath, alternatePath],
      planVersions: [{ ...activePlan, pathVersionId: alternatePath.id }],
    });
    const view = render(<AdaptiveTodaySession workspace={mismatched} now={fixedNow} record={vi.fn()} accept={vi.fn()} discard={vi.fn()} />);

    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("暂时无法读取这个计划");
    expect(screen.getByRole("alert")).toHaveTextContent("原有计划与学习记录已保留");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    view.rerender(<AdaptiveTodaySession workspace={current} now={fixedNow} registry={{ ...flagshipUnitRegistry, blueprintVersion: "2026.99" }} record={vi.fn()} accept={vi.fn()} discard={vi.fn()} />);
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("当前暂不支持自动转换这个版本");
  });

  it("keeps active Today visible but locks learning actions while a candidate diff is pending", async () => {
    const user = userEvent.setup();
    const record = vi.fn();
    const current = workspace();
    const path = current.pathVersions.find(({ id }) => id === current.activePathVersionId)!;
    const active = current.planVersions.find(({ id }) => id === current.activePlanVersionId)!;
    const candidate = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability: current.availability, planningDate: "2026-08-15", generation: "proposed", baseVersionId: active.id, replanReason: "delayed", completedUnitIds: new Set() });
    const pending = planningWorkspaceSchema.parse({
      ...current,
      revision: 1,
      planVersions: [active, candidate.plan],
      dailyUnits: [...current.dailyUnits, ...candidate.dailyUnits],
      pendingPlanVersionId: candidate.plan.id,
    });
    const activePrimaryId = active.days.find(({ primaryUnitId }) => primaryUnitId !== null)!.primaryUnitId!;
    const activeObjective = current.dailyUnits.find(({ id, planVersionId }) => id === activePrimaryId && planVersionId === active.id)!.objective;

    render(<AdaptiveTodaySession workspace={pending} now={fixedNow} record={record} accept={vi.fn()} discard={vi.fn()} />);

    expect(screen.getByText(activeObjective)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "这次调整会改变什么" })).toBeInTheDocument();
    expect(screen.getByText(/只有点击「接受新安排」后/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("调整方案已生成，请先审阅");
    await openAdjustments(user);
    for (const name of ["完成任务", "延后", "跳过", "难度太高", "已经掌握"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "接受新安排" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "保留当前安排" })).toBeEnabled();

    await openAdjustments(user);
    await user.click(screen.getByRole("button", { name: "延后" }));
    expect(record).not.toHaveBeenCalled();
  });

  it("prefers an authoritative candidate workspace over a stale failed record result", async () => {
    const current = workspace();
    const proposal = applyPlanningEvent({
      workspace: current,
      blueprint: flagshipBlueprint,
      registry: flagshipUnitRegistry,
      event: {
        eventId: "event-today-delay-race",
        mutationId: "mutation-today-delay-race",
        sequence: 1,
        targetPlanVersionId: current.activePlanVersionId,
        occurredAt: "2026-08-14T10:00:00.000Z",
        kind: "delayed",
        unitId: current.dailyUnits.find(({ planVersionId }) => planVersionId === current.activePlanVersionId)!.id,
        planningDate: "2026-08-14",
      },
    });
    if (proposal.kind !== "proposed") throw new Error("Expected a delayed candidate plan");

    function CandidateRaceHarness() {
      const [value, setValue] = useState(current);
      const record = async () => {
        setValue(proposal.workspace);
        return false;
      };
      return <AdaptiveTodaySession workspace={value} now={fixedNow} record={record} accept={vi.fn()} discard={vi.fn()} />;
    }

    const user = userEvent.setup();
    render(<CandidateRaceHarness />);
    await openAdjustments(user);
    await user.click(screen.getByRole("button", { name: "延后" }));

    expect(await screen.findByRole("heading", { name: "这次调整会改变什么" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("调整方案已生成，请先审阅");
    expect(screen.queryByText(/连接恢复/)).not.toBeInTheDocument();
  });

  it("keeps the accepted-plan announcement visible when the candidate makes Today a Rest day", async () => {
    const current = workspace();
    const changedAvailability = {
      ...current.availability,
      id: "availability-today-accepted-rest",
      weekdays: { ...current.availability.weekdays, friday: 0 },
      weeklyMinutes: 1080,
      inputFingerprint: "availability-today-accepted-rest-fingerprint",
    };
    const proposal = applyPlanningEvent({
      workspace: current,
      blueprint: flagshipBlueprint,
      registry: flagshipUnitRegistry,
      event: {
        eventId: "event-today-rest-proposal",
        mutationId: "mutation-today-rest-proposal",
        sequence: 1,
        targetPlanVersionId: current.activePlanVersionId,
        occurredAt: "2026-08-14T10:00:00.000Z",
        kind: "availability_changed",
        availability: changedAvailability,
        planningDate: "2026-08-14",
      },
    });
    if (proposal.kind !== "proposed") throw new Error("Expected a proposed rest-day plan");

    function TodayDecisionHarness() {
      const [value, setValue] = useState(proposal.workspace);
      const accept = async (candidatePlanVersionId: string) => {
        const accepted = applyPlanningEvent({
          workspace: value,
          blueprint: flagshipBlueprint,
          registry: flagshipUnitRegistry,
          event: {
            eventId: "event-today-rest-accept",
            mutationId: "mutation-today-rest-accept",
            sequence: value.lastSequence + 1,
            targetPlanVersionId: value.activePlanVersionId,
            occurredAt: "2026-08-14T10:01:00.000Z",
            kind: "replan_accepted",
            candidatePlanVersionId,
          },
        });
        setValue(accepted.workspace);
        return true;
      };
      return <AdaptiveTodaySession workspace={value} now={fixedNow} record={vi.fn()} accept={accept} discard={vi.fn()} />;
    }

    const user = userEvent.setup();
    render(<TodayDecisionHarness />);
    await user.click(screen.getByRole("button", { name: "接受新安排" }));

    expect(await screen.findByRole("heading", { name: "今天留给休息。" })).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("已接受新安排");
  });

  it("uses exact safe-link attributes for primary and alternative sources", () => {
    const current = workspace();
    const active = current.planVersions.find(({ id }) => id === current.activePlanVersionId)!;
    const primaryId = active.days.find(({ primaryUnitId }) => primaryUnitId !== null)!.primaryUnitId!;
    const primary = current.dailyUnits.find(({ id, planVersionId }) => id === primaryId && planVersionId === active.id)!;
    const alternative = flagshipBlueprint.resources.find(({ id }) => id !== primary.primaryResourceId)!;
    const withAlternative = planningWorkspaceSchema.parse({
      ...current,
      dailyUnits: current.dailyUnits.map((unit) => unit.id === primary.id && unit.planVersionId === primary.planVersionId
        ? { ...unit, alternativeResourceIds: [alternative.id] }
        : unit),
    });

    render(<AdaptiveTodaySession workspace={withAlternative} now={fixedNow} record={vi.fn()} accept={vi.fn()} discard={vi.fn()} />);

    for (const resource of [flagshipBlueprint.resources.find(({ id }) => id === primary.primaryResourceId)!, alternative]) {
      const link = screen.getByRole("link", { name: resource.title });
      expect(link).toHaveAttribute("href", resource.url);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noreferrer");
      expect(link).toHaveAttribute("lang", resource.language);
    }
  });
});
