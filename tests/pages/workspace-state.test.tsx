import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProofPage from "../../app/proof/page";
import StackPage from "../../app/stack/page";
import { createDemoState, mergeSetup, saveDemoState } from "../../app/lib/demo-store";

vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

const customSetup = {
  roleId: "数据产品经理",
  level: "advanced" as const,
  weeklyMinutes: 90,
  targetWeeks: 10,
};

describe("personalized workspace state", () => {
  it.each([
    ["Stack", StackPage],
    ["Proof", ProofPage],
  ])("restores the custom role consistently on %s", async (_, Page) => {
    saveDemoState(mergeSetup(createDemoState(), customSetup));
    render(<Page />);

    expect(screen.getByRole("status")).toHaveTextContent("Restoring your plan");
    expect(screen.queryByText(/18 weeks/)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("数据产品经理 · 10 weeks")).toBeInTheDocument();
      expect(screen.getByText(/当前内容使用 AI 原生全栈旗舰样本/)).toBeInTheDocument();
      expect(screen.getByText(/Product Intelligence 后续研究并替换/)).toBeInTheDocument();
    });
  });
});
