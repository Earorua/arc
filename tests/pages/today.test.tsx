import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodayPage from "../../app/today/page";
import { createDemoState, mergeSetup, saveDemoState } from "../../app/lib/demo-store";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("TodayPage", () => {
  it("hydrates the saved role and caps the session to a small weekly budget", async () => {
    saveDemoState(mergeSetup(createDemoState(), {
      roleId: "数据产品经理",
      level: "beginner",
      weeklyMinutes: 30,
      targetWeeks: 10,
    }));

    render(<TodayPage />);

    await waitFor(() => {
      expect(screen.getByText("数据产品经理 · 10 weeks")).toBeInTheDocument();
      expect(screen.getByText("30")).toBeInTheDocument();
    });
    expect(screen.getByText("minutes")).toBeInTheDocument();
  });
});
