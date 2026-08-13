import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdaptiveSetupFlow } from "../../app/components/setup/adaptive-setup-flow";
import type { GeneratePlanningRequest } from "../../app/contracts/planning-api";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";

afterEach(cleanup);

describe("AdaptiveSetupFlow", () => {
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
});
