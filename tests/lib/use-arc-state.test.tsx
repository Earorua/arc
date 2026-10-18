import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flagshipRole } from "../../app/data/flagship-role";
import type { ArcCloudClient } from "../../app/lib/cloud-client";
import { ArcApiError } from "../../app/lib/cloud-client";
import {
  completeDemoUnit,
  createDemoState,
  mergeSetup,
  saveDemoState,
} from "../../app/lib/demo-store";
import { enqueueOfflineMutation, readOfflineQueue } from "../../app/lib/offline-queue";
import { useArcState } from "../../app/lib/use-arc-state";

const anonymousSession = () => ({ data: null, isPending: false });
const signedInSessionFor = (id: string) => () => ({
  data: { user: { id, name: "Arc Learner", email: "learner@example.com" } },
  isPending: false,
});
const signedInSession = signedInSessionFor("user-owner");

function fakeClient(overrides: Partial<Record<keyof ArcCloudClient, unknown>> = {}) {
  return {
    loadWorkspace: vi.fn().mockResolvedValue(null),
    importLocal: vi.fn(),
    saveSetup: vi.fn(),
    completeUnit: vi.fn(),
    replay: vi.fn(),
    ...overrides,
  } as unknown as ArcCloudClient;
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("useArcState", () => {
  it.each(["account", "roundtrip", "unmount", "signal"].flatMap((transition) => ["resolve", "reject"].map((settlement) => ({ transition, settlement }))))("discards $settlement after $transition cancels a setup save", async ({ transition, settlement }) => {
    const initial = createDemoState();
    const snapshot = { state: initial, activeGoalId: "goal-cloud", revision: "revision-cloud" };
    let resolveSave!: (value: typeof snapshot) => void;
    let rejectSave!: (error: unknown) => void;
    const client = fakeClient({ loadWorkspace: vi.fn().mockResolvedValue(snapshot), saveSetup: vi.fn(() => new Promise((resolve, reject) => { resolveSave = resolve; rejectSave = reject; })) });
    const hook = renderHook(({ owner }) => useArcState({ client, useSession: signedInSessionFor(owner) }), { initialProps: { owner: "owner-a" } });
    await waitFor(() => expect(hook.result.current.source).toBe("cloud"));
    const retained = hook.result.current.saveSetup;
    const cancellation = new AbortController();
    const setup = { ...initial.setup, roleId: "Data Product Manager" };
    let pending!: Promise<boolean>;
    act(() => { pending = retained(setup, cancellation.signal); });
    if (transition === "unmount") hook.unmount();
    else if (transition === "signal") cancellation.abort();
    else {
      hook.rerender({ owner: "owner-b" });
      if (transition === "roundtrip") hook.rerender({ owner: "owner-a" });
      await waitFor(() => expect(hook.result.current.source).toBe("cloud"));
    }
    let saved: boolean | undefined;
    await act(async () => {
      if (settlement === "resolve") resolveSave({ ...snapshot, state: mergeSetup(initial, setup) });
      else rejectSave(new TypeError("synthetic offline"));
      saved = await pending;
    });
    expect(saved).toBe(false);
    expect(readOfflineQueue()).toEqual([]);
    expect(hook.result.current.state?.setup.roleId).toBe(initial.setup.roleId);
    expect(vi.mocked(client.saveSetup).mock.calls[0]![2]?.aborted).toBe(true);
    if (transition !== "signal") {
      await act(async () => { expect(await retained(setup)).toBe(false); });
      expect(client.saveSetup).toHaveBeenCalledOnce();
    }
  });
  it("does not retry cancellation as an offline setup mutation, but preserves ordinary offline saves", async () => {
    const snapshot = { state: createDemoState(), activeGoalId: "goal-cloud", revision: "revision-cloud" };
    const client = fakeClient({ loadWorkspace: vi.fn().mockResolvedValue(snapshot), saveSetup: vi.fn().mockRejectedValueOnce(new DOMException("Cancelled", "AbortError")).mockRejectedValueOnce(new TypeError("synthetic offline")) });
    const { result } = renderHook(() => useArcState({ client, useSession: signedInSession }));
    await waitFor(() => expect(result.current.source).toBe("cloud"));
    await act(async () => { expect(await result.current.saveSetup(snapshot.state.setup)).toBe(false); });
    expect(readOfflineQueue()).toEqual([]);
    await act(async () => { expect(await result.current.saveSetup(snapshot.state.setup)).toBe(true); });
    expect(readOfflineQueue()).toMatchObject([{ kind: "save-setup", payload: { setup: snapshot.state.setup } }]);
  });
  it("retains guarded local behavior for an anonymous learner", async () => {
    const local = mergeSetup(createDemoState(), {
      ...createDemoState().setup,
      weeklyMinutes: 300,
    });
    saveDemoState(local);
    const client = fakeClient();

    const { result } = renderHook(() => useArcState({ client, useSession: anonymousSession }));

    await waitFor(() => expect(result.current.source).toBe("local"));
    expect(result.current.state).toEqual(local);
    expect(client.loadWorkspace).not.toHaveBeenCalled();
  });

  it("loads authoritative cloud state and prompts only for meaningful local work", async () => {
    const cloudState = mergeSetup(createDemoState(), {
      ...createDemoState().setup,
      targetWeeks: 12,
    });
    const client = fakeClient({
      loadWorkspace: vi.fn().mockResolvedValue({
        state: cloudState,
        activeGoalId: "goal-cloud",
        revision: "revision-cloud",
      }),
    });

    const untouched = renderHook(() => useArcState({ client, useSession: signedInSession }));
    await waitFor(() => expect(untouched.result.current.source).toBe("cloud"));
    expect(untouched.result.current.state).toEqual(cloudState);
    expect(untouched.result.current.migration).toBe("none");
    untouched.unmount();

    saveDemoState(completeDemoUnit(createDemoState(), flagshipRole.today));
    const meaningful = renderHook(() => useArcState({ client, useSession: signedInSession }));
    await waitFor(() => expect(meaningful.result.current.source).toBe("cloud"));
    expect(meaningful.result.current.migration).toBe("available");
    expect(meaningful.result.current.state).toEqual(cloudState);
    expect(meaningful.result.current.localMigrationState).toEqual(
      completeDemoUnit(createDemoState(), flagshipRole.today),
    );
  });

  it("keeps one snapshot dismissed for the same user until device work changes", async () => {
    const local = mergeSetup(createDemoState(), {
      ...createDemoState().setup,
      weeklyMinutes: 300,
    });
    saveDemoState(local);
    const client = fakeClient();

    const first = renderHook(() => useArcState({
      client,
      useSession: signedInSessionFor("user-owner"),
    }));
    await waitFor(() => expect(first.result.current.migration).toBe("available"));
    act(() => first.result.current.dismissMigration());
    expect(first.result.current.migration).toBe("none");
    first.unmount();

    const sameUser = renderHook(() => useArcState({
      client,
      useSession: signedInSessionFor("user-owner"),
    }));
    await waitFor(() => expect(sameUser.result.current.source).not.toBe("restoring"));
    expect(sameUser.result.current.migration).toBe("none");
    sameUser.unmount();

    saveDemoState(mergeSetup(local, { ...local.setup, weeklyMinutes: 360 }));
    const changedSnapshot = renderHook(() => useArcState({
      client,
      useSession: signedInSessionFor("user-owner"),
    }));
    await waitFor(() => expect(changedSnapshot.result.current.migration).toBe("available"));
    changedSnapshot.unmount();

    saveDemoState(local);
    const otherUser = renderHook(() => useArcState({
      client,
      useSession: signedInSessionFor("user-other"),
    }));
    await waitFor(() => expect(otherUser.result.current.migration).toBe("available"));
  });

  it("never imports automatically and switches to cloud only after explicit success", async () => {
    const local = completeDemoUnit(createDemoState(), flagshipRole.today);
    saveDemoState(local);
    const cloudSnapshot = {
      state: local,
      activeGoalId: "goal-imported",
      revision: "revision-imported",
    };
    const client = fakeClient({
      loadWorkspace: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue(cloudSnapshot),
      importLocal: vi.fn().mockResolvedValue({
        migrationId: "migration-original",
        status: "imported",
        activeGoalId: "goal-imported",
        importedCompletionCount: 1,
        importedProofCount: 1,
        availableResolutions: [],
      }),
    });
    const { result, unmount } = renderHook(() => useArcState({
      client,
      useSession: signedInSession,
      createMutationId: () => "migration-original",
    }));

    await waitFor(() => expect(result.current.migration).toBe("available"));
    expect(client.importLocal).not.toHaveBeenCalled();

    await act(() => result.current.importLocal());

    expect(client.importLocal).toHaveBeenCalledWith(local, "reject", "migration-original");
    expect(result.current.source).toBe("cloud");
    expect(result.current.migration).toBe("imported");
    expect(result.current.state).toEqual(local);

    unmount();
    const remounted = renderHook(() => useArcState({
      client,
      useSession: signedInSessionFor("user-owner"),
    }));
    await waitFor(() => expect(remounted.result.current.source).toBe("cloud"));
    expect(remounted.result.current.migration).toBe("none");
  });

  it("queues one original completion mutation after cloud connectivity fails", async () => {
    const initial = createDemoState();
    const client = fakeClient({
      loadWorkspace: vi.fn().mockResolvedValue({
        state: initial,
        activeGoalId: "goal-cloud",
        revision: "revision-cloud",
      }),
      completeUnit: vi.fn().mockRejectedValue(new TypeError("offline")),
    });
    const { result } = renderHook(() => useArcState({
      client,
      useSession: signedInSession,
      createMutationId: () => "completion-original-id",
    }));
    await waitFor(() => expect(result.current.source).toBe("cloud"));

    let first = false;
    let duplicate = false;
    await act(async () => {
      first = await result.current.completeUnit(flagshipRole.today);
      duplicate = await result.current.completeUnit(flagshipRole.today);
    });

    expect(first).toBe(true);
    expect(duplicate).toBe(true);
    expect(result.current.source).toBe("offline-cloud");
    expect(client.completeUnit).toHaveBeenCalledTimes(1);
    expect(readOfflineQueue()).toMatchObject([{
      id: "completion-original-id",
      payload: { mutationId: "completion-original-id" },
    }]);
  });

  it("becomes read-only without changing the visible cloud snapshot when the queue is full", async () => {
    for (let index = 0; index < 100; index += 1) {
      const mutationId = `queued-setup-${String(index).padStart(3, "0")}`;
      enqueueOfflineMutation({
        id: mutationId,
        kind: "save-setup",
        createdAt: "2026-07-28T00:00:00.000Z",
        payload: { mutationId, setup: createDemoState().setup },
      });
    }
    const initial = createDemoState();
    const client = fakeClient({
      loadWorkspace: vi.fn().mockResolvedValue({
        state: initial,
        activeGoalId: "goal-cloud",
        revision: "revision-cloud",
      }),
    });
    const { result } = renderHook(() => useArcState({
      client,
      useSession: signedInSession,
      createMutationId: () => "new-setup-mutation",
    }));
    await waitFor(() => expect(result.current.source).toBe("offline-cloud"));

    let accepted = true;
    await act(async () => {
      accepted = await result.current.saveSetup({
        ...initial.setup,
        weeklyMinutes: 300,
      });
    });

    expect(accepted).toBe(false);
    expect(result.current.state).toEqual(initial);
    expect(readOfflineQueue()).toHaveLength(100);
    expect(client.saveSetup).not.toHaveBeenCalled();
  });

  it("preserves device state and identifies an expired cloud session", async () => {
    const local = completeDemoUnit(createDemoState(), flagshipRole.today);
    saveDemoState(local);
    const client = fakeClient({
      loadWorkspace: vi.fn().mockRejectedValue(new ArcApiError(
        401,
        "UNAUTHENTICATED",
        "Session expired",
        "request-expired",
      )),
    });

    const { result } = renderHook(() => useArcState({
      client,
      useSession: signedInSession,
    }));

    await waitFor(() => expect(result.current.recovery).toBe("session-expired"));
    expect(result.current.state).toEqual(local);
    expect(result.current.source).toBe("offline-cloud");
  });
});
