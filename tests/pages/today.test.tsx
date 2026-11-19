import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodayPage from "../../app/today/page";
import { createDemoState, mergeSetup, saveDemoState } from "../../app/lib/demo-store";
import { flagshipRole } from "../../app/data/flagship-role";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
const { usePlanningWorkspace } = vi.hoisted(() => ({ usePlanningWorkspace: vi.fn(() => ({ workspace: null, source: "local", migration: "none", recovery: "none", generate: vi.fn(), record: vi.fn(), accept: vi.fn(), discard: vi.fn(), importLocal: vi.fn(), dismissMigration: vi.fn(), retry: vi.fn() })) }));
vi.mock("../../app/lib/use-planning-workspace", () => ({ usePlanningWorkspace }));
vi.mock("../../app/lib/use-arc-state", async (original) => {
  const actual = await original<typeof import("../../app/lib/use-arc-state")>();
  return { ...actual, useArcState: () => actual.useArcState({ useSession: () => ({ data: null, isPending: false }) }) };
});
vi.mock("../../app/components/account/account-menu", () => ({ AccountMenu: () => <span>Account</span> }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }), usePathname: () => window.location.pathname,
}));

vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "local-owner", name: "Learner", email: "learner@example.test" } }, isPending: false }) },
}));

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TodayPage", () => {
  it("keeps the honest unit estimate and explains a weekly budget shortfall", async () => {
    usePlanningWorkspace.mockClear();
    saveDemoState(mergeSetup(createDemoState(), {
      roleId: "数据产品经理",
      level: "beginner",
      weeklyMinutes: 30,
      targetWeeks: 10,
    }));

    render(<TodayPage />);

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.queryByText("45")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("数据产品经理 · 10 weeks")).toBeInTheDocument();
      expect(screen.getByText("45")).toBeInTheDocument();
      expect(screen.getByText(/This unit takes about 45 min, exceeding your weekly budget of 30 min by 15 min/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Adjust study time/ })).toHaveAttribute("href", "/setup?mode=edit&section=time");
      expect(screen.getByText(/This path currently uses the AI-native full-stack sample/)).toBeInTheDocument();
      expect(screen.getByText(/Role research will replace it/)).toBeInTheDocument();
    });
    expect(screen.getByText("min")).toBeInTheDocument();
    expect(usePlanningWorkspace).toHaveBeenCalled();
  });

  it("does not show sample or budget disclosures for the fitting flagship role", async () => {
    render(<TodayPage />);

    await screen.findByText("45");
    expect(screen.queryByText(/This path currently uses the AI-native full-stack sample/)).not.toBeInTheDocument();
    expect(screen.queryByText(/exceeding your weekly budget/)).not.toBeInTheDocument();
  });

  it("stays on Today and restores retry when completion cannot be saved", async () => {
    const user = userEvent.setup();
    render(<TodayPage />);
    await screen.findByText("45");
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    for (const step of flagshipRole.today.steps) {
      await user.click(screen.getByRole("checkbox", { name: step.label }));
    }
    const button = screen.getByRole("button", { name: "Complete task" });
    await user.click(button);

    expect(screen.getByRole("alert")).toHaveTextContent("Your progress could not be saved");
    expect(push).not.toHaveBeenCalled();
    expect(button).toBeEnabled();

    setItem.mockRestore();
    await user.click(button);

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /Add proof/ }).getAttribute("href")).toContain("compose=1");
    expect(button).toBeDisabled();
    const stored = JSON.parse(window.localStorage.getItem("arc-demo-state-v1") ?? "{}") as {
      proofs?: Array<{ verified?: boolean }>;
    };
    expect(stored.proofs?.[0]?.verified).toBe(false);
  });

  it("does not fall back to a legacy lesson when the adaptive catalogue version is unavailable", async () => {
    usePlanningWorkspace.mockReturnValue({
      workspace: null,
      source: "offline-cloud",
      migration: "none",
      recovery: "version-unavailable",
      generate: vi.fn(),
      record: vi.fn(),
      accept: vi.fn(),
      discard: vi.fn(),
      importLocal: vi.fn(),
      dismissMigration: vi.fn(),
      retry: vi.fn(),
    });

    render(<TodayPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("This plan is temporarily unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("Your plan and learning history are preserved");
    expect(screen.queryByText("45")).not.toBeInTheDocument();
  });

  it.each([
    ["restoring", "none"],
    ["offline-cloud", "unavailable"],
  ] as const)("does not expose legacy completion while adaptive cloud state is %s", async (source, recovery) => {
    const retry = vi.fn();
    usePlanningWorkspace.mockReturnValue({
      workspace: null,
      source,
      migration: "none",
      recovery,
      generate: vi.fn(),
      record: vi.fn(),
      accept: vi.fn(),
      discard: vi.fn(),
      importLocal: vi.fn(),
      dismissMigration: vi.fn(),
      retry,
    });

    render(<TodayPage />);

    expect(await screen.findByText(source === "restoring" ? "Loading your learning content…" : "Learning plan unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete task" })).not.toBeInTheDocument();
    expect(screen.queryByText("45")).not.toBeInTheDocument();
    if (source === "offline-cloud") {
      await userEvent.click(screen.getByRole("button", { name: /Reload plan/ }));
      expect(retry).toHaveBeenCalledTimes(1);
    }
  });
});
