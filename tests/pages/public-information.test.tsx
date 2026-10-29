import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import IntelligencePage from "../../app/intelligence/page";
import MethodPage from "../../app/method/page";

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("next/navigation", () => ({ redirect, usePathname: () => "/method" }));
vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));

afterEach(cleanup);

describe("public trust pages", () => {
  it("explains one concrete example from learning decisions through a task to inspectable evidence", () => {
    render(<MethodPage />);
    expect(screen.getByRole("heading", { level: 1, name: "把目标，变成每天可完成的一步" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "如何判断学什么" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "如何安排今天" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "如何确认学会" })).toBeInTheDocument();
    const main = within(screen.getByRole("main"));
    expect(main.getByText("AI 原生全栈工程师")).toBeInTheDocument();
    expect(main.getByText("把一次表单提交变成可验证的服务端动作")).toBeInTheDocument();
    expect(main.getByText(/45 分钟/)).toBeInTheDocument();
    expect(main.getByRole("link", { name: "查看完整样例" })).toHaveAttribute("href", "/showcase?view=path");
    expect(main.queryByRole("link", { name: /创建.*路线/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "学习方法" })).toHaveAttribute("aria-current", "page");
  });

  it("redirects the retired public intelligence page to the account skill workspace", () => {
    expect(() => IntelligencePage()).toThrow("redirect:/stack");
    expect(redirect).toHaveBeenCalledWith("/stack");
  });
});
