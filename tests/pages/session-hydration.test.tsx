import { act, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodayPage from "../../app/today/page";
import PathPage from "../../app/path/page";
import HistoryPage from "../../app/history/page";
import SetupPage from "../../app/setup/page";

const mocks = vi.hoisted(() => ({ session: vi.fn(), push: vi.fn() }));
vi.mock("../../app/lib/auth-client", () => ({ authClient: {
  useSession: mocks.session, listAccounts: async () => ({ data: [] }),
} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }), usePathname: () => window.location.pathname,
}));
vi.mock("../../app/lib/use-arc-state", () => ({
  useArcState: () => ({ state: null, source: "restoring", recovery: "none" }),
}));
vi.mock("../../app/lib/use-research-eligibility", () => ({
  useResearchEligibility: () => ({ eligible: false, resolved: true }),
}));
vi.mock("../../app/lib/use-role-research", () => ({
  useRoleResearch: () => ({ run: null, error: null, planningData: null, restoring: false,
    recoveryUncertain: false, replacementPending: false, reset: vi.fn() }),
}));
vi.mock("../../app/lib/planning-history-client", () => ({
  planningHistoryClient: { list: async () => ({ goals: [], nextOffset: null }) },
}));

beforeEach(() => {
  localStorage.clear();
  mocks.session.mockReturnValue({ data: null, isPending: true });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
});
afterEach(() => {
  vi.unstubAllGlobals(); localStorage.clear(); window.history.replaceState(null, "", "/");
});

const pages = [
  { Page: TodayPage, route: "/today", pending: "正在恢复你的学习计划…", guest: "从今天的一项任务开始", signedIn: "正在恢复你的学习计划…" },
  { Page: PathPage, route: "/path", pending: "正在恢复你的学习计划…", guest: "你的下一步，有迹可循", signedIn: "正在恢复你的学习计划…" },
  { Page: HistoryPage, route: "/history?offset=20", pending: "正在确认登录…", guest: "回看走过的学习路线", signedIn: "历史学习计划" },
  { Page: SetupPage, route: "/setup?step=confirm", pending: "正在确认账户…", guest: "你想学习哪个岗位或方向？", signedIn: "你想学习哪个岗位或方向？" },
];

describe("page session hydration", () => {
  it.each(pages.flatMap(page => [false, true].map(signedIn => ({ ...page, authenticated: signedIn }))))(
    "hydrates $route when the session resolves early (authenticated=$authenticated)",
    async ({ Page, route, pending, guest, signedIn, authenticated }) => {
      window.history.replaceState(null, "", route);
      const container = document.createElement("div");
      container.innerHTML = renderToString(<Page />);
      expect(container).toHaveTextContent(pending);
      document.body.appendChild(container);
      // Another client boundary may resolve the shared auth store before this page hydrates.
      mocks.session.mockReturnValue({ isPending: false, data: authenticated
        ? { user: { id: "learner", name: "Learner", email: "learner@example.test" } } : null });
      const onRecoverableError = vi.fn();
      let root: Root | undefined;
      try {
        await act(async () => { root = hydrateRoot(container, <Page />, { onRecoverableError }); });
        expect(onRecoverableError).not.toHaveBeenCalled();
        expect(within(container).getByText(authenticated ? signedIn : guest)).toBeInTheDocument();
      } finally {
        await act(async () => root?.unmount());
        container.remove();
      }
    },
  );
});
