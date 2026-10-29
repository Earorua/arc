import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { LearningEntry } from "../../app/components/account/learning-entry";
import { HomeLearningAction } from "../../app/components/brand/home-learning-action";
import { ArcApiError } from "../../app/lib/cloud-client";
import { firstCreationAttemptSchema, legacyDraftSchema, writeSetupDraft } from "../../app/components/setup/setup-draft";

const mocks = vi.hoisted(() => ({ session: vi.fn(), load: vi.fn(), planning: vi.fn(), refetch: vi.fn() }));
vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession: mocks.session } }));
vi.mock("../../app/lib/cloud-client", async original => ({ ...await original<typeof import("../../app/lib/cloud-client")>(), arcCloudClient: { loadWorkspace: mocks.load } }));
vi.mock("../../app/lib/planning-client", () => ({ planningClient: { loadWorkspace: mocks.planning } }));
const draft = { step: 1, customRole: "", answers: { roleId: "ai-native-full-stack-engineer", level: "beginner", weeklyMinutes: 420, targetWeeks: 18 },
  source: { source: "flagship", roleId: "ai-native-full-stack-engineer" }, adaptiveSelected: true, adaptiveStarted: true } as const;
const tree = () => <LearningEntry><HomeLearningAction /><HomeLearningAction /></LearningEntry>;
const signedIn = (id = "learner") => mocks.session.mockReturnValue({ data: { user: { id } }, isPending: false, refetch: mocks.refetch });
beforeEach(() => { localStorage.clear(); mocks.load.mockReset().mockResolvedValue(null); mocks.planning.mockReset(); mocks.refetch.mockReset(); mocks.session.mockReturnValue({ data: null, isPending: false, refetch: mocks.refetch }); });
afterEach(cleanup);

describe("public learning entry", () => {
  it("offers a guest one destination without writing device data or loading account data", async () => {
    const write = vi.spyOn(Storage.prototype, "setItem");
    render(tree());
    for (const link of await screen.findAllByRole("link", { name: "创建学习路线" })) expect(link).toHaveAttribute("href", "/setup");
    expect(mocks.load).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); write.mockRestore();
  });
  it("resumes a validated guest draft", async () => {
    writeSetupDraft("guest", "flow", legacyDraftSchema, draft);
    render(tree());
    for (const link of await screen.findAllByRole("link", { name: "继续设置" })) expect(link).toHaveAttribute("href", "/setup");
  });
  it("does not reuse another account's or guest's draft", async () => {
    signedIn(); writeSetupDraft("guest", "flow", legacyDraftSchema, draft); writeSetupDraft("user:other", "flow", legacyDraftSchema, draft);
    render(tree());
    expect(await screen.findAllByRole("link", { name: "创建学习路线" })).toHaveLength(2);
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it("resumes the current account's draft only after confirming there is no saved route", async () => {
    signedIn(); writeSetupDraft("user:learner", "flow", legacyDraftSchema, draft);
    render(tree());
    expect(await screen.findAllByRole("link", { name: "继续设置" })).toHaveLength(2);
  });
  it("continues an existing route even if a new-goal draft was left behind", async () => {
    signedIn(); mocks.load.mockResolvedValue({ activeGoalId: "goal-current" });
    writeSetupDraft("user:learner", "flow", legacyDraftSchema, draft);
    render(tree());
    for (const link of await screen.findAllByRole("link", { name: "继续学习" })) expect(link).toHaveAttribute("href", "/today");
    expect(screen.queryByRole("link", { name: "创建学习路线" })).not.toBeInTheDocument();
  });
  it.each([false, true])("checks whether a pending first route has actually finished (finished: %s)", async finished => {
    signedIn(); mocks.load.mockResolvedValue({ activeGoalId: "goal-current" }); mocks.planning.mockResolvedValue({ workspace: finished ? { goalId: "goal-current" } : null });
    writeSetupDraft("user:learner", "flow", legacyDraftSchema, draft);
    writeSetupDraft("user:learner", "first-creation", firstCreationAttemptSchema, { mutationId: "mutation-test", activationId: "activation-test", source: draft.source, setup: draft.answers, goalId: "goal-current", phase: "generate" });
    render(tree());
    for (const link of await screen.findAllByRole("link", { name: finished ? "继续学习" : "继续设置" })) expect(link).toHaveAttribute("href", finished ? "/today" : "/setup?mode=create");
  });
  it.each([null, { activeGoalId: "goal-current" }])("recovers an uncertain activation without treating its snapshot as a finished route (%s)", async snapshot => {
    signedIn(); mocks.load.mockResolvedValue(snapshot);
    writeSetupDraft("user:learner", "flow", legacyDraftSchema, draft);
    writeSetupDraft("user:learner", "first-creation", firstCreationAttemptSchema, { mutationId: "mutation-test", activationId: "activation-test", source: draft.source, setup: draft.answers, phase: "activation" });
    render(tree());
    for (const link of await screen.findAllByRole("link", { name: "继续设置" })) expect(link).toHaveAttribute("href", "/setup?mode=create");
    expect(mocks.planning).not.toHaveBeenCalled();
  });
  it.each(["other-account", "session-pending"])("does not restore an old creation decision after an account roundtrip through %s", async transition => {
    signedIn("a"); const view = render(tree());
    await screen.findAllByRole("link", { name: "创建学习路线" });
    mocks.load.mockImplementation(() => new Promise(() => {}));
    if (transition === "other-account") signedIn("b");
    else mocks.session.mockReturnValue({ data: { user: { id: "a" } }, isPending: true });
    view.rerender(tree());
    signedIn("a"); view.rerender(tree());
    expect(screen.queryByRole("link", { name: "创建学习路线" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "正在读取学习状态…" })).toHaveLength(2);
  });
  it("shows retry, never create, after an account read fails", async () => {
    signedIn(); mocks.load.mockRejectedValueOnce(Error("offline"));
    render(tree());
    const retry = (await screen.findAllByRole("button", { name: "重新读取学习状态" }))[0];
    expect(screen.queryByRole("link", { name: "创建学习路线" })).not.toBeInTheDocument();
    await userEvent.click(retry);
    expect(await screen.findAllByRole("link", { name: "创建学习路线" })).toHaveLength(2);
  });
  it("offers sign-in rather than creation when the session expires", async () => {
    signedIn(); mocks.load.mockRejectedValue(new ArcApiError(401, "unauthorized", "expired", "request-test"));
    render(tree());
    for (const link of await screen.findAllByRole("link", { name: "重新登录" })) expect(link).toHaveAttribute("href", "/sign-in?next=%2Ftoday&reauth=1");
    expect(screen.queryByRole("link", { name: "创建学习路线" })).not.toBeInTheDocument();
  });
  it("bounds a stalled read and lets the learner retry", async () => {
    vi.useFakeTimers();
    try {
      signedIn(); mocks.load.mockImplementation(() => new Promise(() => {}));
      render(tree());
      await act(async () => { await vi.advanceTimersByTimeAsync(8001); });
      expect(screen.getAllByRole("button", { name: "重新读取学习状态" })).toHaveLength(2);
      expect((mocks.load.mock.calls[0][0] as AbortSignal).aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it("ignores an aborted read after changing accounts", async () => {
    signedIn("a"); let resolveA!: (value: unknown) => void;
    mocks.load.mockImplementationOnce(() => new Promise(resolve => { resolveA = resolve; }));
    const view = render(tree());
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    const signal = mocks.load.mock.calls[0][0] as AbortSignal;
    signedIn("b"); view.rerender(tree());
    expect(await screen.findAllByRole("link", { name: "创建学习路线" })).toHaveLength(2);
    await act(async () => resolveA({ activeGoalId: "a-private-goal" }));
    expect(signal.aborted).toBe(true); expect(screen.queryByRole("link", { name: "继续学习" })).not.toBeInTheDocument();
  });
  it.each(["resolved", "error"])("keeps hydration consistent when the browser session is %s before hydration", async state => {
    mocks.session.mockReturnValue({ data: null, isPending: true });
    const container = document.createElement("div"); container.innerHTML = renderToString(tree()); document.body.appendChild(container);
    signedIn(); mocks.load.mockResolvedValue({ activeGoalId: "goal-current" }); const onRecoverableError = vi.fn();
    if (state === "error") mocks.session.mockReturnValue({ data: null, isPending: false, error: Error("offline"), refetch: mocks.refetch });
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => { root = hydrateRoot(container, tree(), { onRecoverableError }); });
    expect(await screen.findAllByRole(state === "resolved" ? "link" : "button", { name: state === "resolved" ? "继续学习" : "重新读取学习状态" })).toHaveLength(2);
    expect(onRecoverableError).not.toHaveBeenCalled();
    await act(async () => root.unmount()); container.remove();
  });
});
