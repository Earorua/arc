import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SetupPage from "../../app/setup/page";
import type { ResearchRunPublicView } from "../../app/contracts/research";
import { RoleResearchPanel } from "../../app/components/setup/role-research-panel";
import { SetupFlow } from "../../app/components/setup/setup-flow";
import { createResearchClient, ResearchClientError, type ResearchClient } from "../../app/lib/research-client";
import { createKnownResearchRecovery, createPendingResearchRecovery, RESEARCH_RECOVERY_STORAGE_KEY, saveResearchRecovery } from "../../app/lib/research-recovery-storage";
import { useRoleResearch } from "../../app/lib/use-role-research";

const pageMocks = vi.hoisted(() => ({ push: vi.fn(), saveSetup: vi.fn(async () => true) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pageMocks.push }) }));
vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "owner-a" } }, isPending: false }) },
}));
vi.mock("../../app/lib/use-research-eligibility", () => ({
  useResearchEligibility: () => ({ eligible: false }),
}));
vi.mock("../../app/lib/use-arc-state", () => ({
  useArcState: () => ({ state: null, recovery: "none", saveSetup: pageMocks.saveSetup }),
}));
vi.mock("../../app/lib/use-planning-workspace", () => ({
  usePlanningWorkspace: () => ({ preflightCurrentSetup: vi.fn(), retry: vi.fn(), generate: vi.fn() }),
}));

const oldInput = { role: "Data Product Manager", locale: "en-US" as const };
const backgroundGuidance = "研究已在后台运行。你可以离开此页面，稍后回来查看进度。";
const pending = { kind: "start" as const, mutationId: "mutation-old", ...oldInput };
const active = (role: string): ResearchRunPublicView => ({
  id: "research-run-new", role, locale: "en-US", state: "researching", retryable: false, backgroundAccepted: false,
});
const response = (run: ResearchRunPublicView) => ({ run, requestId: "request-safe", error: null });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function client(overrides: Partial<ResearchClient> = {}): ResearchClient {
  return {
    startResearch: vi.fn(async (input) => response(active(input.role))),
    getResearch: vi.fn(async () => response(active(oldInput.role))),
    retryResearch: vi.fn(async () => response(active(oldInput.role))),
    recoverResearch: vi.fn(async () => { throw new ResearchClientError("NOT_FOUND"); }),
    ...overrides,
  };
}
function RecoverySetup({ researchClient, eligible }: { researchClient: ResearchClient; eligible: boolean }) {
  const research = useRoleResearch({ userId: "owner-a", eligible, active: true, client: researchClient,
    createMutationId: () => "mutation-new" });
  const recoveryAvailable = research.restoring || research.run !== null || research.error !== null
    || research.recoveryUncertain || research.replacementPending;
  return <SetupFlow onComplete={vi.fn()} signedIn researchEligible={eligible}
    researchRecoveryAvailable={recoveryAvailable} onRoleChange={research.reset}
    renderResearch={({ role, onFlagship }) => <RoleResearchPanel controller={research} role={role} eligible={eligible}
      onStart={() => void research.start({ role, locale: "en-US" })} onUse={vi.fn()} onFlagship={onFlagship} />} />;
}

beforeEach(() => {
  localStorage.clear();
  saveResearchRecovery(localStorage, createPendingResearchRecovery("owner-a", pending));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Setup research recovery interaction", () => {
  it("recovers a dropped initial POST after remount using its original mutation and then announces acceptance", async () => {
    localStorage.clear(); // This case must submit first, rather than recover the beforeEach seed.
    const original = { ...oldInput, mutationId: "mutation-new" };
    const accepted: ResearchRunPublicView = { ...active(oldInput.role), state: "queued", retryable: false, backgroundAccepted: true };
    const recovery = deferred<Response>();
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (url === "/api/intelligence/research") throw new TypeError("synthetic lost POST response");
      if (url === "/api/intelligence/research/recover") return recovery.promise;
      throw new Error("Unexpected automatic request");
    });
    const researchClient = createResearchClient({ fetch: fetcher });
    const first = render(<RecoverySetup researchClient={researchClient} eligible />);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("自定义岗位"), { target: { value: oldInput.role } });
    const start = screen.getByRole("button", { name: "研究这个岗位" });
    start.focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(await screen.findByText("上一次研究的状态尚未确认。")).toBeInTheDocument();
    expect(screen.queryByText(backgroundGuidance)).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual(original);
    const persisted = localStorage.getItem(RESEARCH_RECOVERY_STORAGE_KEY);
    expect(JSON.parse(persisted!)).toEqual(createPendingResearchRecovery("owner-a", { kind: "start", ...original }));
    first.unmount();
    expect(localStorage.getItem(RESEARCH_RECOVERY_STORAGE_KEY)).toBe(persisted);

    render(<RecoverySetup researchClient={researchClient} eligible />);
    expect(await screen.findByRole("heading", { level: 2, name: "正在查询上一次研究…" })).toBeInTheDocument();
    expect(screen.queryByText(backgroundGuidance)).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/intelligence/research", "/api/intelligence/research/recover",
    ]);
    expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string)).toEqual({ kind: "start", ...original });
    await act(async () => { recovery.resolve(Response.json({ run: accepted, requestId: "request-recovered" }, { status: 200 })); });
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("研究已排队");
    expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();
    expect(JSON.parse(localStorage.getItem(RESEARCH_RECOVERY_STORAGE_KEY)!)).toEqual(createKnownResearchRecovery("owner-a", {
      runId: accepted.id, role: accepted.role, locale: accepted.locale,
    }));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).not.toHaveTextContent(/mutation-new|owner-a|research-run-new|executor|OpenRouter|model|token/i);
    expect(screen.getByRole("status")).toHaveTextContent(backgroundGuidance);
  });

  it("keeps an ambiguous POST response pending without claiming accepted background work", async () => {
    localStorage.clear();
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ backgroundAccepted: true, requestId: "request-ambiguous" }));
    render(<RecoverySetup researchClient={createResearchClient({ fetch: fetcher })} eligible />);
    fireEvent.change(screen.getByLabelText("自定义岗位"), { target: { value: oldInput.role } });
    await userEvent.setup().click(screen.getByRole("button", { name: "研究这个岗位" }));
    expect(await screen.findByText("上一次研究的状态尚未确认。")).toBeInTheDocument();
    expect(screen.queryByText(backgroundGuidance)).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(RESEARCH_RECOVERY_STORAGE_KEY)!)).toEqual(createPendingResearchRecovery("owner-a", {
      kind: "start", ...oldInput, mutationId: "mutation-new",
    }));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "查询研究状态" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "重试研究" })).not.toBeInTheDocument();
  });

  it("announces and focuses a manual query for a lost Retry while its failed source remains visible", async () => {
    localStorage.clear();
    saveResearchRecovery(localStorage, createKnownResearchRecovery("owner-a", {
      runId: "research-run-old", role: oldInput.role, locale: oldInput.locale,
    }));
    const failed: ResearchRunPublicView = { id: "research-run-old", ...oldInput, state: "failed",
      failureCategory: "timeout", retryable: true, backgroundAccepted: false };
    const recovered: ResearchRunPublicView = { ...failed, id: "research-run-successor" };
    const recovery = deferred<ReturnType<typeof response>>();
    const researchClient = client({
      getResearch: vi.fn(async () => response(failed)),
      retryResearch: vi.fn(async () => { throw new ResearchClientError("RESEARCH_UNAVAILABLE"); }),
      recoverResearch: vi.fn(() => recovery.promise),
    });
    render(<RecoverySetup researchClient={researchClient} eligible />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "重试研究" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "查询研究状态" })).toBeEnabled());

    await userEvent.setup().click(screen.getByRole("button", { name: "查询研究状态" }));

    await waitFor(() => expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("正在查询上一次研究…"));
    expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();
    expect(researchClient.recoverResearch).toHaveBeenCalledTimes(1);
    expect(researchClient.retryResearch).toHaveBeenCalledTimes(1);
    await act(async () => { recovery.resolve(response(recovered)); await recovery.promise; });
  });
  it("keeps SetupPage recovery visible when an ineligible owner edits the role", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/intelligence/research/recover");
      expect(JSON.parse(String(init?.body))).toEqual(pending);
      return Response.json({ error: { code: "NOT_FOUND", message: "Research run was not found." }, requestId: "request-page" },
        { status: 404, headers: { "x-request-id": "request-page" } });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<SetupPage />);
    expect(await screen.findByText("上一次研究的状态尚未确认。")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("自定义岗位"), { target: { value: "Security Engineer" } });

    expect(screen.getByText("上一次研究的状态尚未确认。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查询研究状态" })).toBeEnabled();
    await userEvent.setup().click(screen.getByRole("button", { name: "查询研究状态" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });
  it("keeps an uncertain pending submission visible and queryable across ineligible role edits", async () => {
    const researchClient = client();
    render(<RecoverySetup researchClient={researchClient} eligible={false} />);
    expect(await screen.findByText("上一次研究的状态尚未确认。")).toBeInTheDocument();
    expect(researchClient.recoverResearch).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("自定义岗位"), { target: { value: "Security Engineer" } });
    expect(screen.getByText("上一次研究的状态尚未确认。")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(RESEARCH_RECOVERY_STORAGE_KEY)!)).toMatchObject({ recovery: pending });
    await userEvent.setup().click(screen.getByRole("button", { name: "查询研究状态" }));
    await waitFor(() => expect(researchClient.recoverResearch).toHaveBeenCalledTimes(2));
    expect(researchClient.startResearch).not.toHaveBeenCalled();
    expect(researchClient.retryResearch).not.toHaveBeenCalled();
  });

  it("stages, cancels, and explicitly confirms replacement without losing the old pending identity", async () => {
    const researchClient = client();
    render(<RecoverySetup researchClient={researchClient} eligible />);
    expect(await screen.findByText("上一次研究的状态尚未确认。")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("自定义岗位"), { target: { value: "Security Engineer" } });

    await userEvent.setup().click(screen.getByRole("button", { name: "研究这个岗位" }));
    expect(researchClient.startResearch).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(RESEARCH_RECOVERY_STORAGE_KEY)!)).toMatchObject({ recovery: pending });
    await userEvent.setup().click(screen.getByRole("button", { name: "继续查询上一次研究" }));
    expect(researchClient.recoverResearch).toHaveBeenCalledTimes(1);
    expect(researchClient.startResearch).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getByRole("button", { name: "研究这个岗位" }));
    await userEvent.setup().click(screen.getByRole("button", { name: "发起新的研究" }));
    await waitFor(() => expect(researchClient.startResearch).toHaveBeenCalledTimes(1));
    expect(researchClient.startResearch).toHaveBeenCalledWith({ role: "Security Engineer", locale: "en-US", mutationId: "mutation-new" }, expect.any(AbortSignal));
    expect(researchClient.retryResearch).not.toHaveBeenCalled();
  });
});
