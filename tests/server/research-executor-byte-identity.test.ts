// @vitest-environment node

import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import {
  BridgeAuthError,
  BRIDGE_AUTH_PROTOCOL,
  type BridgeMessageContext,
  type BridgeNonceStore,
  signBridgeMessage,
  verifyBridgeMessage,
} from "../../app/server/research/executor/auth";
import {
  type BridgeBeginError,
  decodeBridgeBeginReply,
  encodeBridgeBeginReply,
} from "../../app/server/research/executor/begin";
import {
  BRIDGE_BODY_LIMITS,
  type BridgeBodyError,
  readBridgeBody,
} from "../../app/server/research/executor/body";
import {
  BRIDGE_EXECUTOR_MODE,
  BRIDGE_QUEUE_TTL_MS,
  type BridgeJob,
  type BridgeJobError,
  decodeBridgeJob,
  encodeBridgeJob,
  hashBridgeJob,
  parseBridgeJob,
} from "../../app/server/research/executor/job";
import { KIMI_RESEARCH_EXECUTION_POLICY } from "../../app/server/research/execution-policy";

const BASE_TIME = 1_800_000_000_000;
const JOB_ID = "11111111-1111-4111-8111-111111111111";
const KEY_ID = "site-key";

function job(): BridgeJob {
  return parseBridgeJob({
    protocol: BRIDGE_AUTH_PROTOCOL,
    executor: BRIDGE_EXECUTOR_MODE,
    jobId: JOB_ID,
    runId: "research-run-1",
    requestId: "request-1",
    inputFingerprint: "p2-" + "1".repeat(32),
    configFingerprint: "p2-" + "2".repeat(32),
    policyId: KIMI_RESEARCH_EXECUTION_POLICY.profileId,
    role: "Frontend Engineer",
    locale: "en-US",
    createdAt: BASE_TIME,
    queueExpiresAt: BASE_TIME + BRIDGE_QUEUE_TTL_MS,
  });
}

async function beginReply(value: BridgeJob): Promise<Record<string, unknown>> {
  const beganAt = value.createdAt + 1_000;
  return {
    grant: {
      protocol: BRIDGE_AUTH_PROTOCOL,
      jobId: value.jobId,
      requestHash: await hashBridgeJob(value),
      beganAt,
      executionExpiresAt: beganAt + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
    },
    observedAt: beganAt,
    remainingMs: KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
  };
}

function shadowByteLength<T extends Uint8Array>(bytes: T, byteLength: number): T {
  Object.defineProperty(bytes, "byteLength", { configurable: true, value: byteLength });
  return bytes;
}

function paddedToLimit(bytes: Uint8Array, byteLength: number): Uint8Array {
  const padded = new Uint8Array(byteLength);
  padded.fill(0x20);
  padded.set(bytes);
  return padded;
}

function requestContext(): BridgeMessageContext {
  return {
    direction: "site-to-executor",
    kind: "request",
    method: "POST",
    path: "/jobs",
    audience: "https://executor.example",
    jobId: JOB_ID,
    status: null,
  };
}

function key(): Uint8Array {
  return Uint8Array.from({ length: 32 }, (_value, index) => index + 1);
}

function nonceStore(claim = vi.fn(async () => true)): BridgeNonceStore & { claim: typeof claim } {
  return { claim };
}

function streamOf(
  chunk: Uint8Array<ArrayBuffer>,
  cancel = vi.fn(),
  close = true,
): { body: ReadableStream<Uint8Array<ArrayBuffer>>; cancel: typeof cancel } {
  return {
    body: new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(chunk);
        if (close) controller.close();
      },
      cancel,
    }),
    cancel,
  };
}

function expectSafeSyncError(
  work: () => unknown,
  expected: { code: string; name: string; message: string },
): void {
  let thrown: unknown;
  try { work(); } catch (error) { thrown = error; }
  expect(thrown).toMatchObject(expected);
  expect(String((thrown as Error).message)).not.toContain("top-secret");
}

describe("research executor intrinsic byte identity", () => {
  it("rejects oversized job JSON whose own byteLength underreports the decoded bytes", () => {
    const value = job();
    const oversizedJob = shadowByteLength(
      paddedToLimit(encodeBridgeJob(value), BRIDGE_BODY_LIMITS.request + 1),
      1,
    );
    expectSafeSyncError(() => decodeBridgeJob(oversizedJob), {
      code: "invalid-message",
      name: "BridgeJobError",
      message: "Research bridge job failure: invalid-message",
    } satisfies Pick<BridgeJobError, "code" | "name" | "message">);
  });

  it("rejects oversized begin JSON whose own byteLength underreports the decoded bytes", async () => {
    const value = job();
    const oversizedBegin = shadowByteLength(
      paddedToLimit(encodeBridgeBeginReply(await beginReply(value)), BRIDGE_BODY_LIMITS.status + 1),
      1,
    );
    expectSafeSyncError(() => decodeBridgeBeginReply(oversizedBegin), {
      code: "invalid-message",
      name: "BridgeBeginError",
      message: "Research bridge begin failure: invalid-message",
    } satisfies Pick<BridgeBeginError, "code" | "name" | "message">);
  });

  it("decodes valid intrinsic bytes without consulting an own byteLength getter", async () => {
    const value = job();
    let accesses = 0;
    const jobBytes = encodeBridgeJob(value);
    Object.defineProperty(jobBytes, "byteLength", {
      configurable: true,
      get() { accesses += 1; throw new Error("top-secret job metadata"); },
    });
    expect(decodeBridgeJob(jobBytes)).toEqual(value);

    const beginBytes = encodeBridgeBeginReply(await beginReply(value));
    Object.defineProperty(beginBytes, "byteLength", {
      configurable: true,
      get() { accesses += 1; throw new Error("top-secret begin metadata"); },
    });
    expect(decodeBridgeBeginReply(beginBytes).grant.jobId).toBe(value.jobId);
    expect(accesses).toBe(0);
  });

  it("preserves every intrinsic stream byte when own byteLength is smaller or larger", async () => {
    for (const reported of [1, 100]) {
      const chunk = shadowByteLength(new Uint8Array([0x61, 0x62, 0x63]), reported);
      const source = streamOf(chunk);
      await expect(readBridgeBody(source, { maxBytes: 3, timeoutMs: 100 }))
        .resolves.toEqual(new Uint8Array([0x61, 0x62, 0x63]));
      expect(source.cancel).not.toHaveBeenCalled();
    }
  });

  it("enforces the body limit from intrinsic bytes and cancels the stream", async () => {
    const source = streamOf(shadowByteLength(new Uint8Array([1, 2, 3, 4]), 1), vi.fn(), false);
    await expect(readBridgeBody(source, { maxBytes: 3, timeoutMs: 100 })).rejects.toMatchObject({
      code: "body-limit",
      name: "BridgeBodyError",
      message: "Research bridge body failure: body-limit",
    } satisfies Pick<BridgeBodyError, "code" | "name" | "message">);
    expect(source.cancel).toHaveBeenCalledOnce();
  });

  it("reads valid stream bytes without consulting an own byteLength getter", async () => {
    let accesses = 0;
    const chunk = new Uint8Array([1, 2, 3]);
    Object.defineProperty(chunk, "byteLength", {
      configurable: true,
      get() { accesses += 1; throw new Error("top-secret stream metadata"); },
    });
    await expect(readBridgeBody(streamOf(chunk), { maxBytes: 3, timeoutMs: 100 }))
      .resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(accesses).toBe(0);
  });

  it("rejects an intrinsically short key even when own byteLength reports 32", async () => {
    await expect(signBridgeMessage({
      context: requestContext(),
      body: new Uint8Array([1, 2, 3]),
      keyId: KEY_ID,
      keyBytes: shadowByteLength(new Uint8Array(16), 32),
      now: () => BASE_TIME,
    })).rejects.toMatchObject({
      code: "invalid-config",
      name: "BridgeAuthError",
      message: "Research bridge authentication failure: invalid-config",
    } satisfies Pick<BridgeAuthError, "code" | "name" | "message">);
  });

  it("accepts an intrinsic 32-byte key whose own byteLength underreports", async () => {
    await expect(signBridgeMessage({
      context: requestContext(),
      body: new Uint8Array([1, 2, 3]),
      keyId: KEY_ID,
      keyBytes: shadowByteLength(key(), 1),
      now: () => BASE_TIME,
    })).resolves.toBeInstanceOf(Headers);
  });

  it.each([1, 100])("signs and verifies the actual body when own byteLength reports %i", async (reported) => {
    const actualBody = new Uint8Array([0x61, 0x62, 0x63]);
    const headers = await signBridgeMessage({
      context: requestContext(),
      body: shadowByteLength(actualBody.slice(), reported),
      keyId: KEY_ID,
      keyBytes: key(),
      now: () => BASE_TIME,
    });
    const nonces = nonceStore();
    await expect(verifyBridgeMessage({
      context: requestContext(),
      body: actualBody,
      keyId: KEY_ID,
      keyBytes: key(),
      now: () => BASE_TIME,
      headers,
      nonces,
    })).resolves.toBeUndefined();
    expect(nonces.claim).toHaveBeenCalledOnce();
  });

  it("snapshots actual body and key bytes before the first await without replacing WebCrypto", async () => {
    const body = shadowByteLength(new Uint8Array([1, 2, 3]), 100);
    const keyBytes = shadowByteLength(key(), 1);
    const headers = await signBridgeMessage({
      context: requestContext(), body, keyId: KEY_ID, keyBytes, now: () => BASE_TIME,
    });
    const pending = verifyBridgeMessage({
      context: requestContext(), body, keyId: KEY_ID, keyBytes, now: () => BASE_TIME,
      headers,
      nonces: nonceStore(),
    });
    body.fill(9);
    keyBytes.fill(9);
    await expect(pending).resolves.toBeUndefined();
  });

  it("supports ordinary Buffer inputs and never consults own byte metadata", async () => {
    const value = job();
    expect(decodeBridgeJob(Buffer.from(encodeBridgeJob(value)))).toEqual(value);

    let accesses = 0;
    const body = new Uint8Array([1, 2, 3]);
    const keyBytes = key();
    for (const bytes of [body, keyBytes]) {
      Object.defineProperty(bytes, "byteLength", {
        configurable: true,
        get() { accesses += 1; throw new Error("top-secret auth metadata"); },
      });
    }
    const headers = await signBridgeMessage({
      context: requestContext(), body, keyId: KEY_ID, keyBytes, now: () => BASE_TIME,
    });
    await expect(verifyBridgeMessage({
      context: requestContext(),
      body: Buffer.from([1, 2, 3]),
      keyId: KEY_ID,
      keyBytes: Buffer.from(key()),
      now: () => BASE_TIME,
      headers,
      nonces: nonceStore(),
    })).resolves.toBeUndefined();
    expect(accesses).toBe(0);
  });

  it("maps fake and proxy typed-array receivers to safe module errors", async () => {
    const fake = Object.create(Uint8Array.prototype) as Uint8Array<ArrayBuffer>;
    const proxy = new Proxy(new Uint8Array([1, 2, 3]), {});
    for (const bytes of [fake, proxy]) {
      expectSafeSyncError(() => decodeBridgeJob(bytes), {
        code: "invalid-message",
        name: "BridgeJobError",
        message: "Research bridge job failure: invalid-message",
      });
      await expect(readBridgeBody(streamOf(bytes), { maxBytes: 3, timeoutMs: 100 }))
        .rejects.toMatchObject({ code: "body-read", name: "BridgeBodyError" });
      await expect(signBridgeMessage({
        context: requestContext(),
        body: new Uint8Array(),
        keyId: KEY_ID,
        keyBytes: bytes,
        now: () => BASE_TIME,
      })).rejects.toMatchObject({ code: "unavailable", name: "BridgeAuthError" });
    }
  });
});
