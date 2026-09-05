import { act, cleanup, renderHook } from "@testing-library/react";
import { startTransition, Suspense, useLayoutEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchRunPublicView } from "../../app/contracts/research";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { createResearchClient, type ResearchClient } from "../../app/lib/research-client";
import { useRoleResearch } from "../../app/lib/use-role-research";

const key = "arc:role-research:v1";
const input = { role: "Data Product Manager", locale: "en-US" as const };
const identity = { runId: "research-run-1", ...input };
const active: ResearchRunPublicView = { id: identity.runId, ...input, state: "researching", retryable: false };
const failed: ResearchRunPublicView = { ...active, state: "failed", retryable: true, failureCategory: "timeout" };
const needsReview: ResearchRunPublicView = { ...active, state: "needs-review", retryable: true, quality: { issueCodes: ["missing-unit"], skillCount: 3, sourceCount: 6, unitCount: 2 } };
const ready: ResearchRunPublicView = {
  ...active, state: "ready", packageId: "research-package-1", summary: flagshipBlueprint.summary,
  skillCount: flagshipBlueprint.skills.length, sourceCount: flagshipBlueprint.resources.length,
  observedAt: "2026-09-05", quality: { passed: true, issueCodes: [] },
  planningData: { id: "research-package-1", blueprint: flagshipBlueprint, registry: flagshipUnitRegistry },
};
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
const response = (run: ResearchRunPublicView) => ({ run, requestId: "request-safe", error: null });
function fakeClient(overrides: Partial<ResearchClient> = {}): ResearchClient {
  return { startResearch: vi.fn(async () => response(active)), getResearch: vi.fn(async () => response(ready)), retryResearch: vi.fn(async () => response({ ...active, id: "research-run-2" })), ...overrides };
}
const options = (client: ResearchClient) => ({ userId: "owner-a", eligible: true, active: true, client });
async function flush() { await act(async () => { await Promise.resolve(); }); }
async function timerCount() {
  // jsdom delivers localStorage events with zero-delay timers. Drain those
  // browser events before asserting the number of Research polling timers.
  await act(() => vi.advanceTimersByTimeAsync(0));
  return vi.getTimerCount();
}

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(async () => {
  cleanup();
  try { expect(await timerCount()).toBe(0); }
  finally { vi.useRealTimers(); vi.restoreAllMocks(); }
});
describe("role Research controller", () => {
  const committedTransitions = [
    { label: "logout", userId: null, eligible: true, active: true },
    { label: "eligibility revoked", userId: "owner-a", eligible: false, active: true },
    { label: "Setup inactive", userId: "owner-a", eligible: true, active: false },
  ];
  const commitCases = committedTransitions.flatMap((transition) =>
    (["retained", "current"] as const).flatMap((callback) =>
      (["start", "retry", "refresh"] as const).map((command) => ({ ...transition, callback, command }))));

  it.each(commitCases)("guards $callback $command during a committed $label layout effect", async ({ callback, command, ...transition }) => {
    const pending = deferred<ReturnType<typeof response>>();
    const client = fakeClient({ startResearch: vi.fn(async () => response(failed)),
      getResearch: vi.fn(() => pending.promise), retryResearch: vi.fn(() => pending.promise) });
    let operation!: Promise<boolean>;
    const { result, rerender } = renderHook(({ userId, eligible, active: setupActive, invoke }) => {
      const controller = useRoleResearch({ ...options(client), userId, eligible, active: setupActive });
      const invoked = useRef(false);
      useLayoutEffect(() => {
        if (!invoke || invoked.current) return;
        invoked.current = true;
        const target = callback === "retained" ? retained : controller;
        operation = command === "start" ? target.start(input) : target[command]();
      }, [controller, invoke]);
      return controller;
    }, { initialProps: { userId: "owner-a" as string | null, eligible: true, active: true, invoke: false } });
    await flush();
    if (command !== "start") await act(() => result.current.start(input));
    vi.mocked(client.startResearch).mockClear().mockImplementation(() => pending.promise);
    const retained = result.current;
    rerender({ userId: transition.userId, eligible: transition.eligible, active: transition.active, invoke: true });
    const allowedGet = command === "refresh" && transition.label === "eligibility revoked";
    expect(client.startResearch).not.toHaveBeenCalled();
    expect(client.retryResearch).not.toHaveBeenCalled();
    expect(client.getResearch).toHaveBeenCalledTimes(allowedGet ? 1 : 0);
    await act(async () => { pending.resolve(response(failed)); await operation; });
    await expect(operation).resolves.toBe(allowedGet);
    expect(await timerCount()).toBe(0);
  });

  it("does not change committed authorization during an abandoned suspended render", async () => {
    const suspended = deferred<void>();
    const client = fakeClient({ startResearch: vi.fn(async () => response(failed)) });
    const { result, rerender } = renderHook(({ eligible, suspend }) => {
      const controller = useRoleResearch({ ...options(client), eligible });
      if (suspend) throw suspended.promise;
      return controller;
    }, { initialProps: { eligible: true, suspend: false }, wrapper: ({ children }) => <Suspense fallback={null}>{children}</Suspense> });
    await flush();
    const retained = result.current;
    act(() => { startTransition(() => rerender({ eligible: false, suspend: true })); });
    await act(() => retained.start(input));
    expect(client.startResearch).toHaveBeenCalledTimes(1);
  });

  it("submits once and persists only the recovery identity", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    const client = fakeClient({ startResearch: vi.fn(() => pending.promise) });
    const { result } = renderHook(() => useRoleResearch(options(client)));
    await flush();
    let operation!: Promise<boolean>;
    act(() => { operation = result.current.start(input); });
    expect(result.current.state).toEqual({ kind: "submitting" });
    await expect(result.current.start(input)).resolves.toBe(false);
    await act(async () => { pending.resolve(response(active)); await operation; });
    expect(result.current.state).toEqual({ kind: "researching", runId: identity.runId });
    expect(result.current.run).toEqual(active);
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(identity);
    expect(client.startResearch).toHaveBeenCalledTimes(1);
    expect(await timerCount()).toBe(1);
  });

  it("restores stored identity by GET without exposing stored authority", async () => {
    localStorage.setItem(key, JSON.stringify(identity));
    const pending = deferred<ReturnType<typeof response>>();
    const client = fakeClient({ getResearch: vi.fn(() => pending.promise) });
    const { result } = renderHook(() => useRoleResearch(options(client)));
    expect(result.current.run).toBeNull();
    expect(result.current.planningData).toBeNull();
    await flush();
    expect(client.getResearch).toHaveBeenCalledWith(identity.runId, expect.any(AbortSignal));
    await act(async () => { pending.resolve(response(ready)); });
    expect(result.current.state).toEqual({ kind: "ready", runId: identity.runId });
    expect(result.current.planningData).toEqual(ready.planningData);
    expect(client.startResearch).not.toHaveBeenCalled();
    expect(await timerCount()).toBe(0);
  });

  it.each(["invalid json", JSON.stringify({ ...identity, packageId: "forged", status: "ready", planningData: ready.planningData }), JSON.stringify({ ...identity, runId: "../foreign" }), "x".repeat(2_000)])("discards malformed or authority-bearing browser state #%#", async (stored) => {
    localStorage.setItem(key, stored);
    const client = fakeClient();
    const { result } = renderHook(() => useRoleResearch(options(client)));
    await flush();
    expect(result.current.state).toEqual({ kind: "idle" });
    expect(result.current.planningData).toBeNull();
    expect(client.getResearch).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("polls through queued and validating with one exponentially delayed timer capped at five seconds", async () => {
    const client = fakeClient({ getResearch: vi.fn(async () => response({ ...active, state: "validating" })) });
    const { result } = renderHook(() => useRoleResearch(options(client)));
    await flush();
    await act(() => result.current.start(input));
    for (const delay of [1_000, 2_000, 4_000, 5_000, 5_000]) {
      expect(await timerCount()).toBe(1);
      const count = vi.mocked(client.getResearch).mock.calls.length;
      await act(() => vi.advanceTimersByTimeAsync(delay - 1));
      expect(client.getResearch).toHaveBeenCalledTimes(count);
      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(client.getResearch).toHaveBeenCalledTimes(count + 1);
    }
    vi.mocked(client.getResearch).mockResolvedValue(response(ready));
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(result.current.state.kind).toBe("ready");
    expect(await timerCount()).toBe(0);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(client.getResearch).toHaveBeenCalledTimes(6);
    expect(client.startResearch).toHaveBeenCalledTimes(1);
    expect(client.retryResearch).not.toHaveBeenCalled();
  });

  it.each([needsReview, failed])("preserves non-2xx $state through GET refresh and explicit fresh-id retry", async (run) => {
    let postCount = 0;
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST" && ++postCount === 1) return new Response(JSON.stringify({
        run, requestId: "request-terminal", error: { code: run.state === "needs-review" ? "RESEARCH_NEEDS_REVIEW" : "RESEARCH_UNAVAILABLE", recovery: "retry-or-flagship", message: "private upstream text" },
      }), { status: run.state === "needs-review" ? 422 : 503 });
      return new Response(JSON.stringify({ run: init?.method === "GET" ? run : { ...active, id: "research-run-2" }, requestId: "request-restored" }));
    });
    let mutations = 0;
    const { result } = renderHook(() => useRoleResearch({ ...options(createResearchClient({ fetch: fetcher })), createMutationId: () => `mutation-${++mutations}` }));
    await flush();
    await act(() => result.current.start(input));
    expect(result.current.state).toEqual({ kind: run.state, runId: run.id });
    expect(result.current.error).toMatchObject({ recovery: "retry-or-flagship", requestId: "request-terminal" });
    expect(result.current.error?.message).not.toContain("private");
    expect(await timerCount()).toBe(0);
    await act(() => result.current.refresh());
    expect(result.current.run).toEqual(run);
    expect(result.current.error).toBeNull();
    expect(result.current.requestId).toBe("request-restored");
    await act(() => result.current.retry());
    expect(result.current.state).toEqual({ kind: "researching", runId: "research-run-2" });
    const posts = fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(2);
    expect(JSON.parse(posts[0]![1]!.body as string).mutationId).toBe("mutation-1");
    expect(JSON.parse(posts[1]![1]!.body as string).mutationId).toBe("mutation-2");
  });

  it("reuses a submit mutation after an uncertain connection failure and clears stale errors", async () => {
    const client = fakeClient({ startResearch: vi.fn().mockRejectedValueOnce(new Error("private")).mockResolvedValue(response(active)) });
    let mutations = 0;
    const { result } = renderHook(() => useRoleResearch({ ...options(client), createMutationId: () => `mutation-${++mutations}` }));
    await flush();
    await act(() => result.current.start(input));
    expect(result.current.error?.message).not.toContain("private");
    await act(() => result.current.start(input));
    expect(result.current.error).toBeNull();
    expect(vi.mocked(client.startResearch).mock.calls.map(([request]) => request.mutationId)).toEqual(["mutation-1", "mutation-1"]);
  });

  it("replays an uncertain retry mutation even after GET refresh of the original failed run", async () => {
    let mutations = 0;
    const client = fakeClient({ startResearch: vi.fn(async () => response(failed)), getResearch: vi.fn(async () => response(failed)),
      retryResearch: vi.fn().mockRejectedValueOnce(new Error("response lost")).mockResolvedValueOnce(response({ ...failed, id: "research-run-2" })).mockResolvedValue(response(ready)),
    });
    const { result } = renderHook(() => useRoleResearch({ ...options(client), createMutationId: () => `mutation-${++mutations}` }));
    await flush();
    await act(() => result.current.start(input));
    await act(() => result.current.retry());
    await act(() => result.current.refresh());
    await act(() => result.current.retry());
    expect(vi.mocked(client.retryResearch).mock.calls.map(([, request]) => request.mutationId)).toEqual(["mutation-2", "mutation-2"]);
    await act(() => result.current.retry());
    expect(vi.mocked(client.retryResearch).mock.calls[2]![1].mutationId).toBe("mutation-3");
  });

  it("returns a stable error if retry mutation-id creation fails", async () => {
    let mutations = 0;
    const client = fakeClient({ startResearch: vi.fn(async () => response(failed)) });
    const { result } = renderHook(() => useRoleResearch({ ...options(client), createMutationId: () => {
      if (++mutations === 2) throw new Error("private entropy failure");
      return "mutation-first";
    } }));
    await flush();
    await act(() => result.current.start(input));
    await expect(act(() => result.current.retry())).resolves.toBe(false);
    expect(result.current.error).toMatchObject({ code: "INTERNAL" });
    expect(result.current.error?.message).not.toContain("private");
    expect(client.retryResearch).not.toHaveBeenCalled();
  });

  it("does not re-submit a successful role without reset or a changed input", async () => {
    const client = fakeClient({ startResearch: vi.fn(async () => response(ready)) });
    const { result } = renderHook(() => useRoleResearch(options(client)));
    await flush();
    await act(() => result.current.start(input));
    await act(() => result.current.start({ ...input, role: "data  product manager" }));
    expect(client.startResearch).toHaveBeenCalledTimes(1);
    act(() => result.current.reset());
    await act(() => result.current.start(input));
    expect(client.startResearch).toHaveBeenCalledTimes(2);
  });

  it.each([active, ready, { ...failed, retryable: false }])("does not POST retry from disallowed $state", async (run) => {
    const client = fakeClient({ startResearch: vi.fn(async () => response(run)) });
    const { result } = renderHook(() => useRoleResearch(options(client)));
    await flush();
    await act(() => result.current.start(input));
    await expect(result.current.retry()).resolves.toBe(false);
    expect(client.retryResearch).not.toHaveBeenCalled();
  });

  it("aborts on unmount and ignores a late success without storage or timers", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    const client = fakeClient({ startResearch: vi.fn(() => pending.promise) });
    const { result, unmount } = renderHook(() => useRoleResearch(options(client)));
    await flush();
    let operation!: Promise<boolean>;
    act(() => { operation = result.current.start(input); });
    const requestSignal = vi.mocked(client.startResearch).mock.calls[0]![1];
    unmount();
    expect(requestSignal.aborted).toBe(true);
    pending.resolve(response(ready));
    await expect(operation).resolves.toBe(false);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("hides previous-owner run, source and error immediately and rejects late callbacks", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    const client = fakeClient({ getResearch: vi.fn(() => pending.promise) });
    const { result, rerender } = renderHook(({ userId }) => useRoleResearch({ ...options(client), userId }), { initialProps: { userId: "owner-a" } });
    await flush();
    await act(() => result.current.start(input));
    let operation!: Promise<boolean>;
    act(() => { operation = result.current.refresh(); });
    rerender({ userId: "owner-b" });
    expect(result.current).toMatchObject({ state: { kind: "idle" }, run: null, planningData: null, error: null, requestId: null });
    await act(async () => { pending.resolve(response(ready)); await operation; });
    expect(result.current.run).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
    expect(client.getResearch).toHaveBeenCalledTimes(1);
    await act(() => result.current.start(input));
    expect(client.startResearch).toHaveBeenCalledTimes(2);
  });

  it("pauses and aborts while Setup is inactive, then refreshes on reactivation", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    const client = fakeClient({ getResearch: vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(response(ready)) });
    const { result, rerender } = renderHook(({ active: setupActive }) => useRoleResearch({ ...options(client), active: setupActive }), { initialProps: { active: true } });
    await flush();
    await act(() => result.current.start(input));
    act(() => { void result.current.refresh(); });
    const requestSignal = vi.mocked(client.getResearch).mock.calls[0]![1];
    rerender({ active: false });
    expect(requestSignal.aborted).toBe(true);
    expect(await timerCount()).toBe(0);
    await act(async () => { pending.resolve(response(ready)); });
    expect(result.current.planningData).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(client.getResearch).toHaveBeenCalledTimes(1);
    rerender({ active: true });
    await flush();
    expect(result.current.state.kind).toBe("ready");
    expect(client.getResearch).toHaveBeenCalledTimes(2);
  });

  it("stops while the document is hidden and restores only by GET when visible", async () => {
    let hidden = false;
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => hidden ? "hidden" : "visible");
    const client = fakeClient();
    const { result } = renderHook(() => useRoleResearch(options(client)));
    await flush();
    await act(() => result.current.start(input));
    act(() => { hidden = true; document.dispatchEvent(new Event("visibilitychange")); });
    expect(await timerCount()).toBe(0);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(client.getResearch).not.toHaveBeenCalled();
    await act(async () => { hidden = false; document.dispatchEvent(new Event("visibilitychange")); });
    expect(result.current.state.kind).toBe("ready");
    expect(client.getResearch).toHaveBeenCalledTimes(1);
  });

  it("external abort stops polling and all later commands", async () => {
    const controller = new AbortController();
    const client = fakeClient();
    const { result } = renderHook(() => useRoleResearch({ ...options(client), signal: controller.signal }));
    await flush();
    await act(() => result.current.start(input));
    act(() => controller.abort());
    expect(await timerCount()).toBe(0);
    await expect(result.current.refresh()).resolves.toBe(false);
    await expect(result.current.start(input)).resolves.toBe(false);
    expect(client.getResearch).not.toHaveBeenCalled();
  });

  it("reset aborts stale work and removes recovery data", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    const client = fakeClient({ getResearch: vi.fn(() => pending.promise) });
    const { result } = renderHook(() => useRoleResearch(options(client)));
    await flush();
    await act(() => result.current.start(input));
    act(() => { void result.current.refresh(); result.current.reset(); });
    expect(result.current).toMatchObject({ state: { kind: "idle" }, run: null, error: null, requestId: null });
    await act(async () => { pending.resolve(response(ready)); });
    expect(localStorage.getItem(key)).toBeNull();
    expect(result.current.planningData).toBeNull();
  });

  it("blocks signed-out access and ineligible writes while allowing signed-in GET recovery", async () => {
    localStorage.setItem(key, JSON.stringify(identity));
    const client = fakeClient();
    const { result, rerender } = renderHook(({ userId }) => useRoleResearch({ ...options(client), userId, eligible: false }), { initialProps: { userId: "owner-a" as string | null } });
    await flush();
    expect(result.current.state.kind).toBe("ready");
    await expect(result.current.start(input)).resolves.toBe(false);
    expect(client.startResearch).not.toHaveBeenCalled();
    rerender({ userId: null });
    expect(result.current.planningData).toBeNull();
    await expect(result.current.refresh()).resolves.toBe(false);
    expect(client.getResearch).toHaveBeenCalledTimes(1);
  });

  it("survives unavailable storage and still finishes research", async () => {
    const storage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); }, removeItem() { throw new Error("blocked"); } };
    const client = fakeClient({ startResearch: vi.fn(async () => response(ready)) });
    const { result } = renderHook(() => useRoleResearch({ ...options(client), storage }));
    await flush();
    await act(() => result.current.start(input));
    expect(result.current.state.kind).toBe("ready");
    expect(result.current.error).toBeNull();
  });
});
