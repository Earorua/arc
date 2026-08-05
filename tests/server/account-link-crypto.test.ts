import { describe, expect, it } from "vitest";
import {
  createAccountLinkCredential,
  createSignedLinkContext,
  hashAccountLinkCredential,
  verifySignedLinkContext,
} from "../../app/server/account-link/crypto";
import {
  ACCOUNT_LINK_COOKIE,
  clearAccountLinkCookie,
  readAccountLinkCookie,
  serializeAccountLinkCookie,
} from "../../app/server/account-link/cookie";

const secret = "s".repeat(32);

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function mutateUnusedBase64UrlPaddingBits(segment: string): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const remainder = segment.length % 4;
  if (remainder !== 2 && remainder !== 3) {
    throw new Error("Segment does not contain unused padding bits");
  }

  const lastIndex = alphabet.indexOf(segment.at(-1) ?? "");
  if (lastIndex < 0) throw new Error("Invalid base64url segment");
  return `${segment.slice(0, -1)}${alphabet[lastIndex ^ 1]}`;
}

async function signRawPayload(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(payload);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "HKDF",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("Arc. account link v1"),
      info: encoder.encode("arc-account-link-internal-proof-v1"),
    },
    keyMaterial,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, payloadBytes),
  );
  return `${toBase64Url(payloadBytes)}.${toBase64Url(signature)}`;
}

describe("account-link security primitives", () => {
  it("creates a high-entropy credential and stores only a stable digest", async () => {
    const credentials = Array.from({ length: 8 }, () =>
      createAccountLinkCredential(),
    );

    expect(new Set(credentials).size).toBe(credentials.length);
    for (const credential of credentials) {
      expect(credential).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    }
    expect(await hashAccountLinkCredential(credentials[0])).toHaveLength(64);
  });

  it("hashes credentials with deterministic lowercase SHA-256", async () => {
    const firstDigest = await hashAccountLinkCredential("abc");
    const secondDigest = await hashAccountLinkCredential("abc");

    expect(firstDigest).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(secondDigest).toBe(firstDigest);
    expect(firstDigest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("creates exactly two unpadded base64url token segments", async () => {
    const now = 1_785_564_000_000;
    const token = await createSignedLinkContext(secret, {
      kind: "internal",
      intentId: "intent-1",
      userId: "user-1",
      provider: "google",
      phase: "target",
      issuedAt: now,
      expiresAt: now + 60_000,
      nonce: "nonce-1",
    });
    const segments = token.split(".");

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(segments[1]).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(token).not.toContain("=");
  });

  it("accepts the inclusive issued-at and expiry boundaries", async () => {
    const issuedAt = 1_785_564_000_000;
    const expiresAt = issuedAt + 60_000;
    const token = await createSignedLinkContext(secret, {
      kind: "internal",
      intentId: "intent-1",
      userId: "user-1",
      provider: "google",
      phase: "target",
      issuedAt,
      expiresAt,
      nonce: "nonce-1",
    });

    await expect(
      verifySignedLinkContext(secret, token, "internal", issuedAt),
    ).resolves.toMatchObject({ issuedAt });
    await expect(
      verifySignedLinkContext(secret, token, "internal", expiresAt),
    ).resolves.toMatchObject({ expiresAt });
  });

  it("rejects tampering, wrong purpose, and expiry", async () => {
    const now = 1_785_564_000_000;
    const token = await createSignedLinkContext(secret, {
      kind: "internal",
      intentId: "intent-1",
      userId: "user-1",
      provider: "google",
      phase: "target",
      issuedAt: now,
      expiresAt: now + 60_000,
      nonce: "nonce-1",
    });
    await expect(
      verifySignedLinkContext(secret, token, "internal", now + 1),
    ).resolves.toMatchObject({ intentId: "intent-1" });
    await expect(
      verifySignedLinkContext(secret, `${token}x`, "internal", now + 1),
    ).rejects.toThrow();
    await expect(
      verifySignedLinkContext(secret, token, "oauth", now + 1),
    ).rejects.toThrow();
    await expect(
      verifySignedLinkContext(secret, token, "internal", now + 60_001),
    ).rejects.toThrow();
  });

  it("rejects non-canonical base64url padding bits", async () => {
    const now = 1_785_564_000_000;
    const token = await createSignedLinkContext(secret, {
      kind: "internal",
      intentId: "intent-1",
      userId: "user-1",
      provider: "google",
      phase: "target",
      issuedAt: now,
      expiresAt: now + 60_000,
      nonce: "nonce-1",
    });
    const [payload, signature] = token.split(".");
    const nonCanonicalSignature = mutateUnusedBase64UrlPaddingBits(signature);

    expect(nonCanonicalSignature).not.toBe(signature);
    await expect(
      verifySignedLinkContext(
        secret,
        `${payload}.${nonCanonicalSignature}`,
        "internal",
        now,
      ),
    ).rejects.toThrow();
  });

  it("rejects future-issued and oversized internal contexts", async () => {
    const now = 1_785_564_000_000;
    const futureIssued = await createSignedLinkContext(secret, {
      kind: "internal",
      intentId: "intent-1",
      userId: "user-1",
      provider: "google",
      phase: "target",
      issuedAt: now + 1,
      expiresAt: now + 60_000,
      nonce: "nonce-1",
    });
    const oversized = await createSignedLinkContext(secret, {
      kind: "internal",
      intentId: "intent-1",
      userId: "user-1",
      provider: "google",
      phase: "target",
      issuedAt: now,
      expiresAt: now + 60_001,
      nonce: "nonce-1",
    });
    const otherwiseValid = await createSignedLinkContext(secret, {
      kind: "internal",
      intentId: "intent-1",
      userId: "user-1",
      provider: "google",
      phase: "target",
      issuedAt: now,
      expiresAt: now + 60_000,
      nonce: "nonce-1",
    });

    await expect(
      verifySignedLinkContext(secret, futureIssued, "internal", now),
    ).rejects.toThrow();
    await expect(
      verifySignedLinkContext(secret, oversized, "internal", now),
    ).rejects.toThrow();
    await expect(
      verifySignedLinkContext(secret, otherwiseValid, "internal", Number.NaN),
    ).rejects.toThrow();
  });

  it("rejects invalid token structure, JSON, and schema", async () => {
    for (const token of ["", "payload", ".", "a.b.c", "payload.%"] as const) {
      await expect(
        verifySignedLinkContext(secret, token, "internal", 1_785_564_000_000),
      ).rejects.toThrow();
    }

    const invalidJson = await signRawPayload("{");
    const invalidSchema = await signRawPayload(
      JSON.stringify({
        kind: "internal",
        intentId: "intent-1",
        userId: "user-1",
        provider: "google",
        phase: "target",
        issuedAt: 1_785_564_000_000,
        expiresAt: 1_785_564_060_000,
        nonce: "nonce-1",
        unexpected: true,
      }),
    );

    await expect(
      verifySignedLinkContext(
        secret,
        invalidJson,
        "internal",
        1_785_564_000_001,
      ),
    ).rejects.toThrow();
    await expect(
      verifySignedLinkContext(
        secret,
        invalidSchema,
        "internal",
        1_785_564_000_001,
      ),
    ).rejects.toThrow();
  });

  it("uses a host-only secure HttpOnly same-site cookie", () => {
    const serialized = serializeAccountLinkCookie("credential", 600);
    expect(serialized).toContain(`${ACCOUNT_LINK_COOKIE}=credential`);
    expect(serialized).toContain("Secure");
    expect(serialized).toContain("HttpOnly");
    expect(serialized).toContain("SameSite=Lax");
    expect(serialized).toContain("Path=/");
    expect(serialized).not.toContain("Domain=");
    expect(
      readAccountLinkCookie(
        new Headers({ cookie: `${ACCOUNT_LINK_COOKIE}=credential` }),
      ),
    ).toBe("credential");
    expect(clearAccountLinkCookie()).toContain("Max-Age=0");
  });

  it("returns null for malformed percent encoding in the account-link cookie", () => {
    const headers = new Headers({ cookie: `${ACCOUNT_LINK_COOKIE}=%E0%A4%A` });

    expect(readAccountLinkCookie(headers)).toBeNull();
  });
});
