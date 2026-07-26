import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodayPage from "../../app/today/page";
import { createDemoState, mergeSetup, saveDemoState } from "../../app/lib/demo-store";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
});
afterEach(cleanup);

describe("TodayPage", () => {
  it("keeps the honest unit estimate and explains a weekly budget shortfall", async () => {
    saveDemoState(mergeSetup(createDemoState(), {
      roleId: "数据产品经理",
      level: "beginner",
      weeklyMinutes: 30,
      targetWeeks: 10,
    }));

    render(<TodayPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Restoring your plan");
    expect(screen.queryByText("45")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("数据产品经理 · 10 weeks")).toBeInTheDocument();
      expect(screen.getByText("45")).toBeInTheDocument();
      expect(screen.getByText(/本单元预计45分钟，超出当前每周30分钟预算15分钟/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /返回 Setup 调整预算/ })).toHaveAttribute("href", "/setup");
      expect(screen.getByText(/当前内容使用 AI 原生全栈旗舰样本/)).toBeInTheDocument();
      expect(screen.getByText(/Product Intelligence 后续研究并替换/)).toBeInTheDocument();
    });
    expect(screen.getByText("minutes")).toBeInTheDocument();
  });

  it("does not show sample or budget disclosures for the fitting flagship role", async () => {
    render(<TodayPage />);

    await screen.findByText("45");
    expect(screen.queryByText(/当前内容使用 AI 原生全栈旗舰样本/)).not.toBeInTheDocument();
    expect(screen.queryByText(/超出当前每周/)).not.toBeInTheDocument();
  });
});
