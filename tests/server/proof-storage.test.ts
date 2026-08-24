import { describe, expect, it } from "vitest";
import {
  ALLOWED_PROOF_TYPES,
  MAX_PROOF_BYTES,
  ProofUploadValidationError,
  ProofJsonReadError,
  proofObjectKey,
  readProofJson,
  validateProofUpload,
} from "../../app/server/proof/storage";
import {
  createPublicProofView,
  hashShareToken,
} from "../../app/server/proof/public-view";

describe("proof asset storage policy", () => {
  it("creates an owner-prefixed key from encoded, server-selected segments", () => {
    expect(proofObjectKey("owner/one", "proof two", "asset?three")).toBe(
      "owner%2Fone/proof%20two/asset%3Fthree",
    );
  });

  it.each([
    "text/plain",
    "application/pdf",
    "image/png",
    "image/jpeg",
    "application/json",
  ])("accepts %s up to the five MiB boundary", (contentType) => {
    expect(ALLOWED_PROOF_TYPES.has(contentType)).toBe(true);
    expect(() => validateProofUpload({ contentType, sizeBytes: MAX_PROOF_BYTES })).not.toThrow();
  });

  it("reads JSON through a bounded stream and rejects missing, invalid, and oversized objects", async () => {
    const body = (value: BodyInit | null) => ({
      put: async () => undefined,
      delete: async () => undefined,
      get: async () => value === null ? null : { body: value },
    });
    await expect(readProofJson(body('{"passed":2}'), "report")).resolves.toEqual({ passed: 2 });
    await expect(readProofJson(body(null), "report")).rejects.toBeInstanceOf(ProofJsonReadError);
    await expect(readProofJson(body("not-json"), "report")).rejects.toBeInstanceOf(ProofJsonReadError);
    await expect(readProofJson(body("x".repeat(256 * 1024 + 1)), "report"))
      .rejects.toBeInstanceOf(ProofJsonReadError);
  });

  it.each(["text/html", "application/javascript", "application/x-msdownload"])(
    "rejects active content type %s",
    (contentType) => {
      expect(() => validateProofUpload({ contentType, sizeBytes: 10 })).toThrow(
        ProofUploadValidationError,
      );
    },
  );

  it("rejects empty and oversized uploads", () => {
    expect(() => validateProofUpload({ contentType: "image/png", sizeBytes: 0 })).toThrow(
      ProofUploadValidationError,
    );
    expect(() => validateProofUpload({
      contentType: "image/png",
      sizeBytes: MAX_PROOF_BYTES + 1,
    })).toThrow(ProofUploadValidationError);
  });
});

describe("public proof projection", () => {
  const version = {
    id: "version-private",
    proofId: "proof-private",
    versionNumber: 1,
    schemaVersion: "2026.08.1" as const,
    dailyUnitId: null,
    title: "Typed role research",
    kind: "document" as const,
    summary: "A public summary.",
    artifactUrl: "https://example.com/proof",
    assetId: null,
    skillIds: ["typescript"],
    completionCriteria: ["Never publish this criterion"],
    visibility: "public" as const,
    createdAt: "2026-08-24T10:00:00.000Z",
    supersedesVersionId: null,
  };

  it("publishes only explicitly selected fields", () => {
    expect(createPublicProofView({ version, status: "verified", skillNames: ["TypeScript"], fields: ["title", "status"] })).toEqual({
      schemaVersion: "2026.08.1",
      title: "Typed role research",
      status: "verified",
    });
  });

  it("hashes a token to a stable SHA-256 digest without returning the token", async () => {
    const token = "A".repeat(43);
    const digest = await hashShareToken(token);

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain(token);
    await expect(hashShareToken(token)).resolves.toBe(digest);
  });
});
