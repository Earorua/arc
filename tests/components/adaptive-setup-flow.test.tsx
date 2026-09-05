import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdaptiveSetupFlow } from "../../app/components/setup/adaptive-setup-flow";
import type { GeneratePlanningRequest } from "../../app/contracts/planning-api";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { buildLearningPaths } from "../../app/lib/planning/path-builder";
import { buildPlanVersion, type PlanBuildInput } from "../../app/lib/planning/scheduler";

afterEach(cleanup);

describe("AdaptiveSetupFlow", () => {
  it("submits only the research run reference and learner answers for an explicit research source", async () => {
    const user = userEvent.setup();
    const generate = vi.fn().mockResolvedValue(true);
    render(<AdaptiveSetupFlow source={{ source: "research", researchRunId: "research-run-one" }} blueprint={flagshipBlueprint} registry={flagshipUnitRegistry} generate={generate} navigate={vi.fn()} createMutationId={() => "mutation-research"} now={() => new Date("2026-09-05T00:00:00Z")} timeZone="UTC" />);
    for (let index = 0; index < 3; index++) await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Build my path" }));
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ source: { source: "research", researchRunId: "research-run-one" } }));
    expect(generate.mock.calls[0]![0]).not.toHaveProperty("roleId");
    expect(generate.mock.calls[0]![0]).not.toHaveProperty("planningData");
  });
  it("does not save or navigate when an obsolete source finishes its deferred build preflight", async () => {
    const user = userEvent.setup();
    const pending = deferred<ReturnType<typeof buildLearningPaths>>();
    let built!: ReturnType<typeof buildLearningPaths>;
    const generate = vi.fn(); const navigate = vi.fn();
    const properties = { blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, source: { source: "research" as const, researchRunId: "research-run-one" }, generate, navigate, createMutationId: () => "mutation-research", now: () => new Date("2026-09-05T00:00:00Z"), timeZone: "UTC", buildPathsForSubmit: (input: Parameters<typeof buildLearningPaths>[0]) => { built = buildLearningPaths(input); return pending.promise; } };
    const page = render(<AdaptiveSetupFlow {...properties} />);
    for (let index = 0; index < 3; index++) await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Build my path" }));
    expect(screen.getByRole("status")).toHaveTextContent("Building the learning path");
    page.unmount(); pending.resolve(built); await pending.promise;
    expect(generate).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
  });
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
    return { promise, resolve, reject };
  }

  it("uses the exact five stages, focuses each heading, preserves Back edits, and submits once", async () => {
    const user = userEvent.setup();
    let resolveGenerate!: (value: boolean) => void;
    const generate = vi.fn((request: GeneratePlanningRequest) => {
      void request;
      return new Promise<boolean>((resolve) => { resolveGenerate = resolve; });
    });
    const navigate = vi.fn();
    const onBackToRole = vi.fn();
    render(<AdaptiveSetupFlow blueprint={flagshipBlueprint} createMutationId={() => "mutation-setup"} generate={generate} navigate={navigate} now={() => new Date("2026-08-14T02:00:00.000Z")} onBackToRole={onBackToRole} registry={flagshipUnitRegistry} timeZone="Asia/Shanghai" />);

    expect(screen.getByText("02 / 05 · Audit")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Set Foundations to Guided" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(onBackToRole).toHaveBeenCalledTimes(1);
    expect(screen.getByText("02 / 05 · Audit")).toBeInTheDocument();
    expect(screen.getAllByRole("radio", { name: "Guided", checked: true })).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("03 / 05 · Availability")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Build my path" }));
    await user.click(screen.getByRole("button", { name: "Build my path" }));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ mutationId: "mutation-setup", roleId: "ai-native-full-stack-engineer", planningDate: "2026-08-14", selectedScope: null }));
    expect(generate.mock.calls[0]?.[0]).toMatchObject({
      audit: { answers: expect.arrayContaining([expect.objectContaining({ skillId: "web-platform", level: "guided" })]) },
      availability: { weeklyMinutes: 420, timeZone: "Asia/Shanghai" }, target: { targetWeeks: 18 },
    });
    expect(screen.getByRole("status")).toHaveTextContent(/Saving/i);
    resolveGenerate(true);
    await screen.findByText(/Plan ready/i);
    expect(navigate).toHaveBeenCalledWith("/path");
  });

  it("keeps completed answers editable after a real save failure", async () => {
    const user = userEvent.setup();
    render(<AdaptiveSetupFlow blueprint={flagshipBlueprint} createMutationId={() => "mutation-setup"} generate={vi.fn().mockResolvedValue(false)} navigate={vi.fn()} now={() => new Date("2026-08-14T02:00:00.000Z")} registry={flagshipUnitRegistry} timeZone="Asia/Shanghai" />);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Build my path" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save/i);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Target weeks")).toBeEnabled();
  });

  it("keeps invalid target input visible and blocks Build until corrected", async () => {
    const user = userEvent.setup();
    render(<AdaptiveSetupFlow blueprint={flagshipBlueprint} createMutationId={() => "mutation-setup"} generate={vi.fn()} navigate={vi.fn()} now={() => new Date("2026-08-14T02:00:00.000Z")} registry={flagshipUnitRegistry} timeZone="Asia/Shanghai" />);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const targetWeeks = screen.getByLabelText("Target weeks");
    await user.clear(targetWeeks);
    await user.type(targetWeeks, "3");
    expect(targetWeeks).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("keeps Target editable and blocks Build when the deterministic builder rejects inputs", async () => {
    const user = userEvent.setup();
    const buildPaths = vi.fn(() => { throw new Error("private builder detail"); });
    render(<AdaptiveSetupFlow blueprint={flagshipBlueprint} buildPaths={buildPaths} createMutationId={() => "mutation-setup"} generate={vi.fn()} navigate={vi.fn()} now={() => new Date("2026-08-14T02:00:00.000Z")} onBackToRole={vi.fn()} registry={flagshipUnitRegistry} timeZone="Asia/Shanghai" />);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(buildPaths).toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("could not compare");
    expect(screen.queryByText("private builder detail")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByLabelText("Target weeks")).toBeEnabled();
  });

  it("computes each target result once and clears an unavailable scope after draft edits", async () => {
    const user = userEvent.setup();
    const canonical = vi.fn(buildLearningPaths);
    const buildPaths = vi.fn((input: Parameters<typeof buildLearningPaths>[0]) => {
      const result = canonical(input);
      return input.availability.weeklyMinutes === 420
        ? { ...result, targetDate: { ...result.fullScope, id: "path-target", scopeMode: "target-date" as const, deferredSkills: [{ skillId: "observability", reason: "target-date-advantage" as const }] } }
        : { ...result, targetDate: null, infeasibleReason: "The edited week cannot support the target-date scope." };
    });
    render(<AdaptiveSetupFlow blueprint={flagshipBlueprint} buildPaths={buildPaths} createMutationId={() => "mutation-setup"} generate={vi.fn()} navigate={vi.fn()} now={() => new Date("2026-08-14T02:00:00.000Z")} registry={flagshipUnitRegistry} timeZone="Asia/Shanghai" />);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(buildPaths).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("radio", { name: /Target date/i }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.clear(screen.getByLabelText("Monday minutes"));
    await user.type(screen.getByLabelText("Monday minutes"), "30");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(buildPaths).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("radio", { name: /Target date/i })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Target date/i })).toBeDisabled();
    expect(screen.getByText("The edited week cannot support the target-date scope.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("runs the real build preflight in observable promise-backed stages", async () => {
    const user = userEvent.setup();
    const pathWork = deferred<ReturnType<typeof buildLearningPaths>>();
    const scheduleWork = deferred<ReturnType<typeof buildPlanVersion>>();
    const saveWork = deferred<boolean>();
    let scheduleInput: PlanBuildInput | undefined;
    const preview = vi.fn(buildLearningPaths);
    const buildPathsForSubmit = vi.fn(() => pathWork.promise);
    const scheduleForSubmit = vi.fn((input: PlanBuildInput) => { scheduleInput = input; return scheduleWork.promise; });
    const generate = vi.fn(() => saveWork.promise);
    const navigate = vi.fn();
    render(<AdaptiveSetupFlow blueprint={flagshipBlueprint} buildPaths={preview} buildPathsForSubmit={buildPathsForSubmit} createMutationId={() => "mutation-staged"} generate={generate} navigate={navigate} now={() => new Date("2026-08-14T02:00:00.000Z")} registry={flagshipUnitRegistry} scheduleForSubmit={scheduleForSubmit} timeZone="Asia/Shanghai" />);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(preview).toHaveBeenCalledTimes(1);
    const previewResult = preview.mock.results[0]!.value;
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Build my path" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Building the learning path");
    expect(buildPathsForSubmit).toHaveBeenCalledTimes(1);
    expect(preview).toHaveBeenCalledTimes(1);

    pathWork.resolve(previewResult);
    expect(await screen.findByRole("status")).toHaveTextContent("Building the seven-day schedule");
    expect(scheduleForSubmit).toHaveBeenCalledTimes(1);
    scheduleWork.resolve(buildPlanVersion(scheduleInput!));
    expect(await screen.findByRole("status")).toHaveTextContent("Saving your plan");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
    saveWork.resolve(true);
    expect(await screen.findByText("Plan ready.")).toBeInTheDocument();
    expect(navigate).toHaveBeenCalledWith("/path");
  });

  it("contains a build preflight failure and never saves", async () => {
    const user = userEvent.setup();
    const generate = vi.fn();
    render(<AdaptiveSetupFlow blueprint={flagshipBlueprint} buildPathsForSubmit={vi.fn().mockRejectedValue(new Error("private path failure"))} createMutationId={() => "mutation-failed"} generate={generate} navigate={vi.fn()} now={() => new Date("2026-08-14T02:00:00.000Z")} registry={flagshipUnitRegistry} timeZone="Asia/Shanghai" />);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Build my path" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("answers are still editable");
    expect(screen.queryByText("private path failure")).not.toBeInTheDocument();
    expect(generate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Build my path" })).toBeEnabled();
  });
});
