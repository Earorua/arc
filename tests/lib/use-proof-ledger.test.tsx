import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlanningWorkspace } from "../../app/contracts/planning";
import type { ProofItem } from "../../app/domain/learning";
import { ArcApiError } from "../../app/lib/cloud-client";
import type { ProofClient } from "../../app/lib/proof-client";
import type { LocalProofRepository } from "../../app/lib/proof/local-repository";
import { useProofLedger } from "../../app/lib/use-proof-ledger";
import { proofResultFixture } from "../fixtures/proof-ledger";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function session(id: string | null) {
  return () => ({
    data: id ? { user: { id, name: "Learner", email: "private@example.com" } } : null,
    isPending: false,
  });
}

function client(overrides: Partial<ProofClient> = {}): ProofClient {
  const result = proofResultFixture();
  return {
    loadWorkspace: vi.fn().mockResolvedValue(result.workspace),
    createProof: vi.fn().mockResolvedValue(result),
    reviseProof: vi.fn().mockResolvedValue(result),
    withdrawProof: vi.fn().mockResolvedValue({ ...result, outcome: "withdrawn" }),
    setVisibility: vi.fn().mockResolvedValue({ ...result, outcome: "updated" }),
    ...overrides,
  };
}

function local(overrides: Partial<LocalProofRepository> = {}): LocalProofRepository {
  const result = proofResultFixture();
  return {
    load: vi.fn().mockResolvedValue(null),
    createProof: vi.fn().mockResolvedValue(result),
    reviseProof: vi.fn().mockResolvedValue(result),
    withdrawProof: vi.fn().mockResolvedValue({ ...result, outcome: "withdrawn" }),
    setVisibility: vi.fn().mockResolvedValue({ ...result, outcome: "updated" }),
    ...overrides,
  };
}

const input = {
  intent: "submit" as const, validatorKey: null, dailyUnitId: null,
  title: "Architecture map", kind: "document" as const, summary: "Trace the boundary.",
  artifactUrl: "https://example.com/proof", assetId: null, skillIds: ["testing"],
  completionCriteria: ["Trace is complete"], visibility: "private" as const,
};

describe("useProofLedger", () => {
  it("loads guest local state and derives practicing from planning and legacy evidence", async () => {
    const legacy: ProofItem[] = [{
      id: "legacy-1", title: "Legacy", kind: "completion", skillIds: ["react"], verified: true,
    }];
    const planning = {
      dailyUnits: [{ id: "daily-1", planVersionId: "plan-1", skillId: "testing" }],
      events: [{ kind: "completed", unitId: "daily-1", targetPlanVersionId: "plan-1",
        occurredAt: "2026-08-17T00:00:00.000Z" }],
    } as unknown as PlanningWorkspace;
    const repository = local();
    const { result } = renderHook(() => useProofLedger({
      planningWorkspace: planning, legacyProofs: legacy, local: repository, useSession: session(null),
    }));
    await waitFor(() => expect(result.current.source).toBe("local"));
    expect(result.current.projections.find(({ skillId, audience }) =>
      skillId === "testing" && audience === "internal")?.status).toBe("practicing");
    expect(result.current.projections.find(({ skillId, audience }) =>
      skillId === "react" && audience === "internal")?.status).toBe("practicing");
    expect(result.current.workspace).toBeNull();
  });

  it("loads authenticated cloud state", async () => {
    const cloud = client();
    const { result } = renderHook(() => useProofLedger({
      planningWorkspace: null, legacyProofs: [], client: cloud, local: local(), useSession: session("user-1"),
    }));
    await waitFor(() => expect(result.current.source).toBe("cloud"));
    expect(result.current.workspace).toEqual(proofResultFixture().workspace);
    expect(cloud.loadWorkspace).toHaveBeenCalledOnce();
  });

  it("hides prior identity immediately and suppresses stale responses", async () => {
    const pendingA = deferred<ReturnType<typeof proofResultFixture>["workspace"]>();
    const pendingB = deferred<ReturnType<typeof proofResultFixture>["workspace"]>();
    const loadWorkspace = vi.fn()
      .mockReturnValueOnce(pendingA.promise).mockReturnValueOnce(pendingB.promise);
    const cloud = client({ loadWorkspace });
    const { result, rerender } = renderHook(({ id }) => useProofLedger({
      planningWorkspace: null, legacyProofs: [], client: cloud, local: local(), useSession: session(id),
    }), { initialProps: { id: "user-a" } });
    await waitFor(() => expect(loadWorkspace).toHaveBeenCalledTimes(1));
    rerender({ id: "user-b" });
    expect(result.current).toMatchObject({ workspace: null, source: "restoring" });
    await waitFor(() => expect(loadWorkspace).toHaveBeenCalledTimes(2));
    const workspaceB = structuredClone(proofResultFixture().workspace);
    workspaceB.id = "workspace-b";
    await act(async () => { pendingB.resolve(workspaceB); });
    await waitFor(() => expect(result.current.workspace?.id).toBe("workspace-b"));
    await act(async () => { pendingA.resolve(proofResultFixture().workspace); });
    expect(result.current.workspace?.id).toBe("workspace-b");
  });

  it("allows only one in-flight mutation", async () => {
    const pending = deferred<ReturnType<typeof proofResultFixture>>();
    const createProof = vi.fn().mockReturnValue(pending.promise);
    const cloud = client({ createProof });
    const { result } = renderHook(() => useProofLedger({
      planningWorkspace: null, legacyProofs: [], client: cloud, local: local(), useSession: session("user-1"),
      createMutationId: () => "mutation-one",
    }));
    await waitFor(() => expect(result.current.source).toBe("cloud"));
    let first!: Promise<boolean>;
    act(() => { first = result.current.createProof(input); });
    await expect(result.current.createProof(input)).resolves.toBe(false);
    expect(createProof).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve(proofResultFixture()); await first; });
  });

  it("keeps the last cloud snapshot as offline-cloud read-only and recovers on retry", async () => {
    const loadWorkspace = vi.fn()
      .mockResolvedValueOnce(proofResultFixture().workspace)
      .mockRejectedValueOnce(new ArcApiError(503, "UNAVAILABLE", "Safe", "request-1", "retry"))
      .mockResolvedValueOnce(proofResultFixture().workspace);
    const cloud = client({ loadWorkspace });
    const { result } = renderHook(() => useProofLedger({
      planningWorkspace: null, legacyProofs: [], client: cloud, local: local(), useSession: session("user-1"),
    }));
    await waitFor(() => expect(result.current.source).toBe("cloud"));
    await act(() => result.current.retry());
    expect(result.current).toMatchObject({ source: "offline-cloud", recovery: "unavailable" });
    await expect(result.current.createProof(input)).resolves.toBe(false);
    await act(() => result.current.retry());
    expect(result.current).toMatchObject({ source: "cloud", recovery: "none" });
  });

  it("publishes idempotent replay results and maps conflicts", async () => {
    const replay = proofResultFixture();
    const createProof = vi.fn().mockResolvedValueOnce(replay).mockResolvedValueOnce(replay)
      .mockRejectedValueOnce(new ArcApiError(409, "CONFLICT", "Safe", "request-2", "refresh"));
    const cloud = client({ createProof });
    const { result } = renderHook(() => useProofLedger({
      planningWorkspace: null, legacyProofs: [], client: cloud, local: local(), useSession: session("user-1"),
      createMutationId: () => "mutation-replay",
    }));
    await waitFor(() => expect(result.current.source).toBe("cloud"));
    await expect(act(() => result.current.createProof(input))).resolves.toBe(true);
    await expect(act(() => result.current.createProof(input))).resolves.toBe(true);
    expect(result.current.workspace).toEqual(replay.workspace);
    await expect(act(() => result.current.createProof(input))).resolves.toBe(false);
    expect(result.current.recovery).toBe("conflict");
  });

  it.each([
    [new ArcApiError(401, "UNAUTHENTICATED", "Safe", "request-3", "sign-in"), "session-expired"],
    [new ArcApiError(503, "VERSION_UNAVAILABLE", "Safe", "request-4", "rebuild"), "version-unavailable"],
  ] as const)("maps cloud recovery without exposing server details", async (error, expected) => {
    const cloud = client({ loadWorkspace: vi.fn().mockRejectedValue(error) });
    const { result } = renderHook(() => useProofLedger({
      planningWorkspace: null, legacyProofs: [], client: cloud, local: local(), useSession: session("user-1"),
    }));
    await waitFor(() => expect(result.current.recovery).toBe(expected));
    expect(result.current.source).toBe("offline-cloud");
  });
});
