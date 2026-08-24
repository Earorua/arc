import { describe, expect, it } from "vitest";
import type { CreateProofRequest, ReviseProofRequest } from "../../../app/contracts/proof-ledger";
import {
  createLocalProofRepository,
  PROOF_LEDGER_QUARANTINE_KEY,
  PROOF_LEDGER_STORAGE_KEY,
} from "../../../app/lib/proof/local-repository";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  readonly setCalls: Array<{ key: string; value: string }> = [];
  readonly removeCalls: string[] = [];
  failSet = false;

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.removeCalls.push(key); this.values.delete(key); }
  setItem(key: string, value: string) {
    if (this.failSet) throw new Error("storage unavailable");
    this.setCalls.push({ key, value });
    this.values.set(key, value);
  }
}

describe("local proof repository", () => {
  it("loads an empty workspace without inventing state", async () => {
    const storage = new MemoryStorage();

    await expect(repository(storage).load()).resolves.toBeNull();
    expect(storage.setCalls).toEqual([]);
  });

  it("persists a draft atomically and reloads the strict workspace", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);

    const result = await repo.createProof(createRequest());

    expect(result).toMatchObject({
      outcome: "draft",
      workspace: {
        goalId: "guest-goal",
        revision: 1,
        versions: [{ proofId: "proof-1", versionNumber: 1 }],
        reviews: [{ kind: "drafted", stateAfter: "draft" }],
      },
    });
    expect(storage.setCalls).toHaveLength(1);
    await expect(repository(storage).load()).resolves.toEqual(result.workspace);
  });

  it("replays an identical mutation without writing twice", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    const request = createRequest();

    const first = await repo.createProof(request);
    const replay = await repo.createProof(request);

    expect(replay).toEqual(first);
    expect(storage.setCalls).toHaveLength(1);
  });

  it("rejects a stale base revision and leaves the previous bytes unchanged", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    await repo.createProof(createRequest());
    const previous = storage.getItem(PROOF_LEDGER_STORAGE_KEY);

    await expect(repo.createProof(createRequest({ mutationId: "mutation-stale" })))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(storage.getItem(PROOF_LEDGER_STORAGE_KEY)).toBe(previous);
    expect(storage.setCalls).toHaveLength(1);
  });

  it("preserves the previous valid workspace when persistence fails", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    const created = await repo.createProof(createRequest());
    const previous = storage.getItem(PROOF_LEDGER_STORAGE_KEY);
    storage.failSet = true;

    await expect(repo.setVisibility(created.workspace.versions[0]!.proofId, {
      mutationId: "mutation-visibility",
      baseRevision: created.workspace.revision,
      visibility: "public",
    })).rejects.toMatchObject({ code: "PROOF_UNAVAILABLE" });
    expect(storage.getItem(PROOF_LEDGER_STORAGE_KEY)).toBe(previous);
  });

  it("quarantines corrupt bytes without interpreting them as evidence", async () => {
    const storage = new MemoryStorage();
    storage.values.set(PROOF_LEDGER_STORAGE_KEY, "not-json");

    await expect(repository(storage).load()).resolves.toBeNull();
    expect(storage.getItem(PROOF_LEDGER_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(PROOF_LEDGER_QUARANTINE_KEY)).toBe("not-json");
  });

  it("submits structurally valid link evidence as demonstrated, never verified", async () => {
    const storage = new MemoryStorage();

    const result = await repository(storage).createProof(createRequest({
      intent: "submit",
      validatorKey: "proof.test-report.v1",
    }));

    expect(result.outcome).toBe("demonstrated");
    expect(result.workspace.reviews.map(({ kind }) => kind)).toEqual([
      "submitted",
      "structural_passed",
      "validator_unavailable",
    ]);
    expect(result.workspace.projections.find(({ skillId, audience }) =>
      skillId === "react" && audience === "internal")?.status).toBe("demonstrated");
    expect(result.workspace.projections.some(({ status }) => status === "verified")).toBe(false);
  });

  it("rejects an incomplete submission before writing", async () => {
    const storage = new MemoryStorage();

    await expect(repository(storage).createProof(createRequest({
      intent: "submit",
      artifactUrl: null,
    }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(storage.setCalls).toEqual([]);
  });

  it("creates an immutable submitted revision and supersedes the draft", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    const draft = await repo.createProof(createRequest());
    const proofId = draft.workspace.versions[0]!.proofId;

    const revised = await repo.reviseProof(proofId, reviseRequest({
      baseRevision: draft.workspace.revision,
    }));

    expect(revised).toMatchObject({
      outcome: "demonstrated",
      workspace: {
        revision: 2,
        versions: [
          { versionNumber: 1, title: "Accessible request trace" },
          { versionNumber: 2, title: "Revised accessible request trace" },
        ],
      },
    });
    expect(revised.workspace.reviews.map(({ kind }) => kind)).toEqual([
      "drafted",
      "superseded",
      "submitted",
      "structural_passed",
    ]);
    expect(revised.workspace.versions[1]?.supersedesVersionId)
      .toBe(revised.workspace.versions[0]?.id);
  });

  it("withdraws active evidence and deterministically downgrades its skill", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    const created = await repo.createProof(createRequest({ intent: "submit" }));
    const proofId = created.workspace.versions[0]!.proofId;

    const withdrawn = await repo.withdrawProof(proofId, {
      mutationId: "mutation-withdraw",
      baseRevision: created.workspace.revision,
    });

    expect(withdrawn.outcome).toBe("withdrawn");
    expect(withdrawn.workspace.reviews.at(-1)).toMatchObject({
      kind: "withdrawn",
      stateAfter: "withdrawn",
    });
    expect(withdrawn.workspace.projections.find(({ skillId, audience }) =>
      skillId === "react" && audience === "internal")?.status).toBe("exploring");
  });

  it("recomputes only the public projection when evidence becomes public", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    const created = await repo.createProof(createRequest({ intent: "submit" }));
    const proofId = created.workspace.versions[0]!.proofId;

    const published = await repo.setVisibility(proofId, {
      mutationId: "mutation-visibility",
      baseRevision: created.workspace.revision,
      visibility: "public",
    });

    expect(published.workspace.projections.find(({ skillId, audience }) =>
      skillId === "react" && audience === "internal")?.status).toBe("demonstrated");
    expect(published.workspace.projections.find(({ skillId, audience }) =>
      skillId === "react" && audience === "public")?.status).toBe("demonstrated");
  });
});

function repository(storage: Storage) {
  const ids = ["workspace-1", "proof-1", "version-1", "review-1"];
  let generated = 0;
  return createLocalProofRepository({
    storage,
    goalId: "guest-goal",
    createId: () => ids.shift() ?? `generated-${++generated}`,
    now: () => new Date("2026-08-25T00:00:00.000Z"),
  });
}

function reviseRequest(overrides: Partial<ReviseProofRequest> = {}): ReviseProofRequest {
  return {
    ...createRequest({
      mutationId: "mutation-revise",
      baseRevision: 1,
      intent: "submit",
      title: "Revised accessible request trace",
    }),
    ...overrides,
  };
}

function createRequest(overrides: Partial<CreateProofRequest> = {}): CreateProofRequest {
  return {
    mutationId: "mutation-create",
    baseRevision: 0,
    intent: "save_draft",
    validatorKey: null,
    dailyUnitId: "unit-1",
    title: "Accessible request trace",
    kind: "document",
    summary: "A request and event trace linked to the completion criteria.",
    artifactUrl: "https://github.com/arc/example",
    assetId: null,
    skillIds: ["react"],
    completionCriteria: ["The native event and response are shown in order."],
    visibility: "private",
    ...overrides,
  };
}
