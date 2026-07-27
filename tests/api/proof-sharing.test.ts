import { describe, expect, it, vi } from "vitest";
import { UnauthenticatedError } from "../../app/server/auth/session";
import {
  createProofSharingHandlers,
  type ProofSharingRouteDependencies,
} from "../../app/api/proofs/[id]/sharing/route";
import {
  createPublicProofHandler,
  type PublicProofRouteDependencies,
} from "../../app/api/public/proofs/[token]/route";
import { expectApiError, jsonRequest, requestId } from "./cloud-route-test-helpers";

const token = "A".repeat(43);
const owner = { id: "user-owner", name: "Arc Learner", email: "learner@example.com" };
const proof = {
  id: "proof-1",
  userId: owner.id,
  title: "Typed role research",
  kind: "project" as const,
  skillIds: ["research", "typescript"],
  verified: true,
  notes: "Private reflection",
};

function setup() {
  const requireUser = vi.fn().mockResolvedValue(owner);
  const reserve = vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  const repository = {
    getOwnedProof: vi.fn().mockResolvedValue(proof),
    createAssetMetadata: vi.fn(),
    getOwnedAsset: vi.fn(),
    upsertShare: vi.fn().mockResolvedValue(undefined),
    revokeShare: vi.fn().mockResolvedValue(true),
    getActiveShareByTokenHash: vi.fn().mockResolvedValue({
      tokenHash: "hash-fixed",
      publicView: {
        title: proof.title,
        verified: true,
        ownerId: owner.id,
        email: owner.email,
        notes: proof.notes,
        internalId: proof.id,
        attachmentUrl: "https://public.r2.dev/private",
      },
    }),
  };
  const sharing = {
    requireUser,
    rateLimiter: { reserve },
    repository,
    createRequestId: () => requestId,
    createId: () => "share-1",
    createToken: () => token,
    hashToken: vi.fn().mockResolvedValue("hash-fixed"),
    rateLimitPerMinute: 6,
  } as unknown as ProofSharingRouteDependencies;
  const publicRoute = {
    repository,
    createRequestId: () => requestId,
    hashToken: vi.fn().mockResolvedValue("hash-fixed"),
  } as unknown as PublicProofRouteDependencies;
  return { requireUser, reserve, repository, sharing, publicRoute };
}

describe("PUT/DELETE /api/proofs/[id]/sharing", () => {
  it("requires an Arc session", async () => {
    const harness = setup();
    harness.requireUser.mockRejectedValue(new UnauthenticatedError());
    const { PUT } = createProofSharingHandlers(harness.sharing);

    const response = await PUT(
      jsonRequest("https://arc.example/api/proofs/proof-1/sharing", "PUT", {
        fields: ["title"],
      }),
      { params: Promise.resolve({ id: proof.id }) },
    );

    await expectApiError(response, 401, "UNAUTHENTICATED");
    expect(harness.reserve).not.toHaveBeenCalled();
  });

  it("reserves its mutation scope before reading the request body", async () => {
    const harness = setup();
    harness.reserve.mockResolvedValue({ allowed: false, retryAfterSeconds: 19 });
    const { PUT } = createProofSharingHandlers(harness.sharing);

    const response = await PUT(
      new Request("https://arc.example/api/proofs/proof-1/sharing", {
        method: "PUT",
        headers: { "content-type": "not/json" },
        body: "not JSON",
      }),
      { params: Promise.resolve({ id: proof.id }) },
    );

    await expectApiError(response, 429, "RATE_LIMITED");
    expect(harness.repository.getOwnedProof).not.toHaveBeenCalled();
  });

  it("stores only a hash and the explicitly selected public view", async () => {
    const harness = setup();
    const { PUT } = createProofSharingHandlers(harness.sharing);

    const response = await PUT(
      jsonRequest("https://arc.example/api/proofs/proof-1/sharing", "PUT", {
        fields: ["title", "verified"],
      }),
      { params: Promise.resolve({ id: proof.id }) },
    );
    const body = await response.json() as { share: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(body.share.token).toBe(token);
    expect(harness.repository.getOwnedProof).toHaveBeenCalledWith(owner.id, proof.id);
    expect(harness.repository.upsertShare).toHaveBeenCalledWith({
      id: "share-1",
      userId: owner.id,
      proofId: proof.id,
      tokenHash: "hash-fixed",
      publishedFields: ["title", "verified"],
      publicView: { title: proof.title, verified: true },
    });
    const stored = JSON.stringify(harness.repository.upsertShare.mock.calls[0][0]);
    expect(stored).not.toContain(token);
    expect(stored).not.toContain(owner.email);
    expect(stored).not.toContain(proof.notes);
  });

  it.each([
    [],
    ["title", "title"],
    ["title", "notes"],
  ] as string[][])("rejects empty, duplicate, or non-allowlisted fields: %j", async (fields) => {
    const harness = setup();
    const { PUT } = createProofSharingHandlers(harness.sharing);

    const response = await PUT(
      jsonRequest("https://arc.example/api/proofs/proof-1/sharing", "PUT", { fields }),
      { params: Promise.resolve({ id: proof.id }) },
    );

    await expectApiError(response, 400, "INVALID_INPUT");
    expect(harness.repository.upsertShare).not.toHaveBeenCalled();
  });

  it("uses owner and proof ID for both create and revoke authorization", async () => {
    const harness = setup();
    harness.repository.getOwnedProof.mockResolvedValue(null);
    harness.repository.revokeShare.mockResolvedValue(false);
    const { PUT, DELETE } = createProofSharingHandlers(harness.sharing);

    const createResponse = await PUT(
      jsonRequest("https://arc.example/api/proofs/proof-1/sharing", "PUT", {
        fields: ["title"],
      }),
      { params: Promise.resolve({ id: proof.id }) },
    );
    const revokeResponse = await DELETE(
      new Request("https://arc.example/api/proofs/proof-1/sharing", { method: "DELETE" }),
      { params: Promise.resolve({ id: proof.id }) },
    );

    await expectApiError(createResponse, 404, "NOT_FOUND");
    await expectApiError(revokeResponse, 404, "NOT_FOUND");
    expect(harness.repository.revokeShare).toHaveBeenCalledWith(owner.id, proof.id);
  });
});

describe("GET /api/public/proofs/[token]", () => {
  it("returns only allowlisted stored fields and never private identity or asset data", async () => {
    const harness = setup();
    const GET = createPublicProofHandler(harness.publicRoute);

    const response = await GET(
      new Request(`https://arc.example/api/public/proofs/${token}`),
      { params: Promise.resolve({ token }) },
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body).toEqual({ proof: { title: proof.title, verified: true } });
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expect(serialized).not.toContain(owner.id);
    expect(serialized).not.toContain(owner.email);
    expect(serialized).not.toContain(proof.notes);
    expect(serialized).not.toContain("r2.dev");
  });

  it("uses the same 404 shape for invalid, unknown, and revoked tokens", async () => {
    const invalidHarness = setup();
    const invalid = await createPublicProofHandler(invalidHarness.publicRoute)(
      new Request("https://arc.example/api/public/proofs/not-valid!"),
      { params: Promise.resolve({ token: "not-valid!" }) },
    );
    const invalidCopy = invalid.clone();

    const missingHarness = setup();
    missingHarness.repository.getActiveShareByTokenHash.mockResolvedValue(null);
    const missing = await createPublicProofHandler(missingHarness.publicRoute)(
      new Request(`https://arc.example/api/public/proofs/${token}`),
      { params: Promise.resolve({ token }) },
    );
    const missingCopy = missing.clone();

    await expectApiError(invalid, 404, "NOT_FOUND");
    await expectApiError(missing, 404, "NOT_FOUND");
    expect(await invalidCopy.text()).toBe(await missingCopy.text());
  });
});
