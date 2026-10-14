// @vitest-environment node

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  BRIDGE_RESULT_MARGIN_MS,
  BridgeBeginError,
  assertBridgeProviderBudget,
  decodeBridgeBeginReply,
  encodeBridgeBeginReply,
  matchBridgeBeginReply,
  parseBridgeBeginReply,
  type BridgeBeginReply,
} from "../../app/server/research/executor/begin";
import { BRIDGE_AUTH_PROTOCOL } from "../../app/server/research/executor/auth";
import { BRIDGE_BODY_LIMITS } from "../../app/server/research/executor/body";
import {
  BRIDGE_EXECUTOR_MODE,
  BRIDGE_QUEUE_TTL_MS,
  hashBridgeJob,
  parseBridgeJob,
  type BridgeJob,
} from "../../app/server/research/executor/job";
import { KIMI_RESEARCH_EXECUTION_POLICY } from "../../app/server/research/execution-policy";
import { canonicalJson } from "../../app/lib/planning/fingerprint";

const encoder = new TextEncoder();
const BASE_TIME = 1_800_000_000_000;

function rawJob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    protocol: BRIDGE_AUTH_PROTOCOL,
    executor: BRIDGE_EXECUTOR_MODE,
    jobId: "11111111-1111-4111-8111-111111111111",
    runId: "research-run-1",
    requestId: "request-1",
    inputFingerprint: "p2-" + "1".repeat(32),
    configFingerprint: "p2-" + "2".repeat(32),
    policyId: KIMI_RESEARCH_EXECUTION_POLICY.profileId,
    role: "Frontend Engineer",
    locale: "en-US",
    createdAt: BASE_TIME,
    queueExpiresAt: BASE_TIME + BRIDGE_QUEUE_TTL_MS,
    ...overrides,
  };
}

function makeJob(overrides: Record<string, unknown> = {}): BridgeJob {
  return parseBridgeJob(rawJob(overrides));
}

async function rawReply(
  job: BridgeJob,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return rawReplyAt(job, job.createdAt + 100_000, overrides);
}

async function rawReplyAt(
  job: BridgeJob,
  beganAt: number,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const grant = {
    protocol: BRIDGE_AUTH_PROTOCOL,
    jobId: job.jobId,
    requestHash: await hashBridgeJob(job),
    beganAt,
    executionExpiresAt: beganAt + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
  };
  return {
    grant,
    observedAt: beganAt,
    remainingMs: KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
    ...overrides,
  };
}

async function reply(overrides: Record<string, unknown> = {}): Promise<BridgeBeginReply> {
  const job = makeJob();
  return parseBridgeBeginReply(await rawReply(job, overrides));
}

function expectBeginError(work: () => unknown, code: BridgeBeginError["code"]): void {
  let thrown: unknown;
  try { work(); } catch (error) { thrown = error; }
  expect(thrown).toBeInstanceOf(BridgeBeginError);
  expect(thrown).toMatchObject({
    code,
    name: "BridgeBeginError",
    message: `Research bridge begin failure: ${code}`,
  });
  expect(String((thrown as Error).message)).not.toContain("top-secret");
}

async function expectMatchError(
  work: () => Promise<unknown>,
  code: BridgeBeginError["code"],
): Promise<void> {
  await expect(work()).rejects.toMatchObject({
    code,
    name: "BridgeBeginError",
    message: `Research bridge begin failure: ${code}`,
  });
}

describe("research executor begin reply", () => {
  it("parses and freezes an owned grant and reply snapshot", async () => {
    const source = await rawReply(makeJob());
    const parsed = parseBridgeBeginReply(source);
    expect(parsed).toEqual(source);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.grant)).toBe(true);
    source.remainingMs = 1;
    (source.grant as Record<string, unknown>).jobId = "22222222-2222-4222-8222-222222222222";
    expect(parsed.remainingMs).toBe(KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs);
    expect(parsed.grant.jobId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("matches the original job by id and SHA-256 hash", async () => {
    const job = makeJob();
    const parsed = await matchBridgeBeginReply(await rawReply(job), job);
    expect(parsed.grant.jobId).toBe(job.jobId);
    const nodeHash = createHash("sha256").update(canonicalJson(job), "utf8").digest("hex");
    expect(parsed.grant.requestHash).toBe(nodeHash);
    expect(parsed.grant.requestHash).toBe(await hashBridgeJob(job));
  });

  it.each([
    ["job id", { jobId: "22222222-2222-4222-8222-222222222222" }],
    ["run id", { runId: "research-run-2" }],
    ["request id", { requestId: "request-2" }],
    ["input fingerprint", { inputFingerprint: "p2-" + "3".repeat(32) }],
    ["config fingerprint", { configFingerprint: "p2-" + "4".repeat(32) }],
  ])("rejects a changed %s job identity", async (_label, change) => {
    const original = makeJob();
    const changed = makeJob(change);
    const originalReply = await rawReply(original);
    await expectMatchError(() => matchBridgeBeginReply(originalReply, changed), "conflict");
  });

  it("rejects a grant created before the job and at queue expiry", async () => {
    const job = makeJob();
    const before = await rawReply(job);
    Object.assign(before.grant as Record<string, unknown>, {
      beganAt: job.createdAt - 1,
      executionExpiresAt: job.createdAt - 1 + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
    });
    before.observedAt = job.createdAt - 1;
    await expectMatchError(() => matchBridgeBeginReply(before, job), "conflict");

    const atQueueEnd = await rawReply(job);
    Object.assign(atQueueEnd.grant as Record<string, unknown>, {
      beganAt: job.queueExpiresAt,
      executionExpiresAt: job.queueExpiresAt + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
    });
    atQueueEnd.observedAt = job.queueExpiresAt;
    atQueueEnd.remainingMs = KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs;
    await expectMatchError(() => matchBridgeBeginReply(atQueueEnd, job), "conflict");
  });

  it("accepts a grant one millisecond before queue expiry", async () => {
    const job = makeJob();
    const source = await rawReply(job);
    const grant = source.grant as Record<string, unknown>;
    grant.beganAt = job.queueExpiresAt - 1;
    grant.executionExpiresAt = (grant.beganAt as number) + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs;
    source.observedAt = grant.beganAt;
    source.remainingMs = KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs;
    const parsed = await matchBridgeBeginReply(source, job);
    expect(parsed.grant.beganAt).toBe(job.queueExpiresAt - 1);
  });

  it("rejects a grant beginning exactly at queue expiry", async () => {
    const job = makeJob();
    const source = await rawReply(job);
    const grant = source.grant as Record<string, unknown>;
    grant.beganAt = job.queueExpiresAt;
    grant.executionExpiresAt = (grant.beganAt as number) + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs;
    source.observedAt = grant.beganAt;
    source.remainingMs = KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs;
    await expectMatchError(() => matchBridgeBeginReply(source, job), "conflict");
  });

  it("accepts a structurally valid different begin as stateless validation", async () => {
    const job = makeJob();
    const source = await rawReply(job);
    const grant = source.grant as Record<string, unknown>;
    grant.beganAt = job.createdAt + 101_000;
    grant.executionExpiresAt = (grant.beganAt as number) + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs;
    source.observedAt = grant.beganAt;
    source.remainingMs = KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs;
    expect((await matchBridgeBeginReply(source, job)).grant.beganAt).toBe(job.createdAt + 101_000);
  });

  it.each([
    ["wrong protocol", { protocol: "other" }],
    ["wrong duration", { executionExpiresAt: BASE_TIME + 100_000 + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs - 1 }],
    ["wrong remaining", { remainingMs: KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs - 1 }],
    ["observation before begin", { observedAt: BASE_TIME + 99_999 }],
  ])("rejects %s", async (_label, change) => {
    const job = makeJob();
    const source = await rawReply(job);
    if ("requestHash" in change || "protocol" in change || "executionExpiresAt" in change) {
      Object.assign(source.grant as Record<string, unknown>, change);
    } else Object.assign(source, change);
    expectBeginError(() => parseBridgeBeginReply(source), "invalid-message");
  });

  it("rejects a schema-valid but mismatched request hash", async () => {
    const job = makeJob();
    const source = await rawReply(job);
    (source.grant as Record<string, unknown>).requestHash = "f".repeat(64);
    await expectMatchError(() => matchBridgeBeginReply(source, job), "conflict");
  });

  it("accepts an expired historical observation with zero remaining time", async () => {
    const parsed = await reply({
      observedAt: BASE_TIME + 100_000 + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
      remainingMs: 0,
    });
    expect(parsed.remainingMs).toBe(0);
    expectBeginError(() => assertBridgeProviderBudget(parsed, 0), "insufficient-time");
  });

  it("asserts the timeout plus result margin from monotonic elapsed time", async () => {
    const parsed = await reply();
    const required = KIMI_RESEARCH_EXECUTION_POLICY.researchTimeoutMs + BRIDGE_RESULT_MARGIN_MS;
    expect(() => assertBridgeProviderBudget(parsed, parsed.remainingMs - required)).not.toThrow();
    expectBeginError(() => assertBridgeProviderBudget(parsed, parsed.remainingMs - required + 0.1), "insufficient-time");
    expectBeginError(() => assertBridgeProviderBudget(parsed, parsed.remainingMs - required + 1), "insufficient-time");
  });

  it("ceil-rounds fractional elapsed time and rejects invalid elapsed values", async () => {
    const parsed = await reply();
    expect(() => assertBridgeProviderBudget(parsed, 1)).not.toThrow();
    expectBeginError(() => assertBridgeProviderBudget(parsed, parsed.remainingMs - 1 + 0.1), "insufficient-time");
    for (const elapsed of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expectBeginError(() => assertBridgeProviderBudget(parsed, elapsed), "invalid-message");
    }
  });

  it("uses monotonic elapsed time regardless of client wall clock skew", async () => {
    const parsed = await reply();
    const dateNow = vi.spyOn(Date, "now");
    try {
      for (const wallClock of [BASE_TIME, BASE_TIME - 86_400_000, BASE_TIME + 86_400_000, Number.MAX_SAFE_INTEGER]) {
        dateNow.mockReturnValue(wallClock);
        expect(() => assertBridgeProviderBudget(parsed, 30_000)).not.toThrow();
        expectBeginError(() => assertBridgeProviderBudget(parsed, 30_000.1), "insufficient-time");
        expectBeginError(() => assertBridgeProviderBudget(parsed, 30_001), "insufficient-time");
      }
    } finally {
      dateNow.mockRestore();
    }
  });

  it("keeps the original grant immutable when observation is refreshed", async () => {
    const first = await reply();
    const refreshed = parseBridgeBeginReply({
      ...first,
      observedAt: first.observedAt + 30_000,
      remainingMs: first.remainingMs - 30_000,
    });
    expect(refreshed.grant).toEqual(first.grant);
    expect(Object.isFrozen(refreshed.grant)).toBe(true);
    expect(refreshed.remainingMs).toBe(first.remainingMs - 30_000);
    expectBeginError(() => assertBridgeProviderBudget(refreshed, 1), "insufficient-time");
  });

  it("revalidates the reply snapshot and rejects extra or secret fields", async () => {
    const source = await rawReply(makeJob());
    (source as Record<string, unknown>).secret = "top-secret";
    expectBeginError(() => parseBridgeBeginReply(source), "invalid-message");
    const parsed = await reply();
    expectBeginError(() => assertBridgeProviderBudget({ ...parsed, secret: "top-secret" } as BridgeBeginReply, 0), "invalid-message");
  });

  it("rejects accessors, symbols, custom prototypes, and cycles without invoking getters", async () => {
    const source = await rawReply(makeJob());
    let accesses = 0;
    Object.defineProperty(source, "observedAt", {
      enumerable: true,
      configurable: true,
      get() { accesses += 1; return BASE_TIME + 100_000; },
    });
    expectBeginError(() => parseBridgeBeginReply(source), "invalid-message");
    expect(accesses).toBe(0);

    const symbolSource = await rawReply(makeJob());
    Object.defineProperty(symbolSource.grant, Symbol("secret"), { value: "top-secret", enumerable: true });
    expectBeginError(() => parseBridgeBeginReply(symbolSource), "invalid-message");

    const custom = Object.assign(Object.create({ inherited: true }), await rawReply(makeJob()));
    expectBeginError(() => parseBridgeBeginReply(custom), "invalid-message");

    const cyclic = await rawReply(makeJob());
    (cyclic.grant as Record<string, unknown>).cycle = cyclic.grant;
    expectBeginError(() => parseBridgeBeginReply(cyclic), "invalid-message");
  });

  it("rejects malformed scalar bounds and unsafe times", async () => {
    const job = makeJob();
    const validUpper = await rawReplyAt(job, Number.MAX_SAFE_INTEGER - KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs);
    expect(parseBridgeBeginReply(validUpper).grant.executionExpiresAt).toBe(Number.MAX_SAFE_INTEGER);

    const overflow = await rawReplyAt(job, Number.MAX_SAFE_INTEGER - KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs + 1);
    expectBeginError(() => parseBridgeBeginReply(overflow), "invalid-message");

    for (const beganAt of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      const next = await rawReplyAt(job, beganAt);
      expectBeginError(() => parseBridgeBeginReply(next), "invalid-message");
    }

    for (const observedAt of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      const next = await rawReply(job);
      Object.assign(next, { observedAt, remainingMs: 0 });
      expectBeginError(() => parseBridgeBeginReply(next), "invalid-message");
    }

    for (const remainingMs of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      const next = await rawReply(job);
      Object.assign(next, { remainingMs });
      expectBeginError(() => parseBridgeBeginReply(next), "invalid-message");
    }

    const expired = await rawReplyAt(job, job.createdAt + 100_000, {
      observedAt: job.createdAt + 100_000 + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
      remainingMs: 0,
    });
    expect(parseBridgeBeginReply(expired).remainingMs).toBe(0);
    expect(parseBridgeBeginReply(await rawReply(job)).remainingMs)
      .toBe(KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs);
  });

  it("canonicalizes reordered keys and round trips status bytes", async () => {
    const source = await rawReply(makeJob());
    const reordered = {
      remainingMs: source.remainingMs,
      observedAt: source.observedAt,
      grant: {
        executionExpiresAt: (source.grant as Record<string, unknown>).executionExpiresAt,
        beganAt: (source.grant as Record<string, unknown>).beganAt,
        requestHash: (source.grant as Record<string, unknown>).requestHash,
        jobId: (source.grant as Record<string, unknown>).jobId,
        protocol: (source.grant as Record<string, unknown>).protocol,
      },
    };
    const first = encodeBridgeBeginReply(source);
    const second = encodeBridgeBeginReply(reordered);
    expect(second).toEqual(first);
    expect(decodeBridgeBeginReply(first)).toEqual(parseBridgeBeginReply(source));
    expect(first.byteLength).toBeLessThanOrEqual(BRIDGE_BODY_LIMITS.status);
    expect(createHash("sha256").update(first).digest("hex")).toBe(
      createHash("sha256").update(second).digest("hex"),
    );
  });

  it("rejects zero, oversized, malformed UTF-8, and malformed JSON bytes", () => {
    const parsed = parseBridgeBeginReply({
      grant: {
        protocol: BRIDGE_AUTH_PROTOCOL,
        jobId: "11111111-1111-4111-8111-111111111111",
        requestHash: "f".repeat(64),
        beganAt: BASE_TIME,
        executionExpiresAt: BASE_TIME + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
      },
      observedAt: BASE_TIME,
      remainingMs: KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
    });
    expect(parsed.grant.jobId).toBe("11111111-1111-4111-8111-111111111111");
    expectBeginError(() => decodeBridgeBeginReply(new Uint8Array()), "invalid-message");
    expectBeginError(() => decodeBridgeBeginReply(new Uint8Array([0xff, 0xfe])), "invalid-message");
    expectBeginError(() => decodeBridgeBeginReply(encoder.encode("{")), "invalid-message");
    expectBeginError(() => decodeBridgeBeginReply(new Uint8Array(BRIDGE_BODY_LIMITS.status + 1)), "invalid-message");
    expectBeginError(() => decodeBridgeBeginReply(new ArrayBuffer(1) as unknown as Uint8Array), "invalid-message");
    expectBeginError(() => decodeBridgeBeginReply(null as unknown as Uint8Array), "invalid-message");
  });

  it("normalizes any byteLength failure to a fresh safe invalid-message error", () => {
    const original = new BridgeBeginError("conflict");
    original.message = "top-secret byteLength failure";
    const bytes = new Uint8Array([123]);
    Object.defineProperty(bytes, "byteLength", {
      configurable: true,
      get() { throw original; },
    });
    let thrown: unknown;
    try { decodeBridgeBeginReply(bytes); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(BridgeBeginError);
    expect(thrown).not.toBe(original);
    expect(thrown).toMatchObject({
      code: "invalid-message",
      name: "BridgeBeginError",
      message: "Research bridge begin failure: invalid-message",
    });
    expect(String((thrown as Error).message)).not.toContain("top-secret");
  });

  it("classifies invalid expected jobs as invalid-message before hashing", async () => {
    const job = makeJob();
    const source = await rawReply(job);
    for (const expectedJob of [
      { ...rawJob(), jobId: "bad" },
      { ...rawJob(), inputFingerprint: "p2-short" },
      { ...rawJob(), secret: "top-secret" },
      null,
    ]) {
      await expectMatchError(() => matchBridgeBeginReply(source, expectedJob), "invalid-message");
    }
  });

  it("rejects malformed grant hash lengths and characters", async () => {
    const job = makeJob();
    for (const requestHash of ["g".repeat(64), "f".repeat(63), "f".repeat(65)]) {
      const source = await rawReply(job);
      (source.grant as Record<string, unknown>).requestHash = requestHash;
      expectBeginError(() => parseBridgeBeginReply(source), "invalid-message");
    }
  });

  it("captures both inputs before awaiting the cryptographic digest", async () => {
    const source = await rawReply(makeJob());
    const expectedJob = rawJob();
    const originalDigest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest").mockImplementation(async (...args) => {
      await gate;
      return originalDigest(...args);
    });
    try {
      const pending = matchBridgeBeginReply(source, expectedJob);
      source.remainingMs = 1;
      (source.grant as Record<string, unknown>).jobId = "22222222-2222-4222-8222-222222222222";
      expectedJob.requestId = "mutated-after-snapshot";
      release();
      const matched = await pending;
      expect(matched.grant.jobId).toBe(expectedJob.jobId);
    } finally {
      digest.mockRestore();
    }
  });

  it("maps cryptographic failure to unavailable", async () => {
    const job = makeJob();
    const source = await rawReply(job);
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest").mockRejectedValueOnce(new Error("top-secret"));
    try {
      await expectMatchError(() => matchBridgeBeginReply(source, job), "unavailable");
    } finally {
      digest.mockRestore();
    }
  });
});
