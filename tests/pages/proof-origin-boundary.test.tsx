import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProofPage from "../../app/proof/page";
import { createDemoState } from "../../app/lib/demo-store";

const injected = vi.hoisted(() => ({ planning: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname, useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession: () => ({ data: { user: { id: "owner", name: "Learner", email: "learner@example.test" } }, isPending: false }) } }));
vi.mock("../../app/lib/use-arc-state", () => ({ useArcState: () => ({ state: createDemoState(), source: "local", recovery: "none" }) }));
vi.mock("../../app/lib/use-planning-workspace", () => ({ usePlanningWorkspace: injected.planning }));
vi.mock("../../app/lib/use-proof-ledger", () => ({ useProofLedger: () => ({ workspace: null, projections: [], source: "local", recovery: "none" }) }));
vi.mock("../../app/components/brand/site-header", () => ({ SiteHeader: () => <header>Arc</header> }));
vi.mock("../../app/components/account/account-menu", () => ({ AccountMenu: () => <span>账号</span> }));
beforeEach(() => window.history.replaceState(null, "", "/proof?proof=missing&returnTo=%2Fstack%3Fskill%3Dtesting"));
afterEach(cleanup);

describe("Proof origin when the route is unreadable", () => {
  it.each([
    { name: "missing", cloudGoalMissing: true, source: "local", recovery: "none" },
    { name: "unavailable", cloudGoalMissing: false, source: "offline-cloud", recovery: "unavailable" },
    { name: "old version", cloudGoalMissing: false, source: "cloud", recovery: "version-unavailable" },
  ])("keeps a source exit when the planning workspace is $name", async (planning) => {
    injected.planning.mockReturnValue({ ...planning, workspace: null, sourceContext: null });
    render(<ProofPage />);
    expect(await screen.findByRole("link", { name: "返回原技能" })).toHaveAttribute("href", "/stack?skill=testing");
  });
});
