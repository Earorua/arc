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
    const credential = createAccountLinkCredential();
    expect(credential).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(await hashAccountLinkCredential(credential)).toHaveLength(64);
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
