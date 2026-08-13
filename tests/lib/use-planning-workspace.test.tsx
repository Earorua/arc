import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeneratePlanningRequest } from "../../app/contracts/planning-api";
import { PLANNING_SCHEMA_VERSION, type PlanningMutationResult } from "../../app/contracts/planning";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import type { PlanningClient } from "../../app/lib/planning-client";
import {
  createLocalPlanningRepository,
  type LocalPlanningRepository,
} from "../../app/lib/planning/local-repository";
import { ArcApiError } from "../../app/lib/cloud-client";
import { usePlanningWorkspace } from "../../app/lib/use-planning-workspace";

const anonymous = () => ({ data: null, isPending: false });
const signed = () => ({ data: { user: { id: "user-1", name: "Learner", email: "learner@example.com" } }, isPending: false });

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

function cloud(overrides: Partial<PlanningClient> = {}) {
  return {
    loadWorkspace: vi.fn().mockResolvedValue(null), generate: vi.fn(), appendEvent: vi.fn(),
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
    const client = cloud({ loadWorkspace: vi.fn().mockResolvedValue(generated.workspace) });
    const { result } = renderHook(() => usePlanningWorkspace({ local: repository, client, useSession: signed }));
    await waitFor(() => expect(result.current.source).toBe("cloud"));
    expect(client.loadWorkspace).toHaveBeenCalledTimes(1);
    expect(repository.load).not.toHaveBeenCalled();
    expect(repository.readImportSource).not.toHaveBeenCalled();
  });

  it("never imports automatically and rejects a second in-flight cloud write", async () => {
    const { generated } = await generatedFixture();
    let resolveWrite!: (value: PlanningMutationResult) => void;
    const appendEvent = vi.fn(() => new Promise<PlanningMutationResult>((resolve) => { resolveWrite = resolve; }));
    const client = cloud({ appendEvent, loadWorkspace: vi.fn().mockResolvedValue(generated.workspace) });
    const { result } = renderHook(() => usePlanningWorkspace({ local: local(), client, useSession: signed }));
    await waitFor(() => expect(result.current.source).toBe("cloud"));
    expect(client.generate).not.toHaveBeenCalled();
    expect(client.appendEvent).not.toHaveBeenCalled();
    let first!: Promise<boolean>;
    act(() => { first = result.current.record({ kind: "skipped", unitId: "unit-1", planningDate: "2026-08-17" }); });
    await expect(result.current.record({ kind: "skipped", unitId: "unit-1", planningDate: "2026-08-17" })).resolves.toBe(false);
    await act(async () => {
      resolveWrite(generated);
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
      .mockResolvedValueOnce(generated.workspace)
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
      loadWorkspace: vi.fn().mockResolvedValue(generated.workspace),
      appendEvent: vi.fn().mockRejectedValue(new ArcApiError(401, "UNAUTHORIZED", "Sign in", "request-1", "sign-in")),
    });
    const { result } = renderHook(() => usePlanningWorkspace({ local: local(), client, useSession: signed }));
    await waitFor(() => expect(result.current.source).toBe("cloud"));
    const unitId = generated.workspace.dailyUnits[0]!.id;
    await act(() => result.current.record({ kind: "skipped", unitId, planningDate: "2026-08-17" }));
    expect(result.current.recovery).toBe("session-expired");
    expect(result.current.workspace).toEqual(generated.workspace);
  });

  it("explicitly imports initial state then replays learning and decision events in sequence", async () => {
    const { generated, proposed, accepted, repository, source } = await importFixture();
    const loadWorkspace = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(accepted.workspace);
    const client = cloud({
      loadWorkspace,
      generate: vi.fn().mockResolvedValue(generated),
      appendEvent: vi.fn().mockResolvedValue(proposed),
      acceptReplan: vi.fn().mockResolvedValue(accepted),
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
      .mockResolvedValueOnce(accepted);
    const client = cloud({
      loadWorkspace: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(proposed.workspace)
        .mockResolvedValueOnce(accepted.workspace),
      generate: vi.fn().mockResolvedValue(generated),
      appendEvent: vi.fn().mockResolvedValue(proposed),
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
      loadWorkspace: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(mismatched),
      generate: vi.fn().mockResolvedValue(generated),
      appendEvent: vi.fn().mockResolvedValue(proposed),
      acceptReplan: vi.fn().mockResolvedValue(accepted),
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
});
