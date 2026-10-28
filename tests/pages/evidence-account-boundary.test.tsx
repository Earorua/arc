import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProofPage from "../../app/proof/page";
import StackPage from "../../app/stack/page";
import { createDemoState } from "../../app/lib/demo-store";

const injected = vi.hoisted(() => ({ pending: false, arc: vi.fn(), planning: vi.fn(), proof: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname, useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession: () => ({ data: null, isPending: injected.pending }) } }));
vi.mock("../../app/lib/use-arc-state", () => ({ useArcState: injected.arc }));
vi.mock("../../app/lib/use-planning-workspace", () => ({ usePlanningWorkspace: injected.planning }));
vi.mock("../../app/lib/use-proof-ledger", () => ({ useProofLedger: injected.proof }));
vi.mock("../../app/components/brand/site-header", () => ({ SiteHeader: () => <header>Arc</header> }));
beforeEach(() => {
  injected.pending = false; localStorage.clear(); localStorage.setItem("device-record", "keep");
  injected.arc.mockReturnValue({ state: createDemoState(), source: "local", recovery: "none" });
  injected.planning.mockReturnValue({ workspace: null, source: "local", recovery: "none" });
  injected.proof.mockReturnValue({ workspace: null, projections: [], source: "local", recovery: "none" });
});
afterEach(cleanup);

describe("evidence account boundary", () => {
  it.each([{ Page: StackPage, path: "/stack?skill=react&category=frontend" }, { Page: ProofPage, path: "/proof?compose=1&unit=owned-unit&returnTo=%2Ftoday" }])("keeps $path behind a contextual login with an honest preview route", async ({ Page, path }) => {
    window.history.replaceState(null, "", path);
    render(<Page />);
    expect(await screen.findByRole("link", { name: "登录并继续" })).toHaveAttribute("href", `/sign-in?next=${encodeURIComponent(path)}`);
    expect(screen.getByRole("link", { name: "先看公开样例" })).toHaveAttribute("href", "/showcase");
    expect(injected.arc).not.toHaveBeenCalled();
    expect(injected.planning).not.toHaveBeenCalled();
    expect(injected.proof).not.toHaveBeenCalled();
    expect(localStorage.getItem("device-record")).toBe("keep");
  });
  it.each([StackPage, ProofPage])("does not load private evidence while the session is unresolved", (Page) => {
    injected.pending = true;
    render(<Page />);
    expect(screen.getByRole("status")).toHaveTextContent("正在确认账号");
    expect(injected.arc).not.toHaveBeenCalled();
    expect(injected.proof).not.toHaveBeenCalled();
  });
});
