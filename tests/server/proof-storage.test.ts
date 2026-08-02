import { describe, expect, it } from "vitest";
import {
  ALLOWED_PROOF_TYPES,
  MAX_PROOF_BYTES,
  ProofUploadValidationError,
  proofObjectKey,
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
  ])("accepts %s up to the five MiB boundary", (contentType) => {
    expect(ALLOWED_PROOF_TYPES.has(contentType)).toBe(true);
    expect(() => validateProofUpload({ contentType, sizeBytes: MAX_PROOF_BYTES })).not.toThrow();
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
  const proof = {
    id: "proof-private",
    userId: "owner-private",
    title: "Typed role research",
    kind: "project" as const,
    skillIds: ["research", "typescript"],
    verified: true,
    notes: "Never publish this note",
  };

  it("publishes only explicitly selected fields", () => {
    expect(createPublicProofView(proof, ["title", "verified"])).toEqual({
      title: "Typed role research",
      verified: true,
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
