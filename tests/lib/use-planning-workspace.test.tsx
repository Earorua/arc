import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeneratePlanningRequest, PlanningMutationResponse, PlanningWorkspaceResponse } from "../../app/contracts/planning-api";
import { PLANNING_SCHEMA_VERSION, type PlanningMutationResult, type PlanningSourceContext } from "../../app/contracts/planning";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import type { PlanningClient } from "../../app/lib/planning-client";
import {
  createLocalPlanningRepository,
  type LocalPlanningRepository,
} from "../../app/lib/planning/local-repository";
import { ArcApiError } from "../../app/lib/cloud-client";
import { usePlanningWorkspace } from "../../app/lib/use-planning-workspace";

const anonymous = () => ({ data: null, isPending: false });
const signed = () => ({ data: { user: { id: "user-1", name: "Learner", email: "learner@example.com" } }, isPending: false });

function signedAs(id: string) {
  return { data: { user: { id, name: id, email: `${id}@example.com` } }, isPending: false };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function local(overrides: Partial<LocalPlanningRepository> = {}) {
  return {
    load: vi.fn().mockResolvedValue(null),
    readImportSource: vi.fn().mockResolvedValue(null),
    readImportProgress: vi.fn().mockResolvedValue(null),
    updateImportProgress: vi.fn().mockResolvedValue(undefined),
    generate: vi.fn(), appendEvent: vi.fn(),
    accept: vi.fn(), discard: vi.fn(), ...overrides,
  } as unknown as LocalPlanningRepository;
}

const flagshipSourceContext: PlanningSourceContext = {
  reference: { source: "flagship", roleId: "ai-native-full-stack-engineer" },
  blueprint: flagshipBlueprint,
  registry: flagshipUnitRegistry,
};

function workspaceResponse(workspace: PlanningWorkspaceResponse["workspace"]): PlanningWorkspaceResponse {
  return { workspace, sourceContext: workspace ? flagshipSourceContext : null };
}

function mutationResponse(result: PlanningMutationResult): PlanningMutationResponse {
  return { result, sourceContext: flagshipSourceContext };
}

function cloud(overrides: Partial<PlanningClient> = {}) {
  return {
    loadWorkspace: vi.fn().mockResolvedValue(workspaceResponse(null)), generate: vi.fn(), appendEvent: vi.fn(),
    acceptReplan: vi.fn(), discardReplan: vi.fn(), ...overrides,
  } as unknown as PlanningClient;
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function generationInput(): GeneratePlanningRequest {
  return {
    mutationId: "mutation-initial",
    roleId: "ai-native-full-stack-engineer",
    planningDate: "2026-08-17",
    audit: {
      id: "audit-controller", schemaVersion: PLANNING_SCHEMA_VERSION,
      blueprintId: flagshipBlueprint.id, blueprintVersion: flagshipBlueprint.version,
      answers: flagshipBlueprint.skills.map(({ id: skillId }) => ({ skillId, level: "guided" as const, evidenceRefs: [] })),
      evidence: [], createdBy: "learner", inputFingerprint: "audit-controller-fingerprint",
    },
    availability: {
      id: "availability-controller", schemaVersion: PLANNING_SCHEMA_VERSION, timeZone: "Asia/Shanghai",
      weekdays: { monday: 90, tuesday: 90, wednesday: 90, thursday: 90, friday: 90, saturday: 90, sunday: 90 },
      exceptions: [], weeklyMinutes: 630, inputFingerprint: "availability-controller-fingerprint",
    },
    target: { id: "target-controller", schemaVersion: PLANNING_SCHEMA_VERSION, targetWeeks: 18, inputFingerprint: "target-controller-fingerprint" },
    selectedScope: "full-scope",
  };
}

async function generatedFixture() {
  let id = 0;
  const repository = createLocalPlanningRepository({
    storage: new MemoryStorage(), createId: () => `controller-${++id}`,
    now: () => new Date("2026-08-17T00:00:00.000Z"),
  });
  const generated = await repository.generate(generationInput());
  const source = await repository.readImportSource();
  if (!source) throw new Error("Expected fixture source");
  return { generated, repository, source };
}

async function importFixture() {
  const { generated, repository } = await generatedFixture();
  const unit = generated.workspace.dailyUnits.find(({ required }) => required);
  if (!unit) throw new Error("Expected a required unit");
  const proposed = await repository.appendEvent({
    mutationId: "mutation-event-one",
    baseVersionId: generated.workspace.activePlanVersionId,
    event: { kind: "skipped", unitId: unit.id, planningDate: "2026-08-17" },
  });
  if (!proposed.workspace.pendingPlanVersionId) throw new Error("Expected a candidate plan");
  const accepted = await repository.accept({
    mutationId: "mutation-event-two",
    baseVersionId: proposed.workspace.activePlanVersionId,
    candidatePlanVersionId: proposed.workspace.pendingPlanVersionId,
  });
  const source = await repository.readImportSource();
  if (!source) throw new Error("Expected import source");
  return { generated, proposed, accepted, repository, source };
}

let locksDescriptor: PropertyDescriptor | undefined;
beforeEach(() => {
  window.localStorage.clear();
  locksDescriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: (_name: string, _options: unknown, action: () => unknown) => Promise.resolve().then(action) },
  });
});
afterEach(() => {
  cleanup();
  if (locksDescriptor) Object.defineProperty(navigator, "locks", locksDescriptor);
  else Reflect.deleteProperty(navigator, "locks");
});

describe("usePlanningWorkspace", () => {
  it("loads guest state only from the local planning repository", async () => {
    const repository = local();
    const client = cloud();
    const { result } = renderHook(() => usePlanningWorkspace({ local: repository, client, useSession: anonymous }));
    await waitFor(() => expect(result.current.source).toBe("local"));
    expect(repository.load).toHaveBeenCalledTimes(1);
    expect(client.loadWorkspace).not.toHaveBeenCalled();
  });

  it("mutates guest planning only through the local repository", async () => {
    const { generated } = await generatedFixture();
    const repository = local({
      load: vi.fn().mockResolvedValue(generated.workspace),
      appendEvent: vi.fn().mockResolvedValue(generated),
    });
    const client = cloud();
    const { result } = renderHook(() => usePlanningWorkspace({
      local: repository,
      client,
      useSession: anonymous,
      createMutationId: () => "mutation-guest-record",
    }));
    await waitFor(() => expect(result.current.source).toBe("local"));
    await expect(act(() => result.current.record({
      kind: "skipped",
      unitId: generated.workspace.dailyUnits[0]!.id,
      planningDate: "2026-08-17",
    }))).resolves.toBe(true);
    expect(repository.appendEvent).toHaveBeenCalledWith(expect.objectContaining({ mutationId: "mutation-guest-record" }));
    expect(client.appendEvent).not.toHaveBeenCalled();
  });

  it("loads signed state only from the authenticated planning client", async () => {
    const repository = local();
    const { generated } = await generatedFixture();
    const client = cloud({ loadWorkspace: vi.fn().mockResolvedValue(workspaceResponse(generated.workspace)) });
    const { result } = renderHook(() => usePlanningWorkspace({ local: repository, client, useSession: signed }));
    await waitFor(() => expect(result.current.source).toBe("cloud"));
    expect(client.loadWorkspace).toHaveBeenCalledTimes(1);
    expect(repository.load).not.toHaveBeenCalled();
    expect(repository.readImportSource).not.toHaveBeenCalled();
  });

  it("keeps authenticated source context only in memory and clears it across identity changes", async () => {
    const { generated } = await generatedFixture();
    const context = flagshipSourceContext;
    let session = signed();
    const client = cloud({
      loadWorkspace: vi.fn().mockResolvedValue({ workspace: generated.workspace, sourceContext: context }),
    });
    const { result, rerender } = renderHook(() => usePlanningWorkspace({
      local: local(), client, useSession: () => session,
    }));
    await waitFor(() => expect(result.current.sourceContext).toEqual(context));
    expect(window.localStorage.length).toBe(0);

    session = signedAs("user-2");
    rerender();
    expect(result.current.sourceContext).toBeNull();
  });

  it("never imports automatically and rejects a second in-flight cloud write", async () => {
    const { generated } = await generatedFixture();
    let resolveWrite!: (value: PlanningMutationResponse) => void;
    const appendEvent = vi.fn(() => new Promise<PlanningMutationResponse>((resolve) => { resolveWrite = resolve; }));
    const client = cloud({ appendEvent, loadWorkspace: vi.fn().mockResolvedValue(workspaceResponse(generated.workspace)) });
    const { result } = renderHook(() => usePlanningWorkspace({ local: local(), client, useSession: signed }));
    await waitFor(() => expect(result.current.source).toBe("cloud"));
    expect(client.generate).not.toHaveBeenCalled();
    expect(client.appendEvent).not.toHaveBeenCalled();
    let first!: Promise<boolean>;
    act(() => { first = result.current.record({ kind: "skipped", unitId: "unit-1", planningDate: "2026-08-17" }); });
    await expect(result.current.record({ kind: "skipped", unitId: "unit-1", planningDate: "2026-08-17" })).resolves.toBe(false);
    await act(async () => {
      resolveWrite(mutationResponse(generated));
      await first;
    });
  });

  it("offers a meaningful local plan for explicit import without starting automatically", async () => {
    const { source } = await generatedFixture();
    const repository = local({ readImportSource: vi.fn().mockResolvedValue(source) });
    const client = cloud();
    const { result } = renderHook(() => usePlanningWorkspace({ local: repository, client, useSession: signed }));
    await waitFor(() => expect(result.current.migration).toBe("available"));
    expect(result.current.workspace).toEqual(source.workspace);
    expect(result.current.source).toBe("local");
    expect(client.generate).not.toHaveBeenCalled();
  });

  it("keeps the last cloud snapshot visible and refuses writes after cloud loss", async () => {
    const { generated } = await generatedFixture();
    const loadWorkspace = vi.fn()
      .mockResolvedValueOnce(workspaceResponse(generated.workspace))
      .mockRejectedValueOnce(new Error("offline"));
    const client = cloud({ loadWorkspace });
    const { result } = renderHook(() => usePlanningWorkspace({ local: local(), client, useSession: signed }));
    await waitFor(() => expect(result.current.source).toBe("cloud"));
    await act(() => result.current.retry());
    expect(result.current.source).toBe("offline-cloud");
    expect(result.current.workspace).toEqual(generated.workspace);
    await expect(result.current.record({ kind: "skipped", unitId: "unit-1", planningDate: "2026-08-17" })).resolves.toBe(false);
    expect(client.appendEvent).not.toHaveBeenCalled();
  });

  it("exposes session expiry without deleting the visible cloud snapshot", async () => {
    const { generated } = await generatedFixture();
    const client = cloud({
      loadWorkspace: vi.fn().mockResolvedValue(workspaceResponse(generated.workspace)),
      appendEvent: vi.fn().mockRejectedValue(new ArcApiError(401, "UNAUTHORIZED", "Sign in", "request-1", "sign-in")),
    });
    const { result } = renderHook(() => usePlanningWorkspace({ local: local(), client, useSession: signed }));
    await waitFor(() => expect(result.current.source).toBe("cloud"));
    const unitId = generated.workspace.dailyUnits[0]!.id;
    await act(() => result.current.record({ kind: "skipped", unitId, planningDate: "2026-08-17" }));
    expect(result.current.recovery).toBe("session-expired");
    expect(result.current.workspace).toEqual(generated.workspace);
  });

  it("distinguishes an unavailable catalogue version from a retryable outage", async () => {
    const client = cloud({
      loadWorkspace: vi.fn().mockRejectedValue(new ArcApiError(
        503,
        "PLANNING_UNAVAILABLE",
        "Planning is temporarily unavailable.",
        "request-version",
        "rebuild",
      )),
    });
    const { result } = renderHook(() => usePlanningWorkspace({ local: local(), client, useSession: signed }));

    await waitFor(() => expect(result.current.recovery).toBe("version-unavailable"));
    expect(result.current.workspace).toBeNull();
    expect(result.current.source).toBe("offline-cloud");
  });

  it("explicitly imports initial state then replays learning and decision events in sequence", async () => {
    const { generated, proposed, accepted, repository, source } = await importFixture();
    const loadWorkspace = vi.fn()
      .mockResolvedValueOnce(workspaceResponse(null))
      .mockResolvedValueOnce(workspaceResponse(accepted.workspace));
    const client = cloud({
      loadWorkspace,
      generate: vi.fn().mockResolvedValue(mutationResponse(generated)),
      appendEvent: vi.fn().mockResolvedValue(mutationResponse(proposed)),
      acceptReplan: vi.fn().mockResolvedValue(mutationResponse(accepted)),
    });
    const { result } = renderHook(() => usePlanningWorkspace({ local: repository, client, useSession: signed }));
    await waitFor(() => expect(result.current.migration).toBe("available"));

    await expect(act(() => result.current.importLocal())).resolves.toBe(true);

    expect(client.generate).toHaveBeenCalledWith(expect.objectContaining({ mutationId: source.generationMutationId }));
    expect(client.appendEvent).toHaveBeenCalledWith(expect.objectContaining({ mutationId: "mutation-event-one" }));
    expect(client.acceptReplan).toHaveBeenCalledWith(expect.objectContaining({ mutationId: "mutation-event-two" }));
    expect(vi.mocked(client.appendEvent).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(client.acceptReplan).mock.invocationCallOrder[0]!);
    expect(result.current).toMatchObject({ source: "cloud", migration: "imported", recovery: "none" });
    expect(await repository.readImportProgress("user-1", source.workspaceFingerprint))
      .toEqual(expect.objectContaining({ lastImportedSequence: 2, completed: true }));
  });

  it("resumes an interrupted import without replaying an already persisted local sequence", async () => {
    const { generated, proposed, accepted, repository, source } = await importFixture();
    const acceptReplan = vi.fn()
      .mockRejectedValueOnce(new Error("network interrupted"))
      .mockResolvedValueOnce(mutationResponse(accepted));
    const client = cloud({
      loadWorkspace: vi.fn()
        .mockResolvedValueOnce(workspaceResponse(null))
        .mockResolvedValueOnce(workspaceResponse(proposed.workspace))
        .mockResolvedValueOnce(workspaceResponse(accepted.workspace)),
      generate: vi.fn().mockResolvedValue(mutationResponse(generated)),
      appendEvent: vi.fn().mockResolvedValue(mutationResponse(proposed)),
      acceptReplan,
    });
    const { result } = renderHook(() => usePlanningWorkspace({ local: repository, client, useSession: signed }));
    await waitFor(() => expect(result.current.migration).toBe("available"));

    await expect(act(() => result.current.importLocal())).resolves.toBe(false);
    expect(await repository.readImportProgress("user-1", source.workspaceFingerprint))
      .toEqual(expect.objectContaining({ lastImportedSequence: 1, completed: false }));
    await expect(act(() => result.current.importLocal())).resolves.toBe(true);

    expect(client.generate).toHaveBeenCalledTimes(2);
    expect(client.appendEvent).toHaveBeenCalledTimes(1);
    expect(client.acceptReplan).toHaveBeenCalledTimes(2);
    expect(await repository.readImportProgress("user-1", source.workspaceFingerprint))
      .toEqual(expect.objectContaining({ lastImportedSequence: 2, completed: true }));
  });

  it("does not complete progress when strict final cloud verification mismatches", async () => {
    const { generated, proposed, accepted, repository, source } = await importFixture();
    const mismatched = structuredClone(accepted.workspace);
    mismatched.activePlanVersionId = generated.workspace.activePlanVersionId;
    const client = cloud({
      loadWorkspace: vi.fn().mockResolvedValueOnce(workspaceResponse(null)).mockResolvedValueOnce(workspaceResponse(mismatched)),
      generate: vi.fn().mockResolvedValue(mutationResponse(generated)),
      appendEvent: vi.fn().mockResolvedValue(mutationResponse(proposed)),
      acceptReplan: vi.fn().mockResolvedValue(mutationResponse(accepted)),
    });
    const { result } = renderHook(() => usePlanningWorkspace({ local: repository, client, useSession: signed }));
    await waitFor(() => expect(result.current.migration).toBe("available"));
    await expect(act(() => result.current.importLocal())).resolves.toBe(false);
    expect(result.current.migration).toBe("failed");
    expect(await repository.readImportProgress("user-1", source.workspaceFingerprint))
      .toEqual(expect.objectContaining({ completed: false }));
  });

  it("keeps local bytes and visible planning unchanged after a cloud import conflict", async () => {
    const { repository, source } = await importFixture();
    const before = await repository.load();
    const client = cloud({
      generate: vi.fn().mockRejectedValue(new ArcApiError(409, "CONFLICT", "Safe conflict", "request-conflict")),
    });
    const { result } = renderHook(() => usePlanningWorkspace({ local: repository, client, useSession: signed }));
    await waitFor(() => expect(result.current.migration).toBe("available"));
    await expect(act(() => result.current.importLocal())).resolves.toBe(false);
    expect(result.current.recovery).toBe("conflict");
    expect(result.current.workspace).toEqual(before);
    expect(await repository.load()).toEqual(before);
    expect(await repository.readImportProgress("user-1", source.workspaceFingerprint)).toBeNull();
  });

  it("does not instantiate the adaptive controller outside the flagship caller boundary", () => {
    const instantiate = vi.fn();
    function AdaptiveController() {
      instantiate();
      usePlanningWorkspace({ local: local(), client: cloud(), useSession: anonymous });
      return null;
    }
    function RoleBoundary({ roleId }: { roleId: string }) {
      return roleId === "ai-native-full-stack-engineer" ? <AdaptiveController /> : null;
    }
    render(<RoleBoundary roleId="custom-role" />);
    expect(instantiate).not.toHaveBeenCalled();
  });

  it("hides user A immediately on an identity switch and ignores A resolving after B", async () => {
    const { generated } = await generatedFixture();
    const workspaceA = structuredClone(generated.workspace);
    workspaceA.id = "workspace-user-a";
    const workspaceB = structuredClone(generated.workspace);
    workspaceB.id = "workspace-user-b";
    const contextA = structuredClone(flagshipSourceContext);
    const contextB = structuredClone(flagshipSourceContext);
    contextA.blueprint = { ...contextA.blueprint, summary: "User A has a distinct but valid planning source catalogue." };
    contextB.blueprint = { ...contextB.blueprint, summary: "User B has a distinct but valid planning source catalogue." };
    const staleA = deferred<PlanningWorkspaceResponse>();
    const pendingB = deferred<PlanningWorkspaceResponse>();
    const loadWorkspace = vi.fn()
      .mockResolvedValueOnce({ workspace: workspaceA, sourceContext: contextA })
      .mockReturnValueOnce(staleA.promise)
      .mockReturnValueOnce(pendingB.promise);
    const client = cloud({ loadWorkspace });
    const { result, rerender } = renderHook(
      ({ identity }) => usePlanningWorkspace({
        local: local(), client, useSession: () => signedAs(identity),
      }),
      { initialProps: { identity: "user-a" } },
    );
    await waitFor(() => expect(result.current.workspace?.id).toBe("workspace-user-a"));
    let staleRetry!: Promise<void>;
    act(() => { staleRetry = result.current.retry(); });
    await waitFor(() => expect(loadWorkspace).toHaveBeenCalledTimes(2));

    rerender({ identity: "user-b" });
    expect(result.current.workspace).toBeNull();
    expect(result.current.source).toBe("restoring");
    await expect(result.current.record({
      kind: "skipped",
      unitId: workspaceA.dailyUnits[0]!.id,
      planningDate: "2026-08-17",
    })).resolves.toBe(false);
    await expect(result.current.generate(generationInput())).resolves.toBe(false);
    await expect(result.current.accept("candidate-a")).resolves.toBe(false);
    await expect(result.current.discard("candidate-a")).resolves.toBe(false);
    await expect(result.current.importLocal()).resolves.toBe(false);
    expect(client.appendEvent).not.toHaveBeenCalled();
    expect(client.generate).not.toHaveBeenCalled();
    expect(client.acceptReplan).not.toHaveBeenCalled();
    expect(client.discardReplan).not.toHaveBeenCalled();
    await waitFor(() => expect(loadWorkspace).toHaveBeenCalledTimes(3));
    await act(async () => { pendingB.resolve({ workspace: workspaceB, sourceContext: contextB }); });
    await waitFor(() => expect(result.current.workspace?.id).toBe("workspace-user-b"));
    expect(result.current.sourceContext).toEqual(contextB);
    await act(async () => {
      staleA.resolve({ workspace: workspaceA, sourceContext: contextA });
      await staleRetry;
    });
    expect(result.current.workspace?.id).toBe("workspace-user-b");
    expect(result.current.sourceContext).toEqual(contextB);
  });

  it("never exposes cloud bytes while switching signed to guest", async () => {
    const { generated } = await generatedFixture();
    const guestLoad = deferred<null>();
    const repository = local({ load: vi.fn().mockReturnValue(guestLoad.promise) });
    const client = cloud({ loadWorkspace: vi.fn().mockResolvedValue(workspaceResponse(generated.workspace)) });
    const { result, rerender } = renderHook(
      ({ signedIn }) => usePlanningWorkspace({
        local: repository,
        client,
        useSession: () => signedIn ? signedAs("user-a") : anonymous(),
      }),
      { initialProps: { signedIn: true } },
    );
    await waitFor(() => expect(result.current.workspace).toEqual(generated.workspace));
    rerender({ signedIn: false });
    expect(result.current).toMatchObject({ workspace: null, source: "restoring" });
    await waitFor(() => expect(repository.load).toHaveBeenCalledTimes(1));
    await act(async () => { guestLoad.resolve(null); });
    await waitFor(() => expect(result.current.source).toBe("local"));
  });

  it("never exposes guest bytes while switching guest to signed", async () => {
    const { generated } = await generatedFixture();
    const cloudLoad = deferred<PlanningWorkspaceResponse>();
    const repository = local({ load: vi.fn().mockResolvedValue(generated.workspace) });
    const client = cloud({ loadWorkspace: vi.fn().mockReturnValue(cloudLoad.promise) });
    const { result, rerender } = renderHook(
      ({ signedIn }) => usePlanningWorkspace({
        local: repository,
        client,
        useSession: () => signedIn ? signedAs("user-a") : anonymous(),
      }),
      { initialProps: { signedIn: false } },
    );
    await waitFor(() => expect(result.current.workspace).toEqual(generated.workspace));
    rerender({ signedIn: true });
    expect(result.current).toMatchObject({ workspace: null, source: "restoring" });
    await waitFor(() => expect(client.loadWorkspace).toHaveBeenCalledTimes(1));
    await act(async () => { cloudLoad.resolve(workspaceResponse(null)); });
  });

  it("discards a stale cloud append completion without publishing or changing recovery", async () => {
    const { generated } = await generatedFixture();
    const append = deferred<PlanningMutationResponse>();
    const pendingB = deferred<PlanningWorkspaceResponse>();
    const loadWorkspace = vi.fn()
      .mockResolvedValueOnce(workspaceResponse(generated.workspace))
      .mockReturnValueOnce(pendingB.promise);
    const client = cloud({ loadWorkspace, appendEvent: vi.fn().mockReturnValue(append.promise) });
    const { result, rerender } = renderHook(
      ({ identity }) => usePlanningWorkspace({ local: local(), client, useSession: () => signedAs(identity) }),
      { initialProps: { identity: "user-a" } },
    );
    await waitFor(() => expect(result.current.source).toBe("cloud"));
    let staleWrite!: Promise<boolean>;
    act(() => {
      staleWrite = result.current.record({
        kind: "skipped", unitId: generated.workspace.dailyUnits[0]!.id, planningDate: "2026-08-17",
      });
    });
    rerender({ identity: "user-b" });
    await waitFor(() => expect(loadWorkspace).toHaveBeenCalledTimes(2));
    await act(async () => {
      append.resolve(mutationResponse(generated));
      await staleWrite;
    });
    expect(result.current).toMatchObject({ workspace: null, source: "restoring", recovery: "none" });
    await act(async () => { pendingB.resolve(workspaceResponse(generated.workspace)); });
    await waitFor(() => expect(result.current.source).toBe("cloud"));
  });

  it("stops a stale import after remote generation without writing progress or replaying events", async () => {
    const { generated, repository, source } = await importFixture();
    const remoteGeneration = deferred<PlanningMutationResponse>();
    const pendingB = deferred<PlanningWorkspaceResponse>();
    const loadWorkspace = vi.fn()
      .mockResolvedValueOnce(workspaceResponse(null))
      .mockReturnValueOnce(pendingB.promise);
    const updateImportProgress = vi.spyOn(repository, "updateImportProgress");
    const client = cloud({
      loadWorkspace,
      generate: vi.fn().mockReturnValue(remoteGeneration.promise),
    });
    const { result, rerender } = renderHook(
      ({ identity }) => usePlanningWorkspace({ local: repository, client, useSession: () => signedAs(identity) }),
      { initialProps: { identity: "user-a" } },
    );
    await waitFor(() => expect(result.current.migration).toBe("available"));
    let staleImport!: Promise<boolean>;
    act(() => { staleImport = result.current.importLocal(); });
    await waitFor(() => expect(client.generate).toHaveBeenCalledTimes(1));
    rerender({ identity: "user-b" });
    await waitFor(() => expect(loadWorkspace).toHaveBeenCalledTimes(2));
    await act(async () => {
      remoteGeneration.resolve(mutationResponse(generated));
      await staleImport;
    });
    expect(updateImportProgress).not.toHaveBeenCalled();
    expect(client.appendEvent).not.toHaveBeenCalled();
    expect(client.acceptReplan).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ workspace: null, source: "restoring", recovery: "none" });
    expect(await repository.readImportProgress("user-a", source.workspaceFingerprint)).toBeNull();
    await act(async () => { pendingB.resolve(workspaceResponse(null)); });
  });

  it("hides user A migration and recovery immediately while user B restores", async () => {
    const { repository } = await importFixture();
    const pendingB = deferred<PlanningWorkspaceResponse>();
    const loadWorkspace = vi.fn()
      .mockResolvedValueOnce(workspaceResponse(null))
      .mockReturnValueOnce(pendingB.promise);
    const client = cloud({
      loadWorkspace,
      generate: vi.fn().mockRejectedValue(new ArcApiError(409, "CONFLICT", "Safe conflict", "request-conflict")),
    });
    const { result, rerender } = renderHook(
      ({ identity }) => usePlanningWorkspace({ local: repository, client, useSession: () => signedAs(identity) }),
      { initialProps: { identity: "user-a" } },
    );
    await waitFor(() => expect(result.current.migration).toBe("available"));
    await act(() => result.current.importLocal());
    expect(result.current).toMatchObject({ migration: "failed", recovery: "conflict" });

    rerender({ identity: "user-b" });
    expect(result.current).toMatchObject({
      workspace: null,
      source: "restoring",
      migration: "none",
      recovery: "none",
    });
    await act(async () => { pendingB.resolve(workspaceResponse(null)); });
  });

  it("hides signed migration and recovery immediately while guest state restores", async () => {
    const { repository } = await importFixture();
    const guestLoad = deferred<null>();
    vi.spyOn(repository, "load").mockReturnValue(guestLoad.promise);
    const client = cloud({
      generate: vi.fn().mockRejectedValue(new ArcApiError(409, "CONFLICT", "Safe conflict", "request-conflict")),
    });
    const { result, rerender } = renderHook(
      ({ signedIn }) => usePlanningWorkspace({
        local: repository,
        client,
        useSession: () => signedIn ? signedAs("user-a") : anonymous(),
      }),
      { initialProps: { signedIn: true } },
    );
    await waitFor(() => expect(result.current.migration).toBe("available"));
    await act(() => result.current.importLocal());
    expect(result.current).toMatchObject({ migration: "failed", recovery: "conflict" });
    rerender({ signedIn: false });
    expect(result.current).toMatchObject({
      workspace: null,
      source: "restoring",
      migration: "none",
      recovery: "none",
    });
    await act(async () => { guestLoad.resolve(null); });
  });

  it("lets user B mutate while user A is stale and keeps B single-flight after A settles", async () => {
    const { generated } = await generatedFixture();
    const appendA = deferred<PlanningMutationResponse>();
    const appendB = deferred<PlanningMutationResponse>();
    const loadWorkspace = vi.fn().mockResolvedValue(workspaceResponse(generated.workspace));
    const appendEvent = vi.fn()
      .mockReturnValueOnce(appendA.promise)
      .mockReturnValueOnce(appendB.promise);
    const client = cloud({ loadWorkspace, appendEvent });
    const { result, rerender } = renderHook(
      ({ identity }) => usePlanningWorkspace({ local: local(), client, useSession: () => signedAs(identity) }),
      { initialProps: { identity: "user-a" } },
    );
    await waitFor(() => expect(result.current.source).toBe("cloud"));
    let operationA!: Promise<boolean>;
    act(() => { operationA = result.current.record({
      kind: "skipped", unitId: generated.workspace.dailyUnits[0]!.id, planningDate: "2026-08-17",
    }); });
    rerender({ identity: "user-b" });
    await waitFor(() => expect(result.current.source).toBe("cloud"));
    let operationB!: Promise<boolean>;
    act(() => { operationB = result.current.record({
      kind: "skipped", unitId: generated.workspace.dailyUnits[0]!.id, planningDate: "2026-08-17",
    }); });
    expect(appendEvent).toHaveBeenCalledTimes(2);
    await act(async () => {
      appendA.resolve(mutationResponse(generated));
      await operationA;
    });
    await expect(result.current.record({
      kind: "skipped", unitId: generated.workspace.dailyUnits[0]!.id, planningDate: "2026-08-17",
    })).resolves.toBe(false);
    expect(appendEvent).toHaveBeenCalledTimes(2);
    await act(async () => {
      appendB.resolve(mutationResponse(generated));
      await operationB;
    });
  });

  it("stops an unmounted import after deferred generation without progress or replay", async () => {
    const { generated, repository } = await importFixture();
    const remoteGeneration = deferred<PlanningMutationResponse>();
    const updateProgress = vi.spyOn(repository, "updateImportProgress");
    const client = cloud({ generate: vi.fn().mockReturnValue(remoteGeneration.promise) });
    const { result, unmount } = renderHook(() => usePlanningWorkspace({ local: repository, client, useSession: signed }));
    await waitFor(() => expect(result.current.migration).toBe("available"));
    let operation!: Promise<boolean>;
    act(() => { operation = result.current.importLocal(); });
    await waitFor(() => expect(client.generate).toHaveBeenCalledTimes(1));
    unmount();
    remoteGeneration.resolve(mutationResponse(generated));
    await expect(operation).resolves.toBe(false);
    expect(updateProgress).not.toHaveBeenCalled();
    expect(client.appendEvent).not.toHaveBeenCalled();
  });

  it("stops an unmounted import during replay before the next progress write", async () => {
    const { generated, proposed, repository } = await importFixture();
    const remoteEvent = deferred<PlanningMutationResponse>();
    const updateProgress = vi.spyOn(repository, "updateImportProgress");
    const client = cloud({
      generate: vi.fn().mockResolvedValue(mutationResponse(generated)),
      appendEvent: vi.fn().mockReturnValue(remoteEvent.promise),
    });
    const { result, unmount } = renderHook(() => usePlanningWorkspace({ local: repository, client, useSession: signed }));
    await waitFor(() => expect(result.current.migration).toBe("available"));
    let operation!: Promise<boolean>;
    act(() => { operation = result.current.importLocal(); });
    await waitFor(() => expect(client.appendEvent).toHaveBeenCalledTimes(1));
    expect(updateProgress).toHaveBeenCalledTimes(1);
    unmount();
    remoteEvent.resolve(mutationResponse(proposed));
    await expect(operation).resolves.toBe(false);
    expect(updateProgress).toHaveBeenCalledTimes(1);
    expect(client.acceptReplan).not.toHaveBeenCalled();
  });
});
