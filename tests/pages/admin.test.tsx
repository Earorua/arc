import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminPage, { AdminHealthView } from "../../app/admin/page";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const snapshot = {
  service: "degraded" as const,
  ai: { enabled: false, callsToday: 7, acceptedToday: 5, budgetUnitsToday: 5 },
  research: {
    queued: 1,
    researching: 0,
    validating: 1,
    ready: 2,
    needsReview: 1,
    failed: 1,
    reservedMicros: 1_200,
    settledMicros: 430,
    conservativeHoldMicros: 700,
  },
  migrations: { pending: 1, failed24h: 2, completed24h: 9 },
  failures: [{
    requestId: "00000000-0000-4000-8000-000000000009",
    route: "/api/workspace",
    code: "INTERNAL",
    occurredAt: "2026-07-28T00:00:00.000Z",
  }],
};

describe("Arc admin health view", () => {
  it.each([401, 403])("distinguishes login from missing permission (%s)", async status => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status })));
    render(<AdminPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(status === 401 ? "请登录后查看管理页面" : "当前账号没有管理权限");
    expect(screen.getByRole("link", { name: status === 401 ? "登录并返回" : "返回首页" })).toHaveAttribute("href", status === 401 ? "/sign-in?next=%2Fadmin&reauth=1" : "/");
  });
  it("shows five restrained read-only operational cards", () => {
    render(<AdminHealthView snapshot={snapshot} />);

    expect(screen.getByRole("heading", { name: "Service" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AI switch" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Usage" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Migrations" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent failures" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders aggregates and sanitized request diagnostics only", () => {
    const { container } = render(<AdminHealthView snapshot={snapshot} />);
    expect(screen.getByText("7 calls / 5 accepted")).toBeInTheDocument();
    expect(screen.getByText("1 pending / 2 failed / 9 completed")).toBeInTheDocument();
    expect(container.textContent).toContain("/api/workspace");
    expect(container.textContent).not.toMatch(/email|user id|role description|proof text|credential/i);
  });
});
