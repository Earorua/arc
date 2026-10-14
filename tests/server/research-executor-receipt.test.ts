// @vitest-environment node

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { KIMI_RESEARCH_EXECUTION_POLICY } from "../../app/server/research/execution-policy";
import { BRIDGE_AUTH_PROTOCOL } from "../../app/server/research/executor/auth";
import {
  BridgeBeginError,
  parseBridgeBeginGrant,
  type BridgeBeginGrant,
} from "../../app/server/research/executor/begin";
import { BRIDGE_BODY_LIMITS } from "../../app/server/research/executor/body";
import {
  BRIDGE_EXECUTOR_MODE,
  BRIDGE_QUEUE_TTL_MS,
  hashBridgeJob,
  parseBridgeJob,
  type BridgeJob,
} from "../../app/server/research/executor/job";
import {
  BRIDGE_RECEIPT_RETENTION_MS,
  BridgeReceiptError,
  decodeBridgeProviderReceipt,
  encodeBridgeProviderReceipt,
  hashBridgeProviderReceipt,
  matchBridgeProviderReceipt,
  parseBridgeReceiptMetadata,
  parseBridgeProviderReceipt,
  summarizeBridgeProviderReceipt,
} from "../../app/server/research/executor/receipt";
import { RESEARCH_PROVIDER_LIMITS } from "../../app/server/research/provider";

const BASE_TIME = 1_800_000_000_000;
const JOB_ID = "11111111-1111-4111-8111-111111111111";
const encoder = new TextEncoder();

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

async function grant(overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const value = job();
  const beganAt = value.createdAt + 100_000;
  return {
    protocol: BRIDGE_AUTH_PROTOCOL,
    jobId: value.jobId,
    requestHash: await hashBridgeJob(value),
    beganAt,
    executionExpiresAt: beganAt + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
    ...overrides,
  };
}

function usage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    promptTokens: 120,
    completionTokens: 80,
    totalTokens: 200,
    costMicros: 6_250_000,
    webSearchRequests: 1,
    ...overrides,
  };
}

function responseOutcome(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "response",
    content: '{"example":"unvalidated model content"}',
    annotations: [{
      type: "url_citation",
      url: "https://example.com/source",
      title: "Example source",
    }],
    actualModel: "moonshotai/kimi-k2.5",
    usage: usage(),
    ...overrides,
  };
}

function errorOutcome(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "error",
    code: "timeout",
    retryable: true,
    charged: "unknown",
    actualModel: null,
    usage: null,
    ...overrides,
  };
}

async function receipt(
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return {
    grant: await grant(),
    producedAt: BASE_TIME - 10_000,
    latencyMs: 42_000,
    outcome: responseOutcome(),
    ...overrides,
  };
}

function expectReceiptError(
  work: () => unknown,
  code: BridgeReceiptError["code"] = "invalid-message",
): void {
  let thrown: unknown;
  try { work(); } catch (error) { thrown = error; }
  expect(thrown).toBeInstanceOf(BridgeReceiptError);
  expect(thrown).toMatchObject({
    code,
    name: "BridgeReceiptError",
    message: `Research bridge receipt failure: ${code}`,
  });
  expect(String((thrown as Error).message)).not.toContain("top-secret");
}

async function expectReceiptRejection(
  work: () => Promise<unknown>,
  code: BridgeReceiptError["code"],
): Promise<void> {
  await expect(work()).rejects.toMatchObject({
    code,
    name: "BridgeReceiptError",
    message: `Research bridge receipt failure: ${code}`,
  });
}

function expectBeginError(work: () => unknown): void {
  let thrown: unknown;
  try { work(); } catch (error) { thrown = error; }
  expect(thrown).toBeInstanceOf(BridgeBeginError);
  expect(thrown).toMatchObject({
    code: "invalid-message",
    name: "BridgeBeginError",
    message: "Research bridge begin failure: invalid-message",
  });
}

function padded(bytes: Uint8Array<ArrayBuffer>, byteLength: number): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(byteLength);
  result.fill(0x20);
  result.set(bytes);
  return result;
}

describe("research executor standalone begin grant", () => {
  it("parses the existing grant schema into an owned frozen snapshot", async () => {
    const source = await grant();
    const parsed = parseBridgeBeginGrant(source);
    expect(parsed).toEqual(source);
    expect(Object.isFrozen(parsed)).toBe(true);
    source.jobId = "22222222-2222-4222-8222-222222222222";
    expect(parsed.jobId).toBe(JOB_ID);
  });

  it("rejects extras, malformed identity, duration, and unsafe times", async () => {
    const valid = await grant();
    const invalidBeganAt = [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]
      .map((beganAt) => ({
        ...valid,
        beganAt,
        executionExpiresAt: beganAt + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
      }));
    for (const changed of [
      { ...valid, extra: "top-secret" },
      { ...valid, protocol: "other" },
      { ...valid, jobId: "bad" },
      { ...valid, requestHash: "g".repeat(64) },
      { ...valid, requestHash: "f".repeat(63) },
      { ...valid, executionExpiresAt: (valid.executionExpiresAt as number) - 1 },
      ...invalidBeganAt,
    ]) expectBeginError(() => parseBridgeBeginGrant(changed));

    const largestBeganAt = Number.MAX_SAFE_INTEGER - KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs;
    expect(parseBridgeBeginGrant(await grant({
      beganAt: largestBeganAt,
      executionExpiresAt: Number.MAX_SAFE_INTEGER,
    })).executionExpiresAt).toBe(Number.MAX_SAFE_INTEGER);
    expectBeginError(() => parseBridgeBeginGrant({
      ...valid,
      beganAt: largestBeganAt + 1,
      executionExpiresAt: Number.MAX_SAFE_INTEGER,
    }));
  });

  it("rejects hostile object shapes without invoking getters", async () => {
    const source = await grant();
    let accesses = 0;
    Object.defineProperty(source, "jobId", {
      enumerable: true,
      get() { accesses += 1; return JOB_ID; },
    });
    expectBeginError(() => parseBridgeBeginGrant(source));
    expect(accesses).toBe(0);

    const symbol = await grant();
    Object.defineProperty(symbol, Symbol("secret"), { value: "top-secret", enumerable: true });
    expectBeginError(() => parseBridgeBeginGrant(symbol));
    const custom = Object.assign(Object.create({ inherited: true }), await grant());
    expectBeginError(() => parseBridgeBeginGrant(custom));
    const cyclic = await grant();
    cyclic.cycle = cyclic;
    expectBeginError(() => parseBridgeBeginGrant(cyclic));
  });
});

describe("research executor private provider receipt", () => {
  it("parses, canonically encodes, decodes, and hashes a private response", async () => {
    const source = await receipt();
    const parsed = parseBridgeProviderReceipt(source);
    const bytes = encodeBridgeProviderReceipt(source);
    expect(decodeBridgeProviderReceipt(bytes)).toEqual(parsed);
    expect(parsed.outcome.kind).toBe("response");
    if (parsed.outcome.kind !== "response") throw new Error("expected response");
    expect(parsed.outcome.content).toBe('{"example":"unvalidated model content"}');
    expect("candidate" in parsed.outcome).toBe(false);
    expect("quality" in parsed.outcome).toBe(false);
    expect(bytes.byteLength).toBeLessThanOrEqual(BRIDGE_BODY_LIMITS.result);
    const expected = createHash("sha256").update(bytes).digest("hex");
    expect(await hashBridgeProviderReceipt(source)).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("owns and deeply freezes the grant, outcome, annotations, and usage", async () => {
    const source = await receipt();
    const parsed = parseBridgeProviderReceipt(source);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.grant)).toBe(true);
    expect(Object.isFrozen(parsed.outcome)).toBe(true);
    if (parsed.outcome.kind !== "response") throw new Error("expected response");
    expect(Object.isFrozen(parsed.outcome.annotations)).toBe(true);
    expect(Object.isFrozen(parsed.outcome.annotations[0])).toBe(true);
    expect(Object.isFrozen(parsed.outcome.usage)).toBe(true);

    const sourceOutcome = source.outcome as Record<string, unknown>;
    sourceOutcome.content = "mutated";
    ((sourceOutcome.annotations as Record<string, unknown>[])[0]!).title = "mutated";
    (sourceOutcome.usage as Record<string, unknown>).costMicros = 0;
    (source.grant as Record<string, unknown>).requestHash = "f".repeat(64);
    expect(parsed.outcome.content).toBe('{"example":"unvalidated model content"}');
    expect(parsed.outcome.annotations[0]?.title).toBe("Example source");
    expect(parsed.outcome.usage?.costMicros).toBe(6_250_000);
    expect(parsed.grant.requestHash).not.toBe("f".repeat(64));
  });

  it("preserves response content verbatim and enforces actual UTF-8 bytes", async () => {
    const spaced = "  valid model content \n";
    const spacedParsed = parseBridgeProviderReceipt(await receipt({
      outcome: responseOutcome({ content: spaced }),
    }));
    expect(spacedParsed.outcome.kind === "response" && spacedParsed.outcome.content).toBe(spaced);

    const exact = "🙂".repeat(RESEARCH_PROVIDER_LIMITS.contentBytes / 4);
    expect(encoder.encode(exact).byteLength).toBe(RESEARCH_PROVIDER_LIMITS.contentBytes);
    const exactParsed = parseBridgeProviderReceipt(await receipt({
      outcome: responseOutcome({ content: exact }),
    }));
    expect(exactParsed.outcome.kind === "response" && exactParsed.outcome.content).toBe(exact);

    const source = await receipt();
    for (const content of [exact + "a", "", " \n\t "]) {
      expectReceiptError(() => parseBridgeProviderReceipt({
        ...source,
        outcome: responseOutcome({ content }),
      }));
    }
  });

  it("allows malformed candidate JSON because transport parsing does not validate quality", async () => {
    const source = await receipt({ outcome: responseOutcome({ content: "{not candidate json" }) });
    const parsed = parseBridgeProviderReceipt(source);
    expect(parsed.outcome.kind === "response" && parsed.outcome.content).toBe("{not candidate json");
  });

  it("preserves 256 ordered annotations with contract trimming and rejects 257 or malformed fields", async () => {
    const annotations = Array.from({ length: 256 }, (_value, index) => ({
      type: "url_citation",
      url: ` https://example.com/${index} `,
      title: ` Source ${index} `,
    }));
    const parsed = parseBridgeProviderReceipt(await receipt({
      outcome: responseOutcome({ annotations }),
    }));
    if (parsed.outcome.kind !== "response") throw new Error("expected response");
    expect(parsed.outcome.annotations).toHaveLength(256);
    expect(parsed.outcome.annotations[0]).toEqual({
      type: "url_citation",
      url: "https://example.com/0",
      title: "Source 0",
    });
    expect(parsed.outcome.annotations[255]?.url).toBe("https://example.com/255");

    expectReceiptError(() => parseBridgeProviderReceipt({
      ...(parsed as unknown as Record<string, unknown>),
      outcome: responseOutcome({ annotations: [...annotations, annotations[0]] }),
    }));
    for (const annotation of [
      { type: "url_citation", url: "", title: "Source" },
      { type: "other", url: "https://example.com", title: "Source" },
      { type: "url_citation", url: "https://example.com", title: "Source", message: "top-secret" },
    ]) expectReceiptError(() => parseBridgeProviderReceipt({
      ...(parsed as unknown as Record<string, unknown>),
      outcome: responseOutcome({ annotations: [annotation] }),
    }));
  });

  it("accepts bounded model and usage metadata without capping actual cost at USD 5", async () => {
    const maximumUsage = usage({
      promptTokens: 5_000_000,
      completionTokens: 5_000_000,
      totalTokens: 10_000_000,
      costMicros: Number.MAX_SAFE_INTEGER,
      webSearchRequests: 10,
    });
    const parsed = parseBridgeProviderReceipt(await receipt({
      outcome: responseOutcome({ actualModel: "a".repeat(128), usage: maximumUsage }),
    }));
    if (parsed.outcome.kind !== "response") throw new Error("expected response");
    expect(parsed.outcome.actualModel).toBe("a".repeat(128));
    expect(parsed.outcome.usage?.costMicros).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseBridgeProviderReceipt(await receipt({
      outcome: responseOutcome({ actualModel: null, usage: null }),
    })).outcome).toMatchObject({ actualModel: null, usage: null });
  });

  it("rejects malformed model and usage metadata", async () => {
    for (const actualModel of ["", " bad", "bad model", "-invalid", "a".repeat(129)]) {
      expectReceiptError(() => parseBridgeProviderReceipt(awaitValue({
        outcome: responseOutcome({ actualModel }),
      })));
    }
    for (const invalidUsage of [
      usage({ totalTokens: 201 }),
      usage({ webSearchRequests: 11 }),
      usage({ promptTokens: -1, totalTokens: 79 }),
      usage({ costMicros: Number.MAX_SAFE_INTEGER + 1 }),
      usage({ costMicros: Number.NaN }),
      usage({ costMicros: Number.POSITIVE_INFINITY }),
      usage({ completionTokens: 1.5, totalTokens: 121.5 }),
    ]) expectReceiptError(() => parseBridgeProviderReceipt(awaitValue({
      outcome: responseOutcome({ usage: invalidUsage }),
    })));
  });

  it.each([
    "missing-key",
    "timeout",
    "rate",
    "balance",
    "unavailable",
    "filtered",
    "invalid-transport",
  ])("round trips the safe %s Provider error classification", async (code) => {
    const source = await receipt({
      outcome: errorOutcome({ code, charged: code === "missing-key" ? false : true }),
    });
    const parsed = parseBridgeProviderReceipt(source);
    expect(decodeBridgeProviderReceipt(encodeBridgeProviderReceipt(source))).toEqual(parsed);
    expect(parsed.outcome).toMatchObject({ kind: "error", code });
  });

  it("keeps explicit unknown charge state and rejects unsafe Provider error metadata", async () => {
    const source = await receipt({
      outcome: errorOutcome({ actualModel: "provider/model-v1", usage: usage() }),
    });
    const parsed = parseBridgeProviderReceipt(source);
    expect(parsed.outcome).toMatchObject({
      charged: "unknown",
      retryable: true,
      actualModel: "provider/model-v1",
      usage: usage(),
    });
    expect(Object.isFrozen(parsed.outcome)).toBe(true);
    expect(Object.isFrozen(parsed.outcome.usage)).toBe(true);
    (source.outcome as Record<string, unknown>).actualModel = "mutated";
    ((source.outcome as Record<string, unknown>).usage as Record<string, unknown>).costMicros = 0;
    expect(parsed.outcome.actualModel).toBe("provider/model-v1");
    expect(parsed.outcome.usage?.costMicros).toBe(6_250_000);
    for (const addition of [
      { message: "top-secret" },
      { cause: "top-secret" },
      { headers: { authorization: "top-secret" } },
      { candidate: {} },
      { account: { balance: "top-secret" } },
    ]) expectReceiptError(() => parseBridgeProviderReceipt(awaitValue({
      outcome: { ...errorOutcome(), ...addition },
    })));
    for (const change of [
      { code: "other" },
      { retryable: "yes" },
      { charged: "no" },
    ]) expectReceiptError(() => parseBridgeProviderReceipt(awaitValue({
      outcome: { ...errorOutcome(), ...change },
    })));
  });

  it("does not accept candidate, quality, account, callback, or raw HTTP envelope fields", async () => {
    const source = await receipt();
    for (const addition of [
      { candidate: null },
      { quality: { passed: true } },
      { account: {} },
      { callbackUrl: "https://example.com" },
      { rawHeaders: {} },
      { messages: [] },
      { observedAt: BASE_TIME },
      { remainingMs: 1 },
    ]) expectReceiptError(() => parseBridgeProviderReceipt({ ...source, ...addition }));
    for (const addition of [{ candidate: null }, { quality: true }, { rawHeaders: {} }]) {
      expectReceiptError(() => parseBridgeProviderReceipt({
        ...source,
        outcome: { ...(source.outcome as Record<string, unknown>), ...addition },
      }));
    }
  });

  it("accepts an executor-local production time before begin and checks only safe retention bounds", async () => {
    const beforeBegin = parseBridgeProviderReceipt(await receipt({ producedAt: 0, latencyMs: 0 }));
    expect(beforeBegin.producedAt).toBeLessThan(beforeBegin.grant.beganAt);
    const maximumProducedAt = Number.MAX_SAFE_INTEGER - BRIDGE_RECEIPT_RETENTION_MS;
    expect(parseBridgeProviderReceipt(await receipt({
      producedAt: maximumProducedAt,
      latencyMs: Number.MAX_SAFE_INTEGER,
    }))).toMatchObject({ producedAt: maximumProducedAt, latencyMs: Number.MAX_SAFE_INTEGER });
    for (const producedAt of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, maximumProducedAt + 1]) {
      expectReceiptError(() => parseBridgeProviderReceipt(awaitValue({ producedAt })));
    }
    for (const latencyMs of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expectReceiptError(() => parseBridgeProviderReceipt(awaitValue({ latencyMs })));
    }
  });

  it("rejects malformed receipt bytes and the intrinsic size of a forged oversized view", async () => {
    expect(RESEARCH_PROVIDER_LIMITS.responseBytes).toBe(524_288);
    expectReceiptError(() => decodeBridgeProviderReceipt(new Uint8Array()));
    expectReceiptError(() => decodeBridgeProviderReceipt(new Uint8Array([0xff, 0xfe])));
    expectReceiptError(() => decodeBridgeProviderReceipt(encoder.encode("{")));
    expectReceiptError(() => decodeBridgeProviderReceipt(new ArrayBuffer(1) as unknown as Uint8Array));
    expectReceiptError(() => decodeBridgeProviderReceipt(null as unknown as Uint8Array));

    const oversized = padded(
      encodeBridgeProviderReceipt(await receipt()),
      BRIDGE_BODY_LIMITS.result + 1,
    );
    Object.defineProperty(oversized, "byteLength", { configurable: true, value: 1 });
    expectReceiptError(() => decodeBridgeProviderReceipt(oversized));
  });

  it("rejects oversized canonical input before projecting away hidden metadata", async () => {
    const source = await receipt();
    expectReceiptError(() => parseBridgeProviderReceipt({
      ...source,
      diagnosticBody: "x".repeat(BRIDGE_BODY_LIMITS.result),
    }));
  });

  it("canonicalizes insertion order and changes hashes for every variable identity field", async () => {
    const source = await receipt();
    const sourceGrant = source.grant as Record<string, unknown>;
    const sourceOutcome = source.outcome as Record<string, unknown>;
    const reordered = {
      outcome: {
        usage: sourceOutcome.usage,
        actualModel: sourceOutcome.actualModel,
        annotations: sourceOutcome.annotations,
        content: sourceOutcome.content,
        kind: sourceOutcome.kind,
      },
      latencyMs: source.latencyMs,
      producedAt: source.producedAt,
      grant: {
        executionExpiresAt: sourceGrant.executionExpiresAt,
        beganAt: sourceGrant.beganAt,
        requestHash: sourceGrant.requestHash,
        jobId: sourceGrant.jobId,
        protocol: sourceGrant.protocol,
      },
    };
    const originalHash = await hashBridgeProviderReceipt(source);
    expect(await hashBridgeProviderReceipt(reordered)).toBe(originalHash);

    const beganAt = sourceGrant.beganAt as number;
    const changes = [
      { grant: { ...sourceGrant, jobId: "22222222-2222-4222-8222-222222222222" } },
      { grant: { ...sourceGrant, requestHash: "f".repeat(64) } },
      { grant: { ...sourceGrant, beganAt: beganAt + 1, executionExpiresAt: beganAt + 1 + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs } },
      { content: "different" },
      { usage: usage({ promptTokens: 121, totalTokens: 201 }) },
      { latencyMs: 42_001 },
      { producedAt: BASE_TIME - 9_999 },
    ];
    for (const change of changes) {
      let changed: Record<string, unknown> = { ...source };
      if (change.grant) changed.grant = change.grant;
      else if (change.content) changed.outcome = { ...sourceOutcome, content: change.content };
      else if (change.usage) changed.outcome = { ...sourceOutcome, usage: change.usage };
      else changed = { ...changed, ...change };
      expect(await hashBridgeProviderReceipt(changed)).not.toBe(originalHash);
    }
  });

  it("matches every original grant field and rejects a second deadline for the same job", async () => {
    const source = await receipt();
    const expectedGrant = parseBridgeBeginGrant(source.grant);
    expect(matchBridgeProviderReceipt(source, expectedGrant)).toEqual(parseBridgeProviderReceipt(source));
    expectReceiptError(() => matchBridgeProviderReceipt(source, {
      ...expectedGrant,
      beganAt: expectedGrant.beganAt + 1,
      executionExpiresAt: expectedGrant.executionExpiresAt + 1,
    }), "conflict");
    expectReceiptError(() => matchBridgeProviderReceipt(source, {
      ...expectedGrant,
      requestHash: "f".repeat(64),
    }), "conflict");
    expectReceiptError(() => matchBridgeProviderReceipt(source, {
      ...expectedGrant,
      jobId: "22222222-2222-4222-8222-222222222222",
    }), "conflict");
    expectReceiptError(() => matchBridgeProviderReceipt(source, {
      ...expectedGrant,
      jobId: "bad",
    } as BridgeBeginGrant));
  });

  it("captures a deeply owned byte snapshot before awaiting SHA-256", async () => {
    const source = await receipt();
    const expected = createHash("sha256").update(encodeBridgeProviderReceipt(source)).digest("hex");
    const pending = hashBridgeProviderReceipt(source);
    source.producedAt = 1;
    source.latencyMs = 1;
    (source.grant as Record<string, unknown>).jobId = "22222222-2222-4222-8222-222222222222";
    const sourceOutcome = source.outcome as Record<string, unknown>;
    sourceOutcome.content = "mutated";
    ((sourceOutcome.annotations as Record<string, unknown>[])[0]!).title = "mutated";
    (sourceOutcome.usage as Record<string, unknown>).costMicros = 0;
    expect(await pending).toBe(expected);
  });

  it("maps cryptographic failures to a fresh safe unavailable error", async () => {
    const source = await receipt();
    const original = new Error("top-secret crypto failure");
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest").mockRejectedValueOnce(original);
    try {
      await expectReceiptRejection(() => hashBridgeProviderReceipt(source), "unavailable");
    } finally {
      digest.mockRestore();
    }
  });

  it("normalizes hostile receipt objects without invoking getters", async () => {
    const source = await receipt();
    let accesses = 0;
    Object.defineProperty(source.outcome as object, "content", {
      enumerable: true,
      get() { accesses += 1; return "top-secret"; },
    });
    expectReceiptError(() => parseBridgeProviderReceipt(source));
    expect(accesses).toBe(0);
  });
});

describe("research executor permanent receipt metadata", () => {
  it("derives the actual receipt hash and removes only private response fields", async () => {
    const source = await receipt();
    const metadata = await summarizeBridgeProviderReceipt(source);
    expect(metadata).toEqual({
      grant: source.grant,
      receiptHash: createHash("sha256").update(encodeBridgeProviderReceipt(source)).digest("hex"),
      producedAt: source.producedAt,
      latencyMs: source.latencyMs,
      outcome: {
        kind: "response",
        actualModel: "moonshotai/kimi-k2.5",
        usage: usage(),
      },
    });
    expect(metadata.outcome).not.toHaveProperty("content");
    expect(metadata.outcome).not.toHaveProperty("annotations");
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(Object.isFrozen(metadata.grant)).toBe(true);
    expect(Object.isFrozen(metadata.outcome)).toBe(true);
    expect(Object.isFrozen(metadata.outcome.usage)).toBe(true);
    expect(parseBridgeReceiptMetadata(metadata)).toEqual(metadata);
  });

  it("preserves the complete safe error outcome without private diagnostics", async () => {
    const source = await receipt({
      outcome: errorOutcome({ actualModel: "provider/model-v1", usage: usage() }),
    });
    const metadata = await summarizeBridgeProviderReceipt(source);
    expect(metadata.outcome).toEqual(source.outcome);
    expect(parseBridgeReceiptMetadata(metadata)).toEqual(metadata);
    for (const addition of [
      { message: "top-secret" },
      { cause: "top-secret" },
      { content: "top-secret" },
      { annotations: [] },
    ]) expectReceiptError(() => parseBridgeReceiptMetadata({
      ...metadata,
      outcome: { ...metadata.outcome, ...addition },
    }));
  });

  it("strictly validates metadata identity, times, nested schemas, and actual UTF-8 size", async () => {
    const metadata = await summarizeBridgeProviderReceipt(await receipt());
    for (const changed of [
      { ...metadata, extra: "top-secret" },
      { ...metadata, receiptHash: "A".repeat(64) },
      { ...metadata, receiptHash: "f".repeat(63) },
      { ...metadata, producedAt: -1 },
      { ...metadata, latencyMs: 1.5 },
      { ...metadata, grant: { ...metadata.grant, jobId: "bad" } },
      { ...metadata, outcome: { ...metadata.outcome, actualModel: " bad" } },
      { ...metadata, outcome: { ...metadata.outcome, usage: usage({ totalTokens: 201 }) } },
      { ...metadata, padding: "🙂".repeat(1_100) },
    ]) expectReceiptError(() => parseBridgeReceiptMetadata(changed));
  });

  it("snapshots the whole valid receipt before the first await", async () => {
    const source = await receipt();
    const expected = await summarizeBridgeProviderReceipt(structuredClone(source));
    const pending = summarizeBridgeProviderReceipt(source);
    source.producedAt = 1;
    (source.grant as Record<string, unknown>).requestHash = "f".repeat(64);
    const outcome = source.outcome as Record<string, unknown>;
    outcome.content = "mutated";
    (outcome.usage as Record<string, unknown>).costMicros = 0;
    expect(await pending).toEqual(expected);
  });
});

function awaitValue(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    grant: {
      protocol: BRIDGE_AUTH_PROTOCOL,
      jobId: JOB_ID,
      requestHash: "0".repeat(64),
      beganAt: BASE_TIME + 100_000,
      executionExpiresAt: BASE_TIME + 100_000 + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
    },
    producedAt: BASE_TIME - 10_000,
    latencyMs: 42_000,
    outcome: responseOutcome(),
    ...overrides,
  };
}
