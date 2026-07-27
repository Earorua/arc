import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import PathPage from "../../app/path/page";
import { createDemoState, mergeSetup, saveDemoState } from "../../app/lib/demo-store";

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("PathPage", () => {
  it("shows the complete 18-week route in four editorial phases", async () => {
    render(<PathPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Restoring your plan");
    expect(screen.queryByText(/18 weeks/)).not.toBeInTheDocument();

    const heading = await screen.findByRole("heading", { name: "Your precise path." });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveAttribute("lang", "en");
    expect(screen.getByText("AI-Native Full-Stack Engineer · 18 weeks · 7 hours / week")).toBeInTheDocument();
    const phaseList = screen.getByRole("list", { name: "Learning phases" });
    const phaseItems = within(phaseList).getAllByRole("listitem");
    expect(phaseItems).toHaveLength(4);
    expect(phaseItems[0]).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Product Foundations")).toBeInTheDocument();
    expect(screen.getByText("Production Proof")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Learning workspace" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Path" })).toHaveAttribute("aria-current", "page");
  });

  it("hydrates a custom role, weekly budget, and proportional target path", async () => {
    saveDemoState(mergeSetup(createDemoState(), {
      roleId: "数据产品经理",
      level: "advanced",
      weeklyMinutes: 90,
      targetWeeks: 10,
    }));

    render(<PathPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Restoring your plan");
    expect(screen.queryByText(/18 weeks/)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("数据产品经理 · 10 weeks · 1 hour 30 minutes / week")).toBeInTheDocument();
    });
    expect(screen.getByText(/当前内容使用 AI 原生全栈旗舰样本/)).toBeInTheDocument();
    expect(screen.getByText(/Product Intelligence 后续研究并替换/)).toBeInTheDocument();

    const phaseList = screen.getByRole("list", { name: "Learning phases" });
    const phaseWeeks = within(phaseList).getAllByText(/weeks$/).map((item) => item.textContent);
    expect(phaseWeeks).toEqual(["2 weeks", "3 weeks", "3 weeks", "2 weeks"]);
  });
});
