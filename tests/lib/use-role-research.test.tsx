import { act, cleanup, renderHook } from "@testing-library/react";
import { startTransition, StrictMode, Suspense, useLayoutEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchRunPublicView } from "../../app/contracts/research";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { createResearchClient, ResearchClientError, type ResearchClient } from "../../app/lib/research-client";
import { createKnownResearchRecovery, createPendingResearchRecovery, RESEARCH_RECOVERY_STORAGE_KEY, saveResearchRecovery } from "../../app/lib/research-recovery-storage";
import { useRoleResearch } from "../../app/lib/use-role-research";

const key = "arc:role-research:v1";
const v2Key = RESEARCH_RECOVERY_STORAGE_KEY;
const input = { role: "Data Product Manager", locale: "en-US" as const };
const identity = { runId: "research-run-1", ...input };
const active: ResearchRunPublicView = { id: identity.runId, ...input, state: "researching", retryable: false, backgroundAccepted: false };
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
  return { startResearch: vi.fn(async () => response(active)), getResearch: vi.fn(async () => response(ready)), retryResearch: vi.fn(async () => response({ ...active, id: "research-run-2" })), recoverResearch: vi.fn(async () => response(active)), ...overrides };
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
  it("recovers the original persisted Start after a real unmount without submitting again", async () => {
    const lost = deferred<ReturnType<typeof response>>();
    const client = fakeClient({
      startResearch: vi.fn(() => lost.promise),
      recoverResearch: vi.fn(async () => response(ready)),
    });
    const first = renderHook(() => useRoleResearch({ ...options(client), createMutationId: () => "mutation-persisted" }));
    await flush();
    let original!: Promise<boolean>;
    act(() => { original = first.result.current.start(input); });
    expect(JSON.parse(localStorage.getItem(v2Key)!)).toMatchObject({ state: "pending", recovery: { kind: "start", mutationId: "mutation-persisted", ...input } });
    first.unmount();

    const second = renderHook(() => useRoleResearch(options(client)));
    await flush();
    expect(client.startResearch).toHaveBeenCalledTimes(1);
    expect(client.recoverResearch).toHaveBeenCalledWith(
      { kind: "start", mutationId: "mutation-persisted", ...input }, expect.any(AbortSignal),
    );
    expect(second.result.current.state).toEqual({ kind: "ready", runId: ready.id });
    const recoveredStorage = localStorage.getItem(v2Key);
    expect(recoveredStorage).not.toBeNull();
    const stale = { ...failed, id: "research-run-stale-start" };
    await act(async () => { lost.resolve(response(stale)); await expect(original).resolves.toBe(false); });
    expect(localStorage.getItem(v2Key)).toBe(recoveredStorage);
    expect(second.result.current.run).toEqual(ready);
    expect(second.result.current.planningData).toEqual(ready.planningData);
    expect(client.startResearch).toHaveBeenCalledTimes(1);
    expect(client.recoverResearch).toHaveBeenCalledTimes(1);
    expect(client.retryResearch).not.toHaveBeenCalled();
    expect(client.getResearch).not.toHaveBeenCalled();
    expect(await timerCount()).toBe(0);
  });

  it("recovers a lost Retry successor before querying its failed source", async () => {
    const lost = deferred<ReturnType<typeof response>>();
    const successor = { ...ready, id: "research-run-2" };
    const client = fakeClient({
      startResearch: vi.fn(async () => response(failed)),
      retryResearch: vi.fn(() => lost.promise),
      recoverResearch: vi.fn(async () => response(successor)),
    });
    const first = renderHook(() => useRoleResearch({ ...options(client), createMutationId: vi.fn().mockReturnValueOnce("mutation-start").mockReturnValueOnce("mutation-retry") }));
    await flush();
    await act(() => first.result.current.start(input));
    let original!: Promise<boolean>;
    act(() => { original = first.result.current.retry(); });
    first.unmount();

    const second = renderHook(() => useRoleResearch(options(client)));
    await flush();
    expect(client.retryResearch).toHaveBeenCalledTimes(1);
    expect(client.recoverResearch).toHaveBeenCalledWith(
      { kind: "retry", mutationId: "mutation-retry", sourceRunId: failed.id, ...input }, expect.any(AbortSignal),
    );
    expect(client.getResearch).not.toHaveBeenCalled();
    expect(second.result.current.run?.id).toBe(successor.id);
    const recoveredStorage = localStorage.getItem(v2Key);
    expect(recoveredStorage).not.toBeNull();
    const stale = { ...failed, id: "research-run-stale-retry" };
    await act(async () => { lost.resolve(response(stale)); await expect(original).resolves.toBe(false); });
    expect(localStorage.getItem(v2Key)).toBe(recoveredStorage);
    expect(second.result.current.run).toEqual(successor);
    expect(second.result.current.planningData).toEqual(successor.planningData);
    expect(client.startResearch).toHaveBeenCalledTimes(1);
    expect(client.retryResearch).toHaveBeenCalledTimes(1);
    expect(client.recoverResearch).toHaveBeenCalledTimes(1);
    expect(client.getResearch).not.toHaveBeenCalled();
    expect(await timerCount()).toBe(0);
  });

  it("does not issue a paid Start when durable storage cannot be written", async () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn(() => { throw new Error("quota private"); }), removeItem: vi.fn() };
    const client = fakeClient();
    const { result } = renderHook(() => useRoleResearch({ ...options(client), storage, createMutationId: () => "mutation-storage-failure" }));
    await flush();
    await expect(act(() => result.current.start(input))).resolves.toBe(false);
    expect(client.startResearch).not.toHaveBeenCalled();
    expect(result.current.error).toMatchObject({ code: "RESEARCH_UNAVAILABLE", requestId: null });
    expect(result.current.error?.message).toMatch(/device storage/i);
    expect(result.current.error?.message).not.toContain("private");
  });

  it("requires confirmation instead of overwriting a preexisting pending locator from a caller layout effect", async () => {
    saveResearchRecovery(localStorage, createPendingResearchRecovery("owner-a", { kind: "start", mutationId: "mutation-old", ...input }));
    const client = fakeClient({ recoverResearch: vi.fn(() => new Promise<ReturnType<typeof response>>(() => {})) });
    let operation!: Promise<boolean>;
    const { result } = renderHook(() => {
      const controller = useRoleResearch({ ...options(client), createMutationId: () => "mutation-new" });
      const invoked = useRef(false);
      useLayoutEffect(() => {
        if (invoked.current) return;
        invoked.current = true;
        operation = controller.start({ ...input, role: "Security Engineer" });
      }, [controller]);
      return controller;
    });
    await expect(operation).resolves.toBe(false);
    expect(client.startResearch).not.toHaveBeenCalled();
    expect(result.current.replacementPending).toBe(true);
    expect(JSON.parse(localStorage.getItem(v2Key)!)).toMatchObject({ recovery: { mutationId: "mutation-old" } });
  });

  it("retains a pending locator after NOT_FOUND and repeats only the recovery query on manual check", async () => {
    const pending = createPendingResearchRecovery("owner-a", { kind: "start", mutationId: "mutation-before-record", ...input });
    saveResearchRecovery(localStorage, pending);
    const client = fakeClient({ recoverResearch: vi.fn()
      .mockRejectedValueOnce(new ResearchClientError("NOT_FOUND"))
      .mockResolvedValueOnce(response(ready)) });
    const { result } = renderHook(() => useRoleResearch(options(client)));
    await flush();
    expect(result.current.recoveryUncertain).toBe(true);
    expect(localStorage.getItem(v2Key)).toBe(JSON.stringify(pending));
    expect(await timerCount()).toBe(0);

    await act(() => result.current.refresh());
    expect(client.recoverResearch).toHaveBeenCalledTimes(2);
    expect(client.startResearch).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ kind: "ready", runId: ready.id });
    expect(result.current.recoveryUncertain).toBe(false);
  });

  it.each(["UNAUTHENTICATED", "RATE_LIMITED", "RESEARCH_UNAVAILABLE", "INTERNAL"] as const)(
    "keeps a pending locator and stops automatic polling after %s recovery failure", async (code) => {
      const pending = createPendingResearchRecovery("owner-a", { kind: "start", mutationId: `mutation-${code.toLowerCase().replaceAll("_", "-")}`, ...input });
      saveResearchRecovery(localStorage, pending);
      const client = fakeClient({ recoverResearch: vi.fn(async () => { throw new ResearchClientError(code); }) });
      const { result } = renderHook(() => useRoleResearch(options(client)));
      await flush();
      expect(result.current.recoveryUncertain).toBe(true);
      expect(localStorage.getItem(v2Key)).toBe(JSON.stringify(pending));
      expect(client.startResearch).not.toHaveBeenCalled();
      expect(await timerCount()).toBe(0);
    },
  );

  it.each([failed, needsReview])("accepts recovered terminal $state and enables one explicit fresh Retry", async (terminal) => {
    saveResearchRecovery(localStorage, createPendingResearchRecovery("owner-a", { kind: "start", mutationId: "mutation-terminal", ...input }));
    let mutations = 0;
    const client = fakeClient({ recoverResearch: vi.fn(async () => response(terminal)) });
    const { result } = renderHook(() => useRoleResearch({ ...options(client), createMutationId: () => `mutation-fresh-${++mutations}` }));
    await flush();
    expect(result.current.state).toEqual({ kind: terminal.state, runId: terminal.id });
    await act(() => result.current.retry());
    expect(client.retryResearch).toHaveBeenCalledTimes(1);
  });

  it("polls an active recovered run by GET after one second without issuing a mutation", async () => {
    saveResearchRecovery(localStorage, createPendingResearchRecovery("owner-a", { kind: "start", mutationId: "mutation-active", ...input }));
    const client = fakeClient({ recoverResearch: vi.fn(async () => response(active)), getResearch: vi.fn(async () => response(ready)) });
    const { result } = renderHook(() => useRoleResearch({ ...options(client), eligible: false }));
    await flush();
    expect(result.current.state).toEqual({ kind: "researching", runId: active.id });
    expect(client.recoverResearch).toHaveBeenCalledTimes(1);
    expect(client.startResearch).not.toHaveBeenCalled();
    expect(await timerCount()).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(client.getResearch).toHaveBeenCalledWith(active.id, expect.any(AbortSignal));
    expect(result.current.planningData).toEqual(ready.planningData);
  });

  it("persists pending identity before calling Start", async () => {
    const order: string[] = [];
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => { order.push("persist"); }),
      removeItem: vi.fn(),
    };
    const client = fakeClient({ startResearch: vi.fn(async () => { order.push("post"); return response(ready); }) });
    const { result } = renderHook(() => useRoleResearch({ ...options(client), storage }));
    await flush();
    await act(() => result.current.start(input));
    expect(order.slice(0, 2)).toEqual(["persist", "post"]);
  });

  it("keeps the old pending disk locator when saving the final target fails", async () => {
    const values = new Map<string, string>();
    let writes = 0;
    const storage = {
      getItem: vi.fn((name: string) => values.get(name) ?? null),
      setItem: vi.fn((name: string, value: string) => {
        if (++writes === 2) throw new Error("quota private");
        values.set(name, value);
      }),
      removeItem: vi.fn((name: string) => { values.delete(name); }),
    };
    const client = fakeClient({ startResearch: vi.fn(async () => response(ready)) });
    const { result } = renderHook(() => useRoleResearch({ ...options(client), storage, createMutationId: () => "mutation-kept" }));
    await flush();
    await act(() => result.current.start(input));
    expect(JSON.parse(values.get(v2Key)!)).toMatchObject({ state: "pending", recovery: { mutationId: "mutation-kept" } });
    expect(result.current.run).toEqual(ready);
    expect(result.current.recoveryUncertain).toBe(true);
    expect(result.current.error?.requestId).toBeNull();
    expect(await timerCount()).toBe(0);
  });

  it("preserves a retryable source when pending Retry persistence fails, then retries after repair", async () => {
    const values = new Map<string, string>();
    saveResearchRecovery({
      getItem: (name) => values.get(name) ?? null,
      setItem: (name, value) => { values.set(name, value); },
      removeItem: (name) => { values.delete(name); },
    }, createKnownResearchRecovery("owner-a", identity));
    let blocked = false;
    const storage = {
      getItem: vi.fn((name: string) => values.get(name) ?? null),
      setItem: vi.fn((name: string, value: string) => {
        if (blocked) throw new Error("quota private");
        values.set(name, value);
      }),
      removeItem: vi.fn((name: string) => { values.delete(name); }),
    };
    const successor = { ...active, id: "research-run-2" };
    const client = fakeClient({ getResearch: vi.fn(async () => response(failed)), retryResearch: vi.fn(async () => response(successor)) });
    let mutations = 0;
    const { result } = renderHook(() => useRoleResearch({ ...options(client), storage, createMutationId: () => `mutation-retry-${++mutations}` }));
    await flush();
    blocked = true;
    await expect(act(() => result.current.retry())).resolves.toBe(false);
    expect(client.retryResearch).not.toHaveBeenCalled();
    expect(result.current.run).toEqual(failed);
    expect(result.current.error?.requestId).toBeNull();

    blocked = false;
    await act(() => result.current.retry());
    expect(client.retryResearch).toHaveBeenCalledWith(failed.id, { mutationId: "mutation-retry-2" }, expect.any(AbortSignal));
    expect(result.current.run).toEqual(successor);
  });

  it("does not rewrite a valid known v2 locator after its owner-authorized GET", async () => {
    const known = createKnownResearchRecovery("owner-a", identity);
    const storage = {
      getItem: vi.fn((name: string) => name === v2Key ? JSON.stringify(known) : null),
      setItem: vi.fn(() => { throw new Error("quota"); }),
      removeItem: vi.fn(),
    };
    const client = fakeClient({ getResearch: vi.fn(async () => response(ready)) });
    const { result } = renderHook(() => useRoleResearch({ ...options(client), storage }));
    await flush();
    expect(result.current.run).toEqual(ready);
    expect(result.current.error).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("clears a staged replacement when recovery resolves the prior locator", async () => {
    saveResearchRecovery(localStorage, createPendingResearchRecovery("owner-a", { kind: "start", mutationId: "mutation-old", ...input }));
    const recovered = deferred<ReturnType<typeof response>>();
    const client = fakeClient({ recoverResearch: vi.fn(() => recovered.promise) });
    let staged!: Promise<boolean>;
    const { result } = renderHook(() => {
      const controller = useRoleResearch(options(client));
      const invoked = useRef(false);
      useLayoutEffect(() => {
        if (invoked.current) return;
        invoked.current = true;
        staged = controller.start({ ...input, role: "Security Engineer" });
      }, [controller]);
      return controller;
    });
    await expect(staged).resolves.toBe(false);
    expect(result.current.replacementPending).toBe(true);
    await act(async () => { recovered.resolve(response(ready)); });
    expect(result.current.replacementPending).toBe(false);
    await expect(result.current.confirmReplacement()).resolves.toBe(false);
    expect(client.startResearch).not.toHaveBeenCalled();
  });

  it("re-reads storage on explicit action after a read error and then permits a durable Start", async () => {
    let blocked = true;
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((name: string) => {
        if (blocked) throw new Error("private blocked");
        return values.get(name) ?? null;
      }),
      setItem: vi.fn((name: string, value: string) => { values.set(name, value); }),
      removeItem: vi.fn((name: string) => { values.delete(name); }),
    };
    const client = fakeClient({ startResearch: vi.fn(async () => response(ready)) });
    const { result } = renderHook(() => useRoleResearch({ ...options(client), storage }));
    await flush();
    expect(result.current.error?.requestId).toBeNull();
    blocked = false;
    await act(() => result.current.start(input));
    expect(client.startResearch).toHaveBeenCalledTimes(1);
    expect(result.current.state.kind).toBe("ready");
  });

  it("clears a stale local storage read error when manual refresh finds no locator after repair", async () => {
    let blocked = true;
    const storage = {
      getItem: vi.fn(() => {
        if (blocked) throw new Error("private blocked");
        return null;
      }),
      setItem: vi.fn(), removeItem: vi.fn(),
    };
    const client = fakeClient();
    const { result } = renderHook(() => useRoleResearch({ ...options(client), storage }));
    await flush();
    expect(result.current.error?.requestId).toBeNull();
    blocked = false;
    await expect(act(() => result.current.refresh())).resolves.toBe(false);
    expect(result.current).toMatchObject({ state: { kind: "idle" }, error: null, recoveryUncertain: false });
    expect(client.recoverResearch).not.toHaveBeenCalled();
    expect(client.getResearch).not.toHaveBeenCalled();
  });

  it("treats a throwing window localStorage getter as unavailable", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("private getter failure"); });
    const client = fakeClient();
    let result!: { current: ReturnType<typeof useRoleResearch> };
    expect(() => { ({ result } = renderHook(() => useRoleResearch(options(client)))); }).not.toThrow();
    await flush();
    expect(result.current.error?.requestId).toBeNull();
    expect(result.current.recoveryUncertain).toBe(true);
    expect(client.startResearch).not.toHaveBeenCalled();
  });

  it("migrates a server-verified legacy locator only after a successful v2 save", async () => {
    localStorage.setItem(key, JSON.stringify(identity));
    const client = fakeClient({ getResearch: vi.fn(async () => response(ready)) });
    const { result } = renderHook(() => useRoleResearch(options(client)));
    expect(result.current.run).toBeNull();
    await flush();
    expect(result.current.run).toEqual(ready);
    expect(JSON.parse(localStorage.getItem(v2Key)!)).toMatchObject({ state: "known", ...identity });
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("clears a legacy locator that its owner-authorized GET cannot find without displaying it", async () => {
    localStorage.setItem(key, JSON.stringify(identity));
    const client = fakeClient({ getResearch: vi.fn(async () => { throw new ResearchClientError("NOT_FOUND"); }) });
    const { result } = renderHook(() => useRoleResearch(options(client)));
    await flush();
    expect(result.current.run).toBeNull();
    expect(result.current.planningData).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(v2Key)).toBeNull();
  });

  it("preserves the legacy locator if its verified v2 migration cannot be saved", async () => {
    const values = new Map([[key, JSON.stringify(identity)]]);
    const storage = {
      getItem: vi.fn((name: string) => values.get(name) ?? null),
      setItem: vi.fn(() => { throw new Error("quota"); }),
      removeItem: vi.fn((name: string) => { values.delete(name); }),
    };
    const client = fakeClient({ getResearch: vi.fn(async () => response(ready)) });
    const { result } = renderHook(() => useRoleResearch({ ...options(client), storage }));
    await flush();
    expect(result.current.run).toEqual(ready);
    expect(values.get(key)).toBe(JSON.stringify(identity));
    expect(result.current.error?.requestId).toBeNull();
  });

  it("does not read browser recovery state until the session owner is known", async () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() };
    const client = fakeClient();
    const { rerender } = renderHook(({ userId }) => useRoleResearch({ ...options(client), userId, storage }), { initialProps: { userId: null as string | null } });
    await flush();
    expect(storage.getItem).not.toHaveBeenCalled();
    rerender({ userId: "owner-a" });
    await flush();
    expect(storage.getItem).toHaveBeenCalled();
  });

  it("does not clear pending recovery when reset runs before the session owner is known", async () => {
    const pending = createPendingResearchRecovery("owner-a", { kind: "start", mutationId: "mutation-auth-pending", ...input });
    saveResearchRecovery(localStorage, pending);
    const storage = {
      getItem: vi.fn((name: string) => localStorage.getItem(name)),
      setItem: vi.fn((name: string, value: string) => localStorage.setItem(name, value)),
      removeItem: vi.fn((name: string) => localStorage.removeItem(name)),
    };
    const client = fakeClient({ recoverResearch: vi.fn(async () => response(ready)) });
    const { result, rerender } = renderHook(({ userId }) => useRoleResearch({ ...options(client), userId, storage }), {
      initialProps: { userId: null as string | null },
    });
    act(() => result.current.reset());
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(localStorage.getItem(v2Key)).toBe(JSON.stringify(pending));

    rerender({ userId: "owner-a" });
    await flush();
    expect(client.recoverResearch).toHaveBeenCalledWith(pending.recovery, expect.any(AbortSignal));
    expect(client.startResearch).not.toHaveBeenCalled();
    expect(result.current.run).toEqual(ready);
  });

  it("masks an old owner immediately even when slot removal throws and ignores its late recovery", async () => {
    const pending = createPendingResearchRecovery("owner-a", { kind: "start", mutationId: "mutation-owner-a", ...input });
    const late = deferred<ReturnType<typeof response>>();
    const storage = {
      getItem: vi.fn(() => JSON.stringify(pending)), setItem: vi.fn(),
      removeItem: vi.fn(() => { throw new Error("blocked"); }),
    };
    const client = fakeClient({ recoverResearch: vi.fn(() => late.promise) });
    const { result, rerender } = renderHook(({ userId }) => useRoleResearch({ ...options(client), userId, storage }), { initialProps: { userId: "owner-a" } });
    await flush();
    rerender({ userId: "owner-b" });
    expect(result.current).toMatchObject({ state: { kind: "idle" }, run: null, error: null, requestId: null });
    expect(vi.mocked(client.recoverResearch).mock.calls[0]![1].aborted).toBe(true);
    await act(async () => { late.resolve(response({ ...ready, backgroundAccepted: true })); });
    expect(result.current.run).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(client.startResearch).not.toHaveBeenCalled();
    expect(client.retryResearch).not.toHaveBeenCalled();
    expect(await timerCount()).toBe(0);
  });

  it("keeps a pending locator through reset and requires explicit replacement confirmation", async () => {
    const pending = createPendingResearchRecovery("owner-a", { kind: "start", mutationId: "mutation-old", ...input });
    saveResearchRecovery(localStorage, pending);
    const replacementInput = { ...input, role: "Security Engineer" };
    const replacementRun = { ...ready, id: "research-run-2", role: replacementInput.role };
    const client = fakeClient({
      recoverResearch: vi.fn(async () => { throw new ResearchClientError("NOT_FOUND"); }),
      startResearch: vi.fn(async () => response(replacementRun)),
    });
    const { result } = renderHook(() => useRoleResearch({ ...options(client), createMutationId: () => "mutation-new" }));
    await flush();
    act(() => result.current.reset());
    expect(localStorage.getItem(v2Key)).toBe(JSON.stringify(pending));
    await act(() => result.current.start(replacementInput));
    expect(result.current.replacementPending).toBe(true);
    act(() => result.current.cancelReplacement());
    expect(client.startResearch).not.toHaveBeenCalled();
    expect(localStorage.getItem(v2Key)).toBe(JSON.stringify(pending));
    await act(() => result.current.start(replacementInput));
    let confirmed!: Promise<boolean>;
    act(() => { confirmed = result.current.confirmReplacement(); });
    await expect(result.current.confirmReplacement()).resolves.toBe(false);
    await act(async () => { await confirmed; });
    expect(client.startResearch).toHaveBeenCalledTimes(1);
    expect(result.current.run).toEqual(replacementRun);
  });

  it("keeps the original pending locator when confirmed replacement persistence fails", async () => {
    const old = createPendingResearchRecovery("owner-a", { kind: "start", mutationId: "mutation-old", ...input });
    const values = new Map([[v2Key, JSON.stringify(old)]]);
    let blocked = false;
    const storage = {
      getItem: vi.fn((name: string) => values.get(name) ?? null),
      setItem: vi.fn((name: string, value: string) => {
        if (blocked) throw new Error("quota private");
        values.set(name, value);
      }),
      removeItem: vi.fn((name: string) => { values.delete(name); }),
    };
    const client = fakeClient({ recoverResearch: vi.fn(async () => { throw new ResearchClientError("NOT_FOUND"); }) });
    const { result } = renderHook(() => useRoleResearch({ ...options(client), storage, createMutationId: () => "mutation-new" }));
    await flush();
    await act(() => result.current.start({ ...input, role: "Security Engineer" }));
    blocked = true;
    await expect(act(() => result.current.confirmReplacement())).resolves.toBe(false);
    expect(client.startResearch).not.toHaveBeenCalled();
    expect(values.get(v2Key)).toBe(JSON.stringify(old));
    expect(result.current.replacementPending).toBe(true);
    expect(result.current.error?.requestId).toBeNull();
  });

  it.each(["ineligible", "owner changed"] as const)("invalidates staged replacement when %s", async (change) => {
    saveResearchRecovery(localStorage, createPendingResearchRecovery("owner-a", { kind: "start", mutationId: "mutation-old", ...input }));
    const client = fakeClient({ recoverResearch: vi.fn(async () => { throw new ResearchClientError("NOT_FOUND"); }) });
    const { result, rerender } = renderHook(({ userId, eligible }) => useRoleResearch({ ...options(client), userId, eligible }), {
      initialProps: { userId: "owner-a", eligible: true },
    });
    await flush();
    await act(() => result.current.start({ ...input, role: "Security Engineer" }));
    expect(result.current.replacementPending).toBe(true);
    rerender(change === "owner changed" ? { userId: "owner-b", eligible: true } : { userId: "owner-a", eligible: false });
    await expect(result.current.confirmReplacement()).resolves.toBe(false);
    expect(client.startResearch).not.toHaveBeenCalled();
  });

  it("does not retry an old failed source while its successor identity is unresolved", async () => {
    const client = fakeClient({
      startResearch: vi.fn(async () => response(failed)),
      retryResearch: vi.fn(async () => { throw new Error("lost response"); }),
      recoverResearch: vi.fn(async () => { throw new ResearchClientError("NOT_FOUND"); }),
    });
    const { result } = renderHook(() => useRoleResearch(options(client)));
    await flush();
    await act(() => result.current.start(input));
    await act(() => result.current.retry());
    await expect(result.current.retry()).resolves.toBe(false);
    expect(client.retryResearch).toHaveBeenCalledTimes(1);
    await act(() => result.current.refresh());
    expect(client.recoverResearch).toHaveBeenCalledTimes(1);
    expect(client.getResearch).not.toHaveBeenCalled();
  });

  it("rejects a mismatched recovered response and retains the exact pending identity", async () => {
    const pending = createPendingResearchRecovery("owner-a", { kind: "start", mutationId: "mutation-exact", ...input });
    saveResearchRecovery(localStorage, pending);
    const client = fakeClient({ recoverResearch: vi.fn(async () => response({ ...ready, role: "Security Engineer" })) });
    const { result } = renderHook(() => useRoleResearch(options(client)));
    await flush();
    expect(result.current.error).toMatchObject({ code: "INTERNAL" });
    expect(result.current.recoveryUncertain).toBe(true);
    expect(localStorage.getItem(v2Key)).toBe(JSON.stringify(pending));
  });

  it("recovers once under StrictMode without issuing a mutation", async () => {
    saveResearchRecovery(localStorage, createPendingResearchRecovery("owner-a", { kind: "start", mutationId: "mutation-strict", ...input }));
    const client = fakeClient({ recoverResearch: vi.fn(async () => response(ready)) });
    const wrapper = ({ children }: { children: React.ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result } = renderHook(() => useRoleResearch(options(client)), { wrapper });
    await flush();
    expect(client.recoverResearch).toHaveBeenCalledTimes(1);
    expect(client.startResearch).not.toHaveBeenCalled();
    expect(result.current.planningData).toEqual(ready.planningData);
  });
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
    expect(JSON.parse(localStorage.getItem(v2Key)!)).toMatchObject({ state: "known", ...identity });
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

  it("ends POST waiting on accepted queued HTTP 200 and polls with one delayed timer capped at five seconds", async () => {
    const queued: ResearchRunPublicView = { ...active, state: "queued", backgroundAccepted: true };
    const post = deferred<Response>();
    let polled: ResearchRunPublicView = { ...queued, state: "validating" };
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => init?.method === "POST"
      ? post.promise : Response.json({ run: polled, requestId: "request-polled" }));
    const client = createResearchClient({ fetch: fetcher });
    const { result } = renderHook(() => useRoleResearch({ ...options(client), createMutationId: () => "mutation-queued" }));
    await flush();
    let operation!: Promise<boolean>;
    act(() => { operation = result.current.start(input); });
    expect(result.current).toMatchObject({ state: { kind: "submitting" }, busy: true, run: null });
    await act(async () => {
      post.resolve(Response.json({ run: queued, requestId: "request-queued" }, { status: 200 }));
      await expect(operation).resolves.toBe(true);
    });
    expect(result.current).toMatchObject({ state: { kind: "queued", runId: queued.id }, run: queued,
      busy: false, restoring: false, recoveryUncertain: false, error: null, requestId: "request-queued" });
    expect(JSON.parse(localStorage.getItem(v2Key)!)).toEqual(createKnownResearchRecovery("owner-a", identity));
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({ ...input, mutationId: "mutation-queued" });
    for (const delay of [1_000, 2_000, 4_000, 5_000, 5_000]) {
      expect(await timerCount()).toBe(1);
      const count = fetcher.mock.calls.length;
      await act(() => vi.advanceTimersByTimeAsync(delay - 1));
      expect(fetcher).toHaveBeenCalledTimes(count);
      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(fetcher).toHaveBeenCalledTimes(count + 1);
      expect(fetcher).toHaveBeenLastCalledWith(`/api/intelligence/research/${queued.id}`, expect.objectContaining({ method: "GET" }));
      expect(result.current.run).toEqual(polled);
    }
    polled = { ...ready, backgroundAccepted: true };
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(result.current.state.kind).toBe("ready");
    expect(result.current.run).toEqual(polled);
    expect(await timerCount()).toBe(0);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "GET")).toHaveLength(6);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
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

  it("queries an uncertain Start identity instead of resubmitting it", async () => {
    const client = fakeClient({ startResearch: vi.fn().mockRejectedValueOnce(new Error("private")), recoverResearch: vi.fn(async () => response(active)) });
    let mutations = 0;
    const { result } = renderHook(() => useRoleResearch({ ...options(client), createMutationId: () => `mutation-${++mutations}` }));
    await flush();
    await act(() => result.current.start(input));
    expect(result.current.error?.message).not.toContain("private");
    await act(() => result.current.refresh());
    expect(result.current.error).toBeNull();
    expect(vi.mocked(client.startResearch).mock.calls.map(([request]) => request.mutationId)).toEqual(["mutation-1"]);
    expect(client.recoverResearch).toHaveBeenCalledWith({ kind: "start", mutationId: "mutation-1", ...input }, expect.any(AbortSignal));
  });

  it("queries an uncertain Retry mutation before the original failed run", async () => {
    let mutations = 0;
    const client = fakeClient({ startResearch: vi.fn(async () => response(failed)), getResearch: vi.fn(async () => response(failed)),
      retryResearch: vi.fn().mockRejectedValueOnce(new Error("response lost")),
      recoverResearch: vi.fn(async () => response({ ...failed, id: "research-run-2" })),
    });
    const { result } = renderHook(() => useRoleResearch({ ...options(client), createMutationId: () => `mutation-${++mutations}` }));
    await flush();
    await act(() => result.current.start(input));
    await act(() => result.current.retry());
    await act(() => result.current.refresh());
    expect(vi.mocked(client.retryResearch).mock.calls.map(([, request]) => request.mutationId)).toEqual(["mutation-2"]);
    expect(client.recoverResearch).toHaveBeenCalledWith({ kind: "retry", mutationId: "mutation-2", sourceRunId: failed.id, ...input }, expect.any(AbortSignal));
    expect(client.getResearch).not.toHaveBeenCalled();
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
    expect(JSON.parse(localStorage.getItem(v2Key)!)).toMatchObject({ state: "pending", recovery: { kind: "start", ...input } });
  });

  it.each(["hidden", "inactive", "external abort"] as const)("recovers an interrupted initial POST after %s without replaying it", async (interruption) => {
    const pending = deferred<ReturnType<typeof response>>();
    const client = fakeClient({ startResearch: vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(response(active)) });
    let mutations = 0;
    let hidden = false;
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => hidden ? "hidden" : "visible");
    const abort = new AbortController();
    const { result, rerender } = renderHook(({ active: setupActive, signal }) => useRoleResearch({
      ...options(client), active: setupActive, signal, createMutationId: () => `mutation-${++mutations}`,
    }), { initialProps: { active: true, signal: abort.signal } });
    await flush();
    let first!: Promise<boolean>;
    act(() => { first = result.current.start(input); });
    expect(result.current).toMatchObject({ state: { kind: "submitting" }, run: null, busy: true });
    if (interruption === "hidden") act(() => { hidden = true; document.dispatchEvent(new Event("visibilitychange")); });
    else if (interruption === "inactive") rerender({ active: false, signal: abort.signal });
    else act(() => abort.abort());
    expect(vi.mocked(client.startResearch).mock.calls[0]![1].aborted).toBe(true);
    if (interruption === "hidden") act(() => { hidden = false; document.dispatchEvent(new Event("visibilitychange")); });
    else rerender({ active: true, signal: interruption === "external abort" ? new AbortController().signal : abort.signal });
    await flush();
    expect(result.current).toMatchObject({ state: { kind: "researching" }, run: active, planningData: null, busy: false, restoring: false, error: null });
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(client.startResearch).toHaveBeenCalledTimes(1);
    expect(client.getResearch).toHaveBeenCalled();
    expect(client.recoverResearch).toHaveBeenCalledTimes(1);

    await act(() => result.current.start(input));
    expect(vi.mocked(client.startResearch).mock.calls.map(([request]) => request.mutationId)).toEqual(["mutation-1"]);
    expect(result.current.state).toEqual({ kind: "ready", runId: ready.id });
    await act(async () => { pending.resolve(response(ready)); await first; });
    await expect(first).resolves.toBe(false);
    expect(result.current.state.kind).toBe("ready");
    expect(result.current.planningData).toEqual(ready.planningData);
    expect(JSON.parse(localStorage.getItem(v2Key)!)).toMatchObject({ state: "known", ...identity });
  });

  it.each(["reset", "new input"] as const)("creates a new logical mutation after interrupting an initial POST then choosing %s", async (nextAction) => {
    const pending = deferred<ReturnType<typeof response>>();
    const nextInput = nextAction === "new input" ? { ...input, role: "Security Engineer" } : input;
    const nextRun = { ...ready, id: "research-run-2", role: nextInput.role };
    const client = fakeClient({
      startResearch: vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(response(nextRun)),
      recoverResearch: vi.fn(async () => { throw new ResearchClientError("NOT_FOUND"); }),
    });
    let mutations = 0;
    const { result, rerender } = renderHook(({ active: setupActive }) => useRoleResearch({
      ...options(client), active: setupActive, createMutationId: () => `mutation-${++mutations}`,
    }), { initialProps: { active: true } });
    await flush();
    let first!: Promise<boolean>;
    act(() => { first = result.current.start(input); });
    rerender({ active: false });
    rerender({ active: true });
    await flush();
    if (nextAction === "reset") act(() => result.current.reset());
    await act(() => result.current.start(nextInput));
    expect(result.current.replacementPending).toBe(true);
    await act(() => result.current.confirmReplacement());
    expect(vi.mocked(client.startResearch).mock.calls.map(([request]) => request.mutationId)).toEqual(["mutation-1", "mutation-2"]);
    await act(async () => { pending.resolve(response(ready)); await first; });
    expect(result.current.run).toEqual(nextRun);
    expect(JSON.parse(localStorage.getItem(v2Key)!)).toMatchObject({ state: "known", runId: nextRun.id, ...nextInput });
    expect(client.getResearch).not.toHaveBeenCalled();
  });

  it("hides previous-owner run, source and error immediately and rejects late callbacks", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    const client = fakeClient({ startResearch: vi.fn(async () => response({ ...active, backgroundAccepted: true })),
      getResearch: vi.fn(() => pending.promise) });
    const { result, rerender } = renderHook(({ userId }) => useRoleResearch({ ...options(client), userId }), { initialProps: { userId: "owner-a" } });
    await flush();
    await act(() => result.current.start(input));
    expect(result.current.run?.backgroundAccepted).toBe(true);
    let operation!: Promise<boolean>;
    act(() => { operation = result.current.refresh(); });
    rerender({ userId: "owner-b" });
    expect(result.current).toMatchObject({ state: { kind: "idle" }, run: null, planningData: null, error: null, requestId: null });
    await act(async () => { pending.resolve(response({ ...ready, backgroundAccepted: true })); await operation; });
    expect(result.current.run).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(v2Key)).toBeNull();
    expect(await timerCount()).toBe(0);
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
    await act(async () => { pending.resolve(response({ ...ready, backgroundAccepted: true })); });
    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(v2Key)).toBeNull();
    expect(result.current.run).toBeNull();
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

  it("blocks research while storage is unavailable", async () => {
    const storage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); }, removeItem() { throw new Error("blocked"); } };
    const client = fakeClient({ startResearch: vi.fn(async () => response(ready)) });
    const { result } = renderHook(() => useRoleResearch({ ...options(client), storage }));
    await flush();
    await act(() => result.current.start(input));
    expect(result.current.state.kind).toBe("failed");
    expect(result.current.error?.requestId).toBeNull();
    expect(client.startResearch).not.toHaveBeenCalled();
  });
});
