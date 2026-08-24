import { describe, expect, it, vi } from "vitest";
import { UnauthenticatedError } from "../../app/server/auth/session";
import { createProofSharingHandlers, type ProofSharingRouteDependencies } from "../../app/api/proofs/[id]/sharing/route";
import { createPublicProofHandler, type PublicProofRouteDependencies } from "../../app/api/public/proofs/[token]/route";
import { PROOF_LEDGER_SCHEMA_VERSION, type ProofLedgerWorkspace } from "../../app/contracts/proof-ledger";
import { PUBLIC_PROOF_SCHEMA_VERSION } from "../../app/server/proof/public-view";
import { expectApiError, jsonRequest, requestId } from "./cloud-route-test-helpers";

const token = "A".repeat(43);
const owner = { id: "user-owner", name: "Arc Learner", email: "learner@example.com" };

function ledger(visibility: "private" | "public" = "public", state: "demonstrated" | "verified" | "withdrawn" = "verified"): ProofLedgerWorkspace {
  return {
    id: "workspace-1", goalId: "goal-1", schemaVersion: PROOF_LEDGER_SCHEMA_VERSION, revision: 1,
    versions: [{
      id: "version-1", proofId: "proof-1", versionNumber: 1, schemaVersion: PROOF_LEDGER_SCHEMA_VERSION,
      dailyUnitId: null, title: "Typed role research", kind: "document", summary: "An inspectable architecture note.",
      artifactUrl: "https://example.com/proof", assetId: null, skillIds: ["typescript"],
      completionCriteria: ["The contract is explicit."], visibility: "public",
      createdAt: "2026-08-24T10:00:00.000Z", supersedesVersionId: null,
    }],
    reviews: [{
      id: "review-1", proofId: "proof-1", versionId: "version-1", sequence: 1,
      mutationId: "mutation-1", kind: state === "withdrawn" ? "withdrawn" : state === "verified" ? "validator_passed" : "structural_passed",
      stateAfter: state, visibilityAfter: visibility, validatorKey: state === "verified" ? "proof.test-report.v1" : null,
      outcome: state === "verified" || state === "demonstrated" ? "passed" : null,
      reasonCodes: [], occurredAt: "2026-08-24T10:00:00.000Z",
    }],
    projections: [],
  };
}

const storedView = {
  schemaVersion: PUBLIC_PROOF_SCHEMA_VERSION,
  title: "Typed role research",
  kind: "document" as const,
  skillNames: ["TypeScript"],
  status: "verified" as const,
  summary: "An inspectable architecture note.",
  submittedAt: "2026-08-24T10:00:00.000Z",
  versionNumber: 1,
};

function setup() {
  const requireUser = vi.fn().mockResolvedValue(owner);
  const reserve = vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  const repository = {
    findActiveGoal: vi.fn().mockResolvedValue({ ownerId: owner.id, goalId: "goal-1" }),
    load: vi.fn().mockResolvedValue(ledger()),
    getOwnedProofSnapshot: vi.fn().mockResolvedValue(null),
    upsertShare: vi.fn().mockResolvedValue(undefined),
    revokeShare: vi.fn().mockResolvedValue(true),
    getActiveShareByTokenHash: vi.fn().mockResolvedValue({ tokenHash: "hash-fixed", publicView: storedView }),
  };
  const sharing = {
    requireUser, rateLimiter: { reserve }, repository, createRequestId: () => requestId,
    createId: () => "share-1", createToken: () => token,
    hashToken: vi.fn().mockResolvedValue("hash-fixed"), rateLimitPerMinute: 6,
  } as unknown as ProofSharingRouteDependencies;
  const publicRoute = {
    repository, createRequestId: () => requestId, hashToken: vi.fn().mockResolvedValue("hash-fixed"),
  } as unknown as PublicProofRouteDependencies;
  return { requireUser, reserve, repository, sharing, publicRoute };
}

describe("PUT/DELETE /api/proofs/[id]/sharing", () => {
  it("requires an Arc session", async () => {
    const harness = setup();
    harness.requireUser.mockRejectedValue(new UnauthenticatedError());
    const response = await createProofSharingHandlers(harness.sharing).PUT(
      jsonRequest("https://arc.example/api/proofs/proof-1/sharing", "PUT", { fields: ["title"] }),
      { params: Promise.resolve({ id: "proof-1" }) },
    );
    await expectApiError(response, 401, "UNAUTHENTICATED");
    expect(harness.reserve).not.toHaveBeenCalled();
  });

  it("reserves its mutation scope before reading the request body", async () => {
    const harness = setup();
    harness.reserve.mockResolvedValue({ allowed: false, retryAfterSeconds: 19 });
    const response = await createProofSharingHandlers(harness.sharing).PUT(
      new Request("https://arc.example/api/proofs/proof-1/sharing", { method: "PUT", headers: { "content-type": "not/json" }, body: "not JSON" }),
      { params: Promise.resolve({ id: "proof-1" }) },
    );
    await expectApiError(response, 429, "RATE_LIMITED");
    expect(harness.repository.load).not.toHaveBeenCalled();
  });

  it("stores an immutable, versioned allowlist snapshot with skill names", async () => {
    const harness = setup();
    const fields = ["title", "kind", "skillNames", "status", "summary", "submittedAt", "versionNumber"];
    const response = await createProofSharingHandlers(harness.sharing).PUT(
      jsonRequest("https://arc.example/api/proofs/proof-1/sharing", "PUT", { fields }),
      { params: Promise.resolve({ id: "proof-1" }) },
    );
    const body = await response.json() as { share: Record<string, unknown> };
    expect(response.status).toBe(200);
    expect(body.share.token).toBe(token);
    expect(harness.repository.upsertShare).toHaveBeenCalledWith({
      id: "share-1", userId: owner.id, proofId: "proof-1", tokenHash: "hash-fixed",
      publishedFields: fields, publicView: storedView,
    });
    const serialized = JSON.stringify(harness.repository.upsertShare.mock.calls[0][0].publicView);
    for (const secret of [owner.email, owner.id, "proof-1", "version-1", "asset", "objectKey", "completionCriteria", "prompt", "modelInput", "aiFeedback"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("re-shares a legacy owned proof only through safe fields without promoting verified", async () => {
    const harness = setup();
    harness.repository.load.mockResolvedValue(null);
    harness.repository.getOwnedProofSnapshot.mockResolvedValue({
      source: "legacy",
      proof: {
        id: "proof-1", userId: owner.id, title: "Legacy TypeScript project",
        kind: "project", skillIds: ["typescript"], verified: true,
      },
    });

    const response = await createProofSharingHandlers(harness.sharing).PUT(
      jsonRequest("https://arc.example/api/proofs/proof-1/sharing", "PUT", { fields: ["title", "skillNames"] }),
      { params: Promise.resolve({ id: "proof-1" }) },
    );

    expect(response.status).toBe(200);
    expect(harness.repository.upsertShare).toHaveBeenCalledWith(expect.objectContaining({
      proofId: "proof-1",
      publishedFields: ["title", "skillNames"],
      publicView: {
        schemaVersion: PUBLIC_PROOF_SCHEMA_VERSION,
        title: "Legacy TypeScript project",
        skillNames: ["TypeScript"],
      },
    }));
    expect(JSON.stringify(harness.repository.upsertShare.mock.calls[0][0].publicView))
      .not.toContain("verified");
  });

  it("re-shares a legacy title without requiring obsolete skill metadata", async () => {
    const harness = setup();
    harness.repository.load.mockResolvedValue(null);
    harness.repository.getOwnedProofSnapshot.mockResolvedValue({
      source: "legacy",
      proof: {
        id: "proof-1", userId: owner.id, title: "Legacy custom-role project",
        kind: "project", skillIds: ["retired-custom-skill"], verified: false,
      },
    });

    const response = await createProofSharingHandlers(harness.sharing).PUT(
      jsonRequest("https://arc.example/api/proofs/proof-1/sharing", "PUT", { fields: ["title"] }),
      { params: Promise.resolve({ id: "proof-1" }) },
    );

    expect(response.status).toBe(200);
    expect(harness.repository.upsertShare).toHaveBeenCalledWith(expect.objectContaining({
      publicView: {
        schemaVersion: PUBLIC_PROOF_SCHEMA_VERSION,
        title: "Legacy custom-role project",
      },
    }));
  });

  it.each([[], ["title", "title"], ["title", "skillIds"], ["verified"]] as string[][])(
    "rejects empty, duplicate, or legacy fields: %j", async (fields) => {
      const harness = setup();
      const response = await createProofSharingHandlers(harness.sharing).PUT(
        jsonRequest("https://arc.example/api/proofs/proof-1/sharing", "PUT", { fields }),
        { params: Promise.resolve({ id: "proof-1" }) },
      );
      await expectApiError(response, 400, "INVALID_INPUT");
      expect(harness.repository.upsertShare).not.toHaveBeenCalled();
    },
  );

  it.each([["private", "verified"], ["public", "withdrawn"]] as const)(
    "does not share privacy-ineligible evidence (%s, %s)", async (visibility, state) => {
      const harness = setup();
      harness.repository.load.mockResolvedValue(ledger(visibility, state));
      const response = await createProofSharingHandlers(harness.sharing).PUT(
        jsonRequest("https://arc.example/api/proofs/proof-1/sharing", "PUT", { fields: ["title"] }),
        { params: Promise.resolve({ id: "proof-1" }) },
      );
      await expectApiError(response, 404, "NOT_FOUND");
      expect(harness.repository.upsertShare).not.toHaveBeenCalled();
    },
  );

  it("revokes by owner and proof ID", async () => {
    const harness = setup();
    harness.repository.revokeShare.mockResolvedValue(false);
    const response = await createProofSharingHandlers(harness.sharing).DELETE(
      new Request("https://arc.example/api/proofs/proof-1/sharing", { method: "DELETE" }),
      { params: Promise.resolve({ id: "proof-1" }) },
    );
    await expectApiError(response, 404, "NOT_FOUND");
    expect(harness.repository.revokeShare).toHaveBeenCalledWith(owner.id, "proof-1");
  });
});

describe("GET /api/public/proofs/[token]", () => {
  it("returns only the strict stored snapshot", async () => {
    const harness = setup();
    const response = await createPublicProofHandler(harness.publicRoute)(
      new Request(`https://arc.example/api/public/proofs/${token}`), { params: Promise.resolve({ token }) },
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ proof: storedView });
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("keeps two token snapshots isolated", async () => {
    const tokenB = "B".repeat(43);
    const repository = {
      getActiveShareByTokenHash: vi.fn(async (hash: string) => hash === "hash-A"
        ? { tokenHash: hash, publicView: { schemaVersion: PUBLIC_PROOF_SCHEMA_VERSION, title: "Snapshot A" } }
        : hash === "hash-B" ? { tokenHash: hash, publicView: { schemaVersion: PUBLIC_PROOF_SCHEMA_VERSION, title: "Snapshot B" } } : null),
    };
    const GET = createPublicProofHandler({
      repository, createRequestId: () => requestId, hashToken: async (value) => `hash-${value[0]}`,
    });
    const responseA = await GET(new Request("https://arc.example/a"), { params: Promise.resolve({ token }) });
    const responseB = await GET(new Request("https://arc.example/b"), { params: Promise.resolve({ token: tokenB }) });
    expect(await responseA.json()).toEqual({ proof: { schemaVersion: PUBLIC_PROOF_SCHEMA_VERSION, title: "Snapshot A" } });
    expect(await responseB.json()).toEqual({ proof: { schemaVersion: PUBLIC_PROOF_SCHEMA_VERSION, title: "Snapshot B" } });
  });

  it("does not rewrite an existing snapshot when the live proof changes", async () => {
    const harness = setup();
    const GET = createPublicProofHandler(harness.publicRoute);
    harness.repository.load.mockResolvedValue({
      ...ledger("private", "withdrawn"),
      versions: [{ ...ledger().versions[0], title: "Later private revision", versionNumber: 2 }],
    });
    const response = await GET(new Request("https://arc.example/public"), { params: Promise.resolve({ token }) });
    expect(await response.json()).toEqual({ proof: storedView });
    expect(harness.repository.load).not.toHaveBeenCalled();
  });

  it("uses one 404 shape for malformed, missing, revoked, and unsafe stored snapshots", async () => {
    const invalidHarness = setup();
    const invalid = await createPublicProofHandler(invalidHarness.publicRoute)(new Request("https://arc.example/x"), { params: Promise.resolve({ token: "not-valid!" }) });
    const invalidText = await invalid.clone().text();
    const variants = [null, { tokenHash: "hash-fixed", publicView: { ...storedView, ownerId: owner.id } }];
    for (const value of variants) {
      const harness = setup();
      harness.repository.getActiveShareByTokenHash.mockResolvedValue(value);
      const response = await createPublicProofHandler(harness.publicRoute)(new Request("https://arc.example/x"), { params: Promise.resolve({ token }) });
      await expectApiError(response.clone(), 404, "NOT_FOUND");
      expect(await response.text()).toBe(invalidText);
    }
  });
});
