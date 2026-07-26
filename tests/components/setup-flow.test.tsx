import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetupFlow } from "../../app/components/setup/setup-flow";

afterEach(cleanup);

describe("SetupFlow", () => {
  it("submits the flagship setup answers", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<SetupFlow onComplete={onComplete} />);

    await user.click(screen.getByRole("button", { name: "AI 原生全栈工程师" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Beginner" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.clear(screen.getByLabelText("Weekly minutes"));
    await user.type(screen.getByLabelText("Weekly minutes"), "420");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.clear(screen.getByLabelText("Target weeks"));
    await user.type(screen.getByLabelText("Target weeks"), "18");
    await user.click(screen.getByRole("button", { name: "Build my path" }));

    expect(onComplete).toHaveBeenCalledWith({
      roleId: "ai-native-full-stack-engineer",
      level: "beginner",
      weeklyMinutes: 420,
      targetWeeks: 18,
    });
  });

  it("submits an arbitrary custom role", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<SetupFlow onComplete={onComplete} />);

    await user.type(screen.getByLabelText("Custom role"), "数据产品经理");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Beginner" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Build my path" }));

    expect(onComplete).toHaveBeenCalledWith({
      roleId: "数据产品经理",
      level: "beginner",
      weeklyMinutes: 420,
      targetWeeks: 18,
    });
  });
});
