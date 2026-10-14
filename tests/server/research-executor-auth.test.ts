// @vitest-environment node

import { createHash, createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BRIDGE_AUTH_PROTOCOL,
  BridgeAuthError,
  type BridgeMessageContext,
  type BridgeNonceStore,
  signBridgeMessage,
  verifyBridgeMessage,
} from "../../app/server/research/executor/auth";
import { BRIDGE_BODY_LIMITS } from "../../app/server/research/executor/body";

const NOW = 1_800_000_000_000;
const KEY_ID = "synthetic-1";
const RECEIVER = "https://executor.example";
const JOB_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_JOB_ID = "22222222-2222-4222-8222-222222222222";
const encoder = new TextEncoder();

const siteKey = () => new Uint8Array(32).fill(17);
const executorKey = () => new Uint8Array(32).fill(34);
const requestBody = () => encoder.encode('{"x":1}');

function requestContext(): BridgeMessageContext {
  return {
    direction: "site-to-executor",
    kind: "request",
    method: "POST",
    path: "/internal/research/jobs",
    audience: RECEIVER,
    jobId: JOB_ID,
    status: null,
  };
}

function responseContext(): BridgeMessageContext {
  return {
    direction: "executor-to-site",
    kind: "response",
    method: "POST",
    path: "/internal/research/jobs",
    audience: "https://site.example",
    jobId: JOB_ID,
    status: 200,
  };
}

class AtomicMemoryNonceStore implements BridgeNonceStore {
  readonly claims: Array<{ scope: string; nonce: string; expiresAt: number; now: number }> = [];
  readonly seen = new Set<string>();

  async claim(input: { scope: string; nonce: string; expiresAt: number; now: number }) {
    this.claims.push({ ...input });
    const identity = `${input.scope}:${input.nonce}`;
    if (this.seen.has(identity)) return false;
    this.seen.add(identity);
    return true;
  }
}

async function signRequest(
  context = requestContext(),
  body = requestBody(),
  keyBytes = siteKey(),
) {
  return signBridgeMessage({ context, body, keyId: KEY_ID, keyBytes, now: () => NOW });
}

async function expectAuthError(work: Promise<unknown>, code: string) {
  const error = await work.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(BridgeAuthError);
  expect(error).toMatchObject({
    code,
    message: `Research bridge authentication failure: ${code}`,
    name: "BridgeAuthError",
  });
  return error as BridgeAuthError;
}

function independentHeaders(input: {
  context: BridgeMessageContext;
  body: Uint8Array;
  keyId: string;
  keyBytes: Uint8Array;
  timestamp: number;
  nonce: string;
}) {
  const digest = createHash("sha256").update(input.body).digest("hex");
  const canonical = JSON.stringify([
    BRIDGE_AUTH_PROTOCOL,
    input.context.direction,
    input.context.kind,
    input.context.method,
    input.context.path,
    input.context.audience,
    input.context.jobId,
    input.context.status,
    input.keyId,
    input.timestamp,
    input.nonce,
    digest,
  ]);
  const signature = createHmac("sha256", input.keyBytes).update(canonical).digest("hex");
  return new Headers({
    "x-arc-bridge-key-id": input.keyId,
    "x-arc-bridge-time": String(input.timestamp),
    "x-arc-bridge-nonce": input.nonce,
    "x-arc-bridge-signature": signature,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("research executor bridge authentication", () => {
  it("verifies valid messages in both directions with their corresponding keys", async () => {
    const cases = [
      { context: requestContext(), body: requestBody(), keyBytes: siteKey() },
      { context: responseContext(), body: encoder.encode('{"accepted":true}'), keyBytes: executorKey() },
    ];

    for (const value of cases) {
      const headers = await signBridgeMessage({
        ...value,
        keyId: KEY_ID,
        now: () => NOW,
      });
      await expect(verifyBridgeMessage({
        ...value,
        keyId: KEY_ID,
        now: () => NOW,
        headers,
        nonces: new AtomicMemoryNonceStore(),
      })).resolves.toBeUndefined();
    }
  });

  it("emits only the four bounded authentication headers", async () => {
    const headers = await signRequest();

    expect([...headers.keys()].sort()).toEqual([
      "x-arc-bridge-key-id",
      "x-arc-bridge-nonce",
      "x-arc-bridge-signature",
      "x-arc-bridge-time",
    ]);
    expect(headers.get("x-arc-bridge-key-id")).toBe(KEY_ID);
    expect(headers.get("x-arc-bridge-time")).toBe(String(NOW));
    expect(headers.get("x-arc-bridge-nonce")).toMatch(/^[0-9a-f]{32}$/u);
    expect(headers.get("x-arc-bridge-signature")).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("verifies a fixed signature independently produced with Node HMAC", async () => {
    const context = requestContext();
    const body = requestBody();
    const keyBytes = siteKey();
    const nonce = "00112233445566778899aabbccddeeff";
    const headers = independentHeaders({
      context,
      body,
      keyId: KEY_ID,
      keyBytes,
      timestamp: NOW,
      nonce,
    });
    const nonces = new AtomicMemoryNonceStore();

    await expect(verifyBridgeMessage({
      context,
      body,
      keyId: KEY_ID,
      keyBytes,
      now: () => NOW,
      headers,
      nonces,
    })).resolves.toBeUndefined();

    expect(nonces.claims).toEqual([{
      scope: `site-to-executor:${KEY_ID}`,
      nonce,
      expiresAt: NOW + 120_001,
      now: NOW,
    }]);
  });

  it.each([
    ["direction", { ...requestContext(), direction: "executor-to-site" }],
    ["kind", { ...requestContext(), kind: "response", status: 200 }],
    ["method", { ...requestContext(), method: "GET" }],
    ["path", { ...requestContext(), path: "/internal/research/status" }],
    ["audience", { ...requestContext(), audience: "https://other.example" }],
    ["job", { ...requestContext(), jobId: OTHER_JOB_ID }],
  ] as const)("rejects a substituted %s binding", async (_label, context) => {
    const headers = await signRequest();

    await expectAuthError(verifyBridgeMessage({
      context: context as BridgeMessageContext,
      body: requestBody(),
      keyId: KEY_ID,
      keyBytes: siteKey(),
      now: () => NOW,
      headers,
      nonces: new AtomicMemoryNonceStore(),
    }), "unauthorized");
  });

  it("rejects response-status substitution", async () => {
    const context = responseContext();
    const body = encoder.encode('{"accepted":true}');
    const keyBytes = executorKey();
    const headers = await signBridgeMessage({
      context,
      body,
      keyId: KEY_ID,
      keyBytes,
      now: () => NOW,
    });

    await expectAuthError(verifyBridgeMessage({
      context: { ...context, status: 202 },
      body,
      keyId: KEY_ID,
      keyBytes,
      now: () => NOW,
      headers,
      nonces: new AtomicMemoryNonceStore(),
    }), "unauthorized");
  });

  it("rejects opposite-direction substitution even when both directions use identical key bytes", async () => {
    const keyBytes = siteKey();
    const headers = await signRequest(requestContext(), requestBody(), keyBytes);

    await expectAuthError(verifyBridgeMessage({
      context: { ...responseContext(), audience: RECEIVER },
      body: requestBody(),
      keyId: KEY_ID,
      keyBytes,
      now: () => NOW,
      headers,
      nonces: new AtomicMemoryNonceStore(),
    }), "unauthorized");
  });

  it("rejects body and key substitution without claiming the nonce", async () => {
    const headers = await signRequest();

    for (const value of [
      { body: encoder.encode('{"x":2}'), keyBytes: siteKey() },
      { body: requestBody(), keyBytes: executorKey() },
    ]) {
      const nonces = new AtomicMemoryNonceStore();
      await expectAuthError(verifyBridgeMessage({
        context: requestContext(),
        ...value,
        keyId: KEY_ID,
        now: () => NOW,
        headers,
        nonces,
      }), "unauthorized");
      expect(nonces.claims).toEqual([]);
    }
  });

  it("rejects an unknown key identifier instead of selecting another key", async () => {
    const headers = await signRequest();
    headers.set("x-arc-bridge-key-id", "unknown-key");
    const nonces = new AtomicMemoryNonceStore();

    await expectAuthError(verifyBridgeMessage({
      context: requestContext(),
      body: requestBody(),
      keyId: KEY_ID,
      keyBytes: siteKey(),
      now: () => NOW,
      headers,
      nonces,
    }), "unauthorized");
    expect(nonces.claims).toEqual([]);
  });

  it.each([
    ["missing key id", "x-arc-bridge-key-id", null],
    ["missing time", "x-arc-bridge-time", null],
    ["missing nonce", "x-arc-bridge-nonce", null],
    ["missing signature", "x-arc-bridge-signature", null],
    ["non-canonical time", "x-arc-bridge-time", "01800000000000"],
    ["negative time", "x-arc-bridge-time", "-1"],
    ["oversized time", "x-arc-bridge-time", "12345678901234567"],
    ["uppercase nonce", "x-arc-bridge-nonce", "00112233445566778899AABBCCDDEEFF"],
    ["short nonce", "x-arc-bridge-nonce", "00"],
    ["uppercase signature", "x-arc-bridge-signature", "A".repeat(64)],
    ["short signature", "x-arc-bridge-signature", "00"],
  ] as const)("rejects an invalid header: %s", async (_label, name, value) => {
    const headers = await signRequest();
    if (value === null) headers.delete(name);
    else headers.set(name, value);
    const nonces = new AtomicMemoryNonceStore();

    await expectAuthError(verifyBridgeMessage({
      context: requestContext(),
      body: requestBody(),
      keyId: KEY_ID,
      keyBytes: siteKey(),
      now: () => NOW,
      headers,
      nonces,
    }), "unauthorized");
    expect(nonces.claims).toEqual([]);
  });

  it.each([
    "x-arc-bridge-key-id",
    "x-arc-bridge-time",
    "x-arc-bridge-nonce",
    "x-arc-bridge-signature",
  ])("rejects duplicate %s headers", async (name) => {
    const headers = await signRequest();
    headers.append(name, headers.get(name)!);
    const nonces = new AtomicMemoryNonceStore();

    await expectAuthError(verifyBridgeMessage({
      context: requestContext(),
      body: requestBody(),
      keyId: KEY_ID,
      keyBytes: siteKey(),
      now: () => NOW,
      headers,
      nonces,
    }), "unauthorized");
    expect(nonces.claims).toEqual([]);
  });

  it.each([
    [NOW - 120_000, "accepted"],
    [NOW + 30_000, "accepted"],
    [NOW - 120_001, "expired"],
    [NOW + 30_001, "expired"],
  ] as const)("enforces the timestamp window at %s (%s)", async (timestamp, outcome) => {
    const context = requestContext();
    const body = requestBody();
    const keyBytes = siteKey();
    const headers = independentHeaders({
      context,
      body,
      keyId: KEY_ID,
      keyBytes,
      timestamp,
      nonce: "00112233445566778899aabbccddeeff",
    });
    const work = verifyBridgeMessage({
      context,
      body,
      keyId: KEY_ID,
      keyBytes,
      now: () => NOW,
      headers,
      nonces: new AtomicMemoryNonceStore(),
    });

    if (outcome === "accepted") await expect(work).resolves.toBeUndefined();
    else await expectAuthError(work, "expired");
  });

  it("allows exactly one concurrent verification through an atomic nonce store", async () => {
    const headers = await signRequest();
    const nonces = new AtomicMemoryNonceStore();
    const verify = () => verifyBridgeMessage({
      context: requestContext(),
      body: requestBody(),
      keyId: KEY_ID,
      keyBytes: siteKey(),
      now: () => NOW,
      headers,
      nonces,
    });

    const results = await Promise.allSettled([verify(), verify()]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "replay" });
    expect(nonces.claims).toHaveLength(2);
  });

  it("rejects replay when the atomic nonce claim returns false", async () => {
    const headers = await signRequest();
    const nonces = new AtomicMemoryNonceStore();
    await verifyBridgeMessage({
      context: requestContext(), body: requestBody(), keyId: KEY_ID, keyBytes: siteKey(),
      now: () => NOW, headers, nonces,
    });

    await expectAuthError(verifyBridgeMessage({
      context: requestContext(), body: requestBody(), keyId: KEY_ID, keyBytes: siteKey(),
      now: () => NOW, headers, nonces,
    }), "replay");
  });

  it("fails closed when nonce storage is unavailable", async () => {
    const marker = "synthetic-storage-secret";
    const headers = await signRequest();
    const nonces: BridgeNonceStore = { claim: async () => { throw new Error(marker); } };

    const error = await expectAuthError(verifyBridgeMessage({
      context: requestContext(), body: requestBody(), keyId: KEY_ID, keyBytes: siteKey(),
      now: () => NOW, headers, nonces,
    }), "unavailable");

    expect(String(error)).not.toContain(marker);
    expect(Object.prototype.hasOwnProperty.call(error, "cause")).toBe(false);
  });

  it("rechecks expiration after cryptography finishes", async () => {
    const headers = await signRequest();
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(crypto.subtle, "digest").mockImplementation(async (algorithm, data) => {
      await gate;
      return originalDigest(algorithm, data);
    });
    let current = NOW;
    const nonces = new AtomicMemoryNonceStore();

    const work = verifyBridgeMessage({
      context: requestContext(), body: requestBody(), keyId: KEY_ID, keyBytes: siteKey(),
      now: () => current, headers, nonces,
    });
    current = NOW + 120_001;
    release();

    await expectAuthError(work, "expired");
    expect(nonces.claims).toEqual([]);
  });

  it("rechecks expiration after the nonce claim finishes", async () => {
    const headers = await signRequest();
    let releaseClaim!: (accepted: boolean) => void;
    let claimStarted!: () => void;
    const started = new Promise<void>((resolve) => { claimStarted = resolve; });
    const pendingClaim = new Promise<boolean>((resolve) => { releaseClaim = resolve; });
    const nonces: BridgeNonceStore = {
      claim: async () => {
        claimStarted();
        return pendingClaim;
      },
    };
    let current = NOW;

    const work = verifyBridgeMessage({
      context: requestContext(), body: requestBody(), keyId: KEY_ID, keyBytes: siteKey(),
      now: () => current, headers, nonces,
    });
    await started;
    current = NOW + 120_001;
    releaseClaim(true);

    await expectAuthError(work, "expired");
  });

  it("snapshots signing inputs before the first asynchronous operation", async () => {
    const context = requestContext();
    const originalContext = { ...context };
    const body = requestBody();
    const originalBody = body.slice();
    const keyBytes = siteKey();
    const originalKey = keyBytes.slice();
    const input = { context, body, keyId: KEY_ID, keyBytes, now: () => NOW };

    const work = signBridgeMessage(input);
    context.path = "/mutated";
    body.fill(9);
    keyBytes.fill(9);
    input.keyId = "mutated-key";

    const headers = await work;
    await expect(verifyBridgeMessage({
      context: originalContext,
      body: originalBody,
      keyId: KEY_ID,
      keyBytes: originalKey,
      now: () => NOW,
      headers,
      nonces: new AtomicMemoryNonceStore(),
    })).resolves.toBeUndefined();
  });

  it("snapshots verification inputs before the first asynchronous operation", async () => {
    const originalContext = requestContext();
    const originalBody = requestBody();
    const originalKey = siteKey();
    const headers = await signRequest(originalContext, originalBody, originalKey);
    const context = { ...originalContext };
    const body = originalBody.slice();
    const keyBytes = originalKey.slice();
    const mutableHeaders = new Headers(headers);
    const originalStore = new AtomicMemoryNonceStore();
    const replacementStore: BridgeNonceStore = { claim: async () => false };
    const input = {
      context,
      body,
      keyId: KEY_ID,
      keyBytes,
      now: () => NOW,
      headers: mutableHeaders,
      nonces: originalStore as BridgeNonceStore,
    };

    const work = verifyBridgeMessage(input);
    context.path = "/mutated";
    body.fill(9);
    keyBytes.fill(9);
    input.keyId = "mutated-key";
    mutableHeaders.set("x-arc-bridge-signature", "0".repeat(64));
    input.nonces = replacementStore;

    await expect(work).resolves.toBeUndefined();
    expect(originalStore.claims).toHaveLength(1);
  });

  it.each([
    ["short key", { keyBytes: new Uint8Array(31) }],
    ["long key", { keyBytes: new Uint8Array(33) }],
    ["invalid key id", { keyId: "bad key id" }],
    ["empty key id", { keyId: "" }],
    ["unsafe clock", { now: (): number => Number.MAX_SAFE_INTEGER }],
    ["negative clock", { now: (): number => -1 }],
    ["fractional clock", { now: (): number => 1.5 }],
  ] as const)("rejects invalid configuration: %s", async (_label, override) => {
    await expectAuthError(signBridgeMessage({
      context: requestContext(),
      body: requestBody(),
      keyId: KEY_ID,
      keyBytes: siteKey(),
      now: () => NOW,
      ...override,
    }), "invalid-config");
  });

  it.each([
    ["non-HTTPS audience", { ...requestContext(), audience: "http://executor.example" }],
    ["audience path", { ...requestContext(), audience: "https://executor.example/path" }],
    ["invalid path", { ...requestContext(), path: "internal/research/jobs" }],
    ["invalid UUID", { ...requestContext(), jobId: "not-a-job" }],
    ["request status", { ...requestContext(), status: 200 }],
    ["response without status", { ...responseContext(), status: null }],
  ] as const)("rejects an invalid message context: %s", async (_label, context) => {
    await expectAuthError(signBridgeMessage({
      context: context as BridgeMessageContext,
      body: requestBody(),
      keyId: KEY_ID,
      keyBytes: siteKey(),
      now: () => NOW,
    }), "invalid-message");
  });

  it("rejects a body above the bridge result ceiling", async () => {
    await expectAuthError(signBridgeMessage({
      context: requestContext(),
      body: new Uint8Array(BRIDGE_BODY_LIMITS.result + 1),
      keyId: KEY_ID,
      keyBytes: siteKey(),
      now: () => NOW,
    }), "invalid-message");
  });

  it("normalizes cryptographic failures without exposing inputs or raw exceptions", async () => {
    const marker = "synthetic-crypto-secret";
    const keyBytes = siteKey();
    const body = encoder.encode("sensitive-body-marker");
    vi.spyOn(crypto.subtle, "digest").mockRejectedValue(new Error(marker));

    const error = await expectAuthError(signBridgeMessage({
      context: requestContext(), body, keyId: KEY_ID, keyBytes, now: () => NOW,
    }), "unavailable");
    const serialized = `${String(error)} ${JSON.stringify(error)}`;

    expect(serialized).not.toContain(marker);
    expect(serialized).not.toContain("sensitive-body-marker");
    expect(serialized).not.toContain(Buffer.from(keyBytes).toString("hex"));
    expect(Object.prototype.hasOwnProperty.call(error, "cause")).toBe(false);
  });
});
