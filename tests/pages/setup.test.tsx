import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SetupPage from "../../app/setup/page";
import { flagshipRole } from "../../app/data/flagship-role";
import { completeDemoUnit, createDemoState, loadDemoState, saveDemoState } from "../../app/lib/demo-store";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
});

afterEach(cleanup);

describe("SetupPage", () => {
  it("updates setup answers without erasing completion history", async () => {
    const user = userEvent.setup();
    const existing = completeDemoUnit(createDemoState(), flagshipRole.today);
    saveDemoState(existing);
    render(<SetupPage />);

    await user.type(screen.getByRole("textbox", { name: "Custom role" }), "数据产品经理");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Advanced" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const minutes = screen.getByRole("spinbutton", { name: "Weekly minutes" });
    await user.clear(minutes);
    await user.type(minutes, "90");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const weeks = screen.getByRole("spinbutton", { name: "Target weeks" });
    await user.clear(weeks);
    await user.type(weeks, "10");
    await user.click(screen.getByRole("button", { name: "Build my path" }));

    const saved = loadDemoState();
    expect(saved.setup).toEqual({
      roleId: "数据产品经理",
      level: "advanced",
      weeklyMinutes: 90,
      targetWeeks: 10,
    });
    expect(saved.completedUnitIds).toEqual(existing.completedUnitIds);
    expect(saved.proofs).toEqual(existing.proofs);
    expect(push).toHaveBeenCalledWith("/path");
  });
});
