// @vitest-environment node

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  BRIDGE_EXECUTOR_MODE,
  BRIDGE_QUEUE_TTL_MS,
  BridgeJobError,
  decodeBridgeJob,
  encodeBridgeJob,
  hashBridgeJob,
  parseBridgeJob,
  type BridgeJob,
} from "../../app/server/research/executor/job";
import { BRIDGE_AUTH_PROTOCOL } from "../../app/server/research/executor/auth";
import { BRIDGE_BODY_LIMITS } from "../../app/server/research/executor/body";
import { KIMI_RESEARCH_EXECUTION_POLICY } from "../../app/server/research/execution-policy";
import { canonicalJson } from "../../app/lib/planning/fingerprint";

const encoder = new TextEncoder();

function job(): BridgeJob {
  return {
    protocol: BRIDGE_AUTH_PROTOCOL,
    executor: BRIDGE_EXECUTOR_MODE,
    jobId: "11111111-1111-4111-8111-111111111111",
    runId: "research-run-1",
    requestId: "request-1",
    inputFingerprint: "p2-" + "1".repeat(32),
    configFingerprint: "p2-" + "2".repeat(32),
    policyId: KIMI_RESEARCH_EXECUTION_POLICY.profileId,
    role: "  Ｆrontend   Engineer  ",
    locale: "en-US",
    createdAt: 1_800_000_000_000,
    queueExpiresAt: 1_800_000_120_000,
  };
}

function expectInvalid(work: () => unknown) {
  let thrown: unknown;
  try { work(); } catch (error) { thrown = error; }
  expect(thrown).toBeInstanceOf(BridgeJobError);
  expect(thrown).toMatchObject({
    code: "invalid-message",
    name: "BridgeJobError",
    message: "Research bridge job failure: invalid-message",
  });
  expect(String((thrown as Error).message)).not.toContain("top-secret");
}

describe("research executor durable job identity", () => {
  it("parses the fixed protocol job and normalizes the provider role", () => {
    const source = { ...job() };
    const parsed = parseBridgeJob(source);

    expect(parsed).toEqual({ ...source, role: "Frontend Engineer" });
    expect(Object.isFrozen(parsed)).toBe(true);
    source.role = "changed";
    expect(parsed.role).toBe("Frontend Engineer");
  });

  it("round trips the immutable canonical snapshot through bytes", () => {
    const parsed = parseBridgeJob(job());
    const bytes = encodeBridgeJob(parsed);
    expect(decodeBridgeJob(bytes)).toEqual(parsed);
    expect(bytes.byteLength).toBeLessThanOrEqual(BRIDGE_BODY_LIMITS.request);
  });

  it("hashes the canonical bytes with SHA-256 including runtime identity fields", async () => {
    const parsed = parseBridgeJob(job());
    const actual = await hashBridgeJob(parsed);
    const expected = createHash("sha256").update(canonicalJson(parsed), "utf8").digest("hex");
    expect(actual).toBe(expected);

    expect(await hashBridgeJob({ ...parsed, requestId: "request-2" })).not.toBe(actual);
    expect(await hashBridgeJob({ ...parsed, createdAt: parsed.createdAt + 1, queueExpiresAt: parsed.queueExpiresAt + 1 })).not.toBe(actual);
  });

  it.each([
    ["jobId", { jobId: "22222222-2222-4222-8222-222222222222" }],
    ["runId", { runId: "research-run-2" }],
    ["requestId", { requestId: "request-2" }],
    ["inputFingerprint", { inputFingerprint: "p2-" + "3".repeat(32) }],
    ["configFingerprint", { configFingerprint: "p2-" + "4".repeat(32) }],
    ["role", { role: "Backend Engineer" }],
    ["locale", { locale: "zh-CN" }],
    ["time pair", { createdAt: 1_800_000_000_001, queueExpiresAt: 1_800_000_120_001 }],
  ])("changes the %s identity field and therefore the hash", async (_field, change) => {
    const base = await hashBridgeJob(job());
    expect(await hashBridgeJob({ ...job(), ...change })).not.toBe(base);
  });

  it("sorts keys while preserving normalized role case in the identity", async () => {
    const source = { ...job() };
    const reordered = Object.fromEntries(Object.entries(source).reverse());
    expect(await hashBridgeJob(source)).toBe(await hashBridgeJob(reordered));
    expect(await hashBridgeJob(source)).toBe(await hashBridgeJob({ ...source, role: "Frontend Engineer" }));
    expect(await hashBridgeJob({ ...source, role: "frontend engineer" })).not.toBe(await hashBridgeJob(source));
  });

  it("rejects metadata that is outside the durable job contract", () => {
    for (const key of ["owner", "session", "key", "callback", "quality"]) {
      expectInvalid(() => parseBridgeJob({ ...job(), [key]: "top-secret" }));
    }
  });

  it("rejects fixed policy and protocol changes", () => {
    for (const change of [
      { protocol: "other" },
      { executor: "other" },
      { policyId: "other" },
    ]) expectInvalid(() => parseBridgeJob({ ...job(), ...change }));
  });

  it("rejects accessor, symbol, custom prototype, and cyclic inputs without invoking getters", () => {
    let accesses = 0;
    const withGetter = { ...job() } as Record<string, unknown>;
    delete withGetter.role;
    Object.defineProperty(withGetter, "role", {
      enumerable: true,
      configurable: true,
      get() { accesses += 1; return "top-secret"; },
    });
    expectInvalid(() => parseBridgeJob(withGetter));
    expect(accesses).toBe(0);

    const withSymbol = { ...job(), [Symbol("extra")]: "top-secret" };
    expectInvalid(() => parseBridgeJob(withSymbol));
    expectInvalid(() => parseBridgeJob(Object.assign(Object.create({ inherited: true }), job())));
    const cyclic = { ...job() } as Record<string, unknown>;
    cyclic.cycle = cyclic;
    expectInvalid(() => parseBridgeJob(cyclic));
  });

  it("rejects malformed scalar bounds and queue windows", () => {
    const maxCreatedAt = Number.MAX_SAFE_INTEGER - BRIDGE_QUEUE_TTL_MS - KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs;
    for (const change of [
      { createdAt: 1.5, queueExpiresAt: 1.5 + BRIDGE_QUEUE_TTL_MS },
      { createdAt: Number.NaN, queueExpiresAt: Number.NaN },
      { createdAt: Number.POSITIVE_INFINITY, queueExpiresAt: Number.POSITIVE_INFINITY },
      { createdAt: -1, queueExpiresAt: -1 + BRIDGE_QUEUE_TTL_MS },
      { createdAt: maxCreatedAt + 1, queueExpiresAt: maxCreatedAt + 1 + BRIDGE_QUEUE_TTL_MS },
      { createdAt: Number.MAX_SAFE_INTEGER + 1, queueExpiresAt: Number.MAX_SAFE_INTEGER + 1 + BRIDGE_QUEUE_TTL_MS },
      { jobId: "not-a-uuid" },
      { inputFingerprint: "p2-" + "g".repeat(32) },
      { inputFingerprint: "p2-short" },
      { locale: "fr-FR" },
      { queueExpiresAt: job().queueExpiresAt + 1 },
      { queueExpiresAt: job().createdAt + BRIDGE_QUEUE_TTL_MS + 1 },
    ]) expectInvalid(() => parseBridgeJob({ ...job(), ...change }));
  });

  it("rejects malformed JSON bytes, empty bytes, and bytes over the request limit", () => {
    expectInvalid(() => decodeBridgeJob(new Uint8Array()));
    expectInvalid(() => decodeBridgeJob(new Uint8Array([0xff, 0xfe])));
    expectInvalid(() => decodeBridgeJob(encoder.encode("{")));
    expectInvalid(() => decodeBridgeJob(new Uint8Array(BRIDGE_BODY_LIMITS.request + 1)));
  });

  it("supports multibyte roles and the timestamp upper boundary", () => {
    const multibyte = { ...job(), role: "全端工程师" };
    expect(parseBridgeJob(multibyte).role).toBe("全端工程师");
    const maxCreatedAt = Number.MAX_SAFE_INTEGER - BRIDGE_QUEUE_TTL_MS - KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs;
    const bounded = { ...job(), createdAt: maxCreatedAt, queueExpiresAt: maxCreatedAt + BRIDGE_QUEUE_TTL_MS };
    expect(parseBridgeJob(bounded).createdAt).toBe(maxCreatedAt);
  });

  it("captures bytes before an input mutation after hashing begins", async () => {
    const source = { ...job() };
    const expected = await hashBridgeJob(source);
    const pending = hashBridgeJob(source);
    source.requestId = "mutated";
    expect(await pending).toBe(expected);
  });

  it("maps Web Crypto failure to an unavailable bridge error", async () => {
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest").mockRejectedValueOnce(new Error("top-secret"));
    try {
      const error = await hashBridgeJob(job()).catch((value: unknown) => value);
      expect(error).toBeInstanceOf(BridgeJobError);
      expect(error).toMatchObject({ code: "unavailable", message: "Research bridge job failure: unavailable" });
    } finally {
      digest.mockRestore();
    }
  });
});
