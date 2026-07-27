import { describe, expect, it, vi } from "vitest";
import { UnauthenticatedError } from "../../app/server/auth/session";
import { MAX_PROOF_BYTES } from "../../app/server/proof/storage";
import {
  createProofAssetHandler,
  type ProofAssetRouteDependencies,
} from "../../app/api/proofs/[id]/asset/route";
import {
  createProofUploadHandler,
  type ProofUploadRouteDependencies,
} from "../../app/api/proofs/upload/route";
import { expectApiError, requestId } from "./cloud-route-test-helpers";

const owner = { id: "user-owner", name: "Arc Learner", email: "learner@example.com" };
const proof = {
  id: "proof-1",
  userId: owner.id,
  title: "Architecture map",
  kind: "project" as const,
  skillIds: ["systems"],
  verified: false,
};

function uploadRequest() {
  return new Request("https://arc.example/api/proofs/upload", { method: "POST" });
}

function parsedUpload(
  file: File,
  files: File[] = [file],
): Pick<FormData, "get" | "getAll"> {
  return {
    get: (key) => {
      if (key === "proofId") return proof.id;
      if (key === "file") return file;
      return null;
    },
    getAll: (key) => {
      if (key === "proofId") return [proof.id];
      if (key === "file") return files;
      return [];
    },
  };
}

function setup() {
  const requireUser = vi.fn().mockResolvedValue(owner);
  const reserve = vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  const repository = {
    getOwnedProof: vi.fn().mockResolvedValue(proof),
    createAssetMetadata: vi.fn().mockResolvedValue(undefined),
    getOwnedAsset: vi.fn().mockResolvedValue({
      id: "asset-1",
      userId: owner.id,
      proofId: proof.id,
      objectKey: "user-owner/proof-1/asset-1",
      filename: "evidence.txt",
      contentType: "text/plain",
      sizeBytes: 10,
    }),
  };
  const storage = {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ body: new TextEncoder().encode("proof body") }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const readFormData = vi.fn().mockResolvedValue(parsedUpload(
    new File(["proof body"], "evidence.txt", { type: "text/plain" }),
  ));
  const shared = {
    requireUser,
    rateLimiter: { reserve },
    repository,
    storage,
    createRequestId: () => requestId,
    createId: () => "asset-1",
    rateLimitPerMinute: 4,
    readFormData,
  };
  return {
    requireUser,
    reserve,
    repository,
    storage,
    readFormData,
    upload: shared as unknown as ProofUploadRouteDependencies,
    asset: shared as unknown as ProofAssetRouteDependencies,
  };
}

describe("POST /api/proofs/upload", () => {
  it("requires an Arc session before reserving or reading upload state", async () => {
    const harness = setup();
    harness.requireUser.mockRejectedValue(new UnauthenticatedError());
    const POST = createProofUploadHandler(harness.upload);

    const response = await POST(uploadRequest());

    await expectApiError(response, 401, "UNAUTHENTICATED");
    expect(harness.reserve).not.toHaveBeenCalled();
    expect(harness.storage.put).not.toHaveBeenCalled();
  });

  it("reserves its mutation scope before parsing or writing", async () => {
    const harness = setup();
    harness.reserve.mockResolvedValue({ allowed: false, retryAfterSeconds: 11 });
    const POST = createProofUploadHandler(harness.upload);

    const response = await POST(new Request("https://arc.example/api/proofs/upload", {
      method: "POST",
      headers: { "content-type": "not/multipart" },
      body: "not a multipart body",
    }));

    await expectApiError(response, 429, "RATE_LIMITED");
    expect(response.headers.get("retry-after")).toBe("11");
    expect(harness.readFormData).not.toHaveBeenCalled();
    expect(harness.repository.getOwnedProof).not.toHaveBeenCalled();
  });

  it("stores an owner-keyed private object and searchable metadata", async () => {
    const harness = setup();
    const POST = createProofUploadHandler(harness.upload);

    const response = await POST(uploadRequest());
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(201);
    expect(harness.repository.getOwnedProof).toHaveBeenCalledWith(owner.id, proof.id);
    expect(harness.storage.put).toHaveBeenCalledWith(
      "user-owner/proof-1/asset-1",
      expect.objectContaining({ contentType: "text/plain", sizeBytes: 10 }),
    );
    expect(harness.repository.createAssetMetadata).toHaveBeenCalledWith(expect.objectContaining({
      id: "asset-1",
      userId: owner.id,
      proofId: proof.id,
      objectKey: "user-owner/proof-1/asset-1",
    }));
    expect(JSON.stringify(body)).not.toContain("objectKey");
    expect(JSON.stringify(body)).not.toContain("r2.dev");
  });

  it("denies missing or cross-user proofs without creating an object", async () => {
    const harness = setup();
    harness.repository.getOwnedProof.mockResolvedValue(null);
    const POST = createProofUploadHandler(harness.upload);

    const response = await POST(uploadRequest());

    await expectApiError(response, 404, "NOT_FOUND");
    expect(harness.repository.getOwnedProof).toHaveBeenCalledWith(owner.id, proof.id);
    expect(harness.storage.put).not.toHaveBeenCalled();
  });

  it("rejects files over five MiB", async () => {
    const harness = setup();
    const POST = createProofUploadHandler(harness.upload);
    harness.readFormData.mockResolvedValue(parsedUpload(new File(
      [new Uint8Array(MAX_PROOF_BYTES + 1)],
      "large.png",
      { type: "image/png" },
    )));
    const response = await POST(uploadRequest());

    await expectApiError(response, 400, "INVALID_INPUT");
    expect(harness.storage.put).not.toHaveBeenCalled();
  });

  it("rejects multipart requests containing more than one file", async () => {
    const harness = setup();
    const first = new File(["one"], "one.txt", { type: "text/plain" });
    const second = new File(["two"], "two.txt", { type: "text/plain" });
    harness.readFormData.mockResolvedValue(parsedUpload(first, [first, second]));
    const POST = createProofUploadHandler(harness.upload);

    const response = await POST(uploadRequest());

    await expectApiError(response, 400, "INVALID_INPUT");
    expect(harness.storage.put).not.toHaveBeenCalled();
  });

  it("deletes only the newly created key when metadata insertion fails", async () => {
    const harness = setup();
    harness.repository.createAssetMetadata.mockRejectedValue(new Error("D1 unavailable"));
    const POST = createProofUploadHandler(harness.upload);

    const response = await POST(uploadRequest());

    await expectApiError(response, 500, "INTERNAL");
    expect(harness.storage.delete).toHaveBeenCalledWith("user-owner/proof-1/asset-1");
  });
});

describe("GET /api/proofs/[id]/asset", () => {
  it("queries by owner and proof ID, then returns a private attachment", async () => {
    const harness = setup();
    const GET = createProofAssetHandler(harness.asset);

    const response = await GET(
      new Request("https://arc.example/api/proofs/proof-1/asset"),
      { params: Promise.resolve({ id: proof.id }) },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("proof body");
    expect(harness.repository.getOwnedAsset).toHaveBeenCalledWith(owner.id, proof.id);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="evidence.txt"');
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.has("location")).toBe(false);
  });

  it("uses the same 404 for missing metadata, missing object, and cross-user access", async () => {
    const metadataMissing = setup();
    metadataMissing.repository.getOwnedAsset.mockResolvedValue(null);
    const metadataResponse = await createProofAssetHandler(metadataMissing.asset)(
      new Request("https://arc.example/api/proofs/proof-1/asset"),
      { params: Promise.resolve({ id: proof.id }) },
    );

    const objectMissing = setup();
    objectMissing.storage.get.mockResolvedValue(null);
    const objectResponse = await createProofAssetHandler(objectMissing.asset)(
      new Request("https://arc.example/api/proofs/proof-1/asset"),
      { params: Promise.resolve({ id: proof.id }) },
    );

    await expectApiError(metadataResponse, 404, "NOT_FOUND");
    await expectApiError(objectResponse, 404, "NOT_FOUND");
  });
});
