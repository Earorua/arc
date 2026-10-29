import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ShowcasePage from "../../app/showcase/page";

vi.mock("next/navigation", () => ({ usePathname: () => "/showcase" }));
vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession: () => ({ data: null, isPending: false }) } }));

beforeEach(() => { localStorage.clear(); window.history.replaceState(null, "", "/showcase"); });
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

describe("public learning sample", () => {
  it("opens directly to a shareable view and makes the sample identity clear", async () => {
    window.history.replaceState(null, "", "/showcase?view=today");
    render(<ShowcasePage />);
    expect(screen.getByRole("heading", { level: 1, name: "看看一条学习路线如何推进" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /今日任务/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("把一次表单提交变成可验证的服务端动作");
    expect(screen.getByText(/公开样例，不是你的计划/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "产品样例" })).toHaveAttribute("aria-current", "page");
    const intro = screen.getByRole("region", { name: "看看一条学习路线如何推进" });
    expect(within(intro).queryByRole("link")).not.toBeInTheDocument();
    expect(await screen.findAllByRole("link", { name: "创建学习路线" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "创建学习路线" })).toHaveAttribute("href", "/setup");
  });

  it("writes the selected view to the URL and restores it on browser Back and remount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ShowcasePage />);
    await user.click(screen.getByRole("tab", { name: /今日任务/ }));
    expect(new URLSearchParams(window.location.search).get("view")).toBe("today");
    await user.click(screen.getByRole("tab", { name: /作品/ }));
    expect(new URLSearchParams(window.location.search).get("view")).toBe("proof");
    await act(async () => window.history.back());
    await waitFor(() => expect(screen.getByRole("tab", { name: /今日任务/ })).toHaveAttribute("aria-selected", "true"));
    unmount(); render(<ShowcasePage />);
    expect(screen.getByRole("tab", { name: /今日任务/ })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps keyboard focus, panel relationships, and URL selection aligned", async () => {
    render(<ShowcasePage />);
    const path = screen.getByRole("tab", { name: /路线/ });
    path.focus();
    await userEvent.keyboard("{ArrowRight}");
    const today = screen.getByRole("tab", { name: /今日任务/ });
    expect(today).toHaveFocus();
    expect(today).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", today.id);
    expect(new URLSearchParams(window.location.search).get("view")).toBe("today");
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: /作品/ })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(path).toHaveFocus();
  });

  it("falls back to the route sample for an unknown view without touching device data", () => {
    window.history.replaceState(null, "", "/showcase?view=private-account");
    const save = vi.spyOn(Storage.prototype, "setItem");
    render(<ShowcasePage />);
    expect(screen.getByRole("tab", { name: /路线/ })).toHaveAttribute("aria-selected", "true");
    expect(save).not.toHaveBeenCalled();
    save.mockRestore();
  });
});
