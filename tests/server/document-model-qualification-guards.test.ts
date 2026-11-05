// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import normalConfig from "../../vitest.config";
import qualificationConfig from "../../vitest.materials-qualification.config";
import corpus from "../fixtures/documents/quality-corpus.json";
import { readQualificationConfiguration, runDocumentQualification, qualificationSegments } from "../../scripts/materials-qualification-runner";

import type { DocumentFetch } from "../../worker/document-executor/provider-http";
import type { QualificationCheckpoint } from "../../scripts/materials-qualification-runner";

const receiptRoute = { providerName: "Approved Provider", endpointId: "approved-endpoint" };
const endpoint = "https://provider.example.test/v1/chat/completions";
function environment() {
  const routingPolicy = { policyVersion: "2026.11.1", providerOrder: ["approved-provider"], allowFallback: false, dataPolicy: "zdr-only" };
  const config = { provider: "approved-provider", model: "approved-model", endpoint, providerPolicyId: "approved-policy", routingPolicy, priceVersion: "2026.11.1", userDailyMicroUsd: 1000000, globalDailyMicroUsd: 1000000, maxJobMicroUsd: 20000, maxInputTokens: 16000, maxOutputTokens: 4096, httpTimeoutMs: 1000 };
  const qualification = { qualified: true, endpoint, model: config.model, providerPolicyId: config.providerPolicyId, priceVersion: config.priceVersion, routingPolicy, receiptRoute, inputMicroUsdPerMillionTokens: 1000000, outputMicroUsdPerMillionTokens: 500000, inputTokenBound: "utf8-bytes-plus-4096" };
  return { ARC_DOCUMENT_QUALIFICATION_ENABLED: "true", ARC_DOCUMENT_PROVIDER_API_KEY: "offline-secret", ARC_DOCUMENT_QUALIFICATION_SETTINGS: JSON.stringify({ runId: "offline-run", config, qualification, authorization: { id: "offline-authorization", runId: "offline-run", endpoint, model: config.model, provider: config.provider, providerPolicyId: config.providerPolicyId, priceVersion: config.priceVersion, routingPolicy, receiptRoute, inputMicroUsdPerMillionTokens: 1000000, outputMicroUsdPerMillionTokens: 500000, maxRequests: 24, totalBudgetMicroUsd: 1000000, corpusSha256: "69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750", privacyEvidence: "https://provider.example.test/privacy", pricingEvidence: "https://provider.example.test/pricing", approvedAt: "2026-11-04T00:00:00.000Z", expiresAt: "2026-11-05T00:00:00.000Z" } }) };
}
const generation = (id: string, changes: Record<string, unknown> = {}) => Response.json({ data: {
  id, model: "approved-model", provider_name: receiptRoute.providerName, provider_responses: [{ status: 200, endpoint_id: receiptRoute.endpointId }],
  native_tokens_prompt: 100, native_tokens_completion: 100, total_cost: 0.0001, ...changes,
} });
function fixtureHttp(post: () => Response, read: (id: string) => Response = generation) {
  return vi.fn<DocumentFetch>(async (url, init) => init?.method === "POST" ? post() : read(new URL(String(url)).searchParams.get("id")!));
}
const reply = (id: string) => Response.json({ id, model: "approved-model", usage: { prompt_tokens: 100, completion_tokens: 100, cost: 0.0001 },
  choices: [{ message: { content: JSON.stringify({ schemaVersion: "2026.11.1", items: [], reviewPoints: [] }) } }] });
const now = () => new Date("2026-11-04T08:00:00.000Z");
afterEach(() => vi.unstubAllGlobals());
describe("model qualification offline guards", () => {
  it("requires the owner authorization to bind the exact generation model separately from the chat alias", () => {
    const env = environment();
    const settings = JSON.parse(env.ARC_DOCUMENT_QUALIFICATION_SETTINGS);
    settings.qualification.receiptRoute.generationModel = "approved-model-20261023";
    const read = () => readQualificationConfiguration({ ...env, ARC_DOCUMENT_QUALIFICATION_SETTINGS: JSON.stringify(settings) }, now());
    expect(read).toThrow("qualification-authorization-mismatch");
    settings.authorization.receiptRoute.generationModel = "approved-model-20261023";
    expect(read().qualification.receiptRoute.generationModel).toBe("approved-model-20261023");
    settings.authorization.receiptRoute.generationModel = "approved-model-20261024";
    expect(read).toThrow("qualification-authorization-mismatch");
  });
  it("rejects disabled or incomplete qualification before any network call", async () => {
    const network = vi.fn(async () => { throw new Error("network forbidden in offline tests"); }); vi.stubGlobal("fetch", network);
    for (const env of [{}, { ARC_DOCUMENT_QUALIFICATION_ENABLED: "true" }, { ...environment(), ARC_DOCUMENT_QUALIFICATION_ENABLED: "false" }]) {
      await expect(runDocumentQualification(env, { fetch: network, checkpoint: async () => {}, mode: "offline-test", now })).rejects.toThrow();
    }
    expect(network).not.toHaveBeenCalled();
  });
  it("keeps the real suite outside ordinary test discovery with retry disabled", () => {
    expect(normalConfig.test?.include).toEqual(["tests/**/*.test.{ts,tsx}"]);
    expect(qualificationConfig.test?.include).toEqual(["tests/qualification/document-model.qualification.ts"]);
    expect(qualificationConfig.test?.retry).toBe(0);
    expect(qualificationConfig.test?.fileParallelism).toBe(false);
    const suite = readFileSync(new URL("../qualification/document-model.qualification.ts", import.meta.url), "utf8");
    expect(suite).toContain("readQualificationConfiguration(process.env");
    expect(suite).toContain("DOCUMENT_LIMITS.httpTimeoutMs + DOCUMENT_METADATA_TIMEOUT_MS");
  });
  it("cannot send if the durable pre-send reservation fails", async () => {
    const network = vi.fn(async () => new Response());
    await expect(runDocumentQualification(environment(), { fetch: network, checkpoint: async value => { if (value.type === "reservation") throw new Error("disk unavailable"); }, mode: "offline-test", now })).rejects.toThrow("qualification-checkpoint-failed");
    expect(network).not.toHaveBeenCalled();
  });
  it("locks endpoint, pricing, routing, corpus and expiry to an explicit authorization", () => {
    const env = environment();
    expect(readQualificationConfiguration(env, now()).authorization.maxRequests).toBe(24);
    for (const field of ["endpoint", "model", "priceVersion", "corpusSha256", "expiresAt"] as const) {
      const settings = JSON.parse(env.ARC_DOCUMENT_QUALIFICATION_SETTINGS);
      settings.authorization[field] = field === "expiresAt" ? "2026-11-03T00:00:00.000Z" : "mismatch";
      expect(() => readQualificationConfiguration({ ...env, ARC_DOCUMENT_QUALIFICATION_SETTINGS: JSON.stringify(settings) }, now())).toThrow();
    }
  });
  it("adds only uncovered transport segments and preserves annotated source coordinates", () => {
    for (const document of corpus.documents) {
      const segments = qualificationSegments(document); let offset = 0;
      for (const segment of segments) { expect(segment.start).toBe(offset); offset = segment.end; }
      expect(offset).toBe(document.text.length);
      for (const original of document.segments) expect(segments).toContainEqual({ id: original.id, start: original.start, end: original.end });
    }
  });
  it("rejects the dedicated credential embedded in an otherwise public evidence URL or report field", () => {
    const env = environment(), settings = JSON.parse(env.ARC_DOCUMENT_QUALIFICATION_SETTINGS);
    settings.authorization.privacyEvidence = "https://provider.example.test/snapshots/" + env.ARC_DOCUMENT_PROVIDER_API_KEY;
    expect(() => readQualificationConfiguration({ ...env, ARC_DOCUMENT_QUALIFICATION_SETTINGS: JSON.stringify(settings) }, now())).toThrow("qualification-settings-invalid");
  });
  it("persists the full reservation before sending and halts with held unknown cost", async () => {
    const checkpoints: { type: string; documentId?: string; state?: string }[] = [];
    const network = vi.fn(async () => { expect(checkpoints.at(-1)).toMatchObject({ type: "reservation", documentId: corpus.documents[0]!.id, state: "reserved" }); throw new Error("PRIVATE-MATERIAL-SENTINEL-7f91"); });
    const result = await runDocumentQualification(environment(), { fetch: network, checkpoint: async value => { checkpoints.push(value); }, mode: "offline-test", now });
    expect(network).toHaveBeenCalledTimes(1);
    expect(result.documents[0]).toMatchObject({ status: "cost-unknown", accounting: "held-unknown" });
    expect(result.documents.filter(document => document.status === "not-run")).toHaveLength(23);
    expect(result.heldMicroUsd).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain("PRIVATE-MATERIAL-SENTINEL");
    expect(result.passed).toBe(false);
  });
  it("does not send when worst-case reservation cannot fit the remaining budget", async () => {
    const env = environment(); const settings = JSON.parse(env.ARC_DOCUMENT_QUALIFICATION_SETTINGS); settings.authorization.totalBudgetMicroUsd = 1;
    const network = vi.fn(async () => new Response());
    const result = await runDocumentQualification({ ...env, ARC_DOCUMENT_QUALIFICATION_SETTINGS: JSON.stringify(settings) }, { fetch: network, checkpoint: async () => {}, mode: "offline-test", now });
    expect(network).not.toHaveBeenCalled(); expect(result.stoppedReason).toBe("budget-exhausted"); expect(result.documents.every(document => document.status === "not-run")).toBe(true);
  });
  it("scores actual source-validated review points from the injected provider for all 24 fixtures", async () => {
    let index = 0;
    const network = fixtureHttp(() => { const document = corpus.documents[index++]!; return Response.json({ id: `review-receipt-${index}`, model: "approved-model", usage: { prompt_tokens: 100, completion_tokens: 100, cost: 0.0001 }, choices: [{ message: { content: JSON.stringify({ schemaVersion: "2026.11.1", items: document.goldFields.map((field, itemIndex) => ({ id: `candidate-${itemIndex}`, kind: field.kind, text: field.acceptedForms[0], requirementLevel: field.requirementLevel, skillLabels: field.skillLabels, selfLevelHint: field.selfLevelHint, source: field.source })), reviewPoints: document.expectedReviewPoints }) } }] }); });
    const result = await runDocumentQualification(environment(), { fetch: network, checkpoint: async () => {}, mode: "offline-test", now });
    expect(network).toHaveBeenCalledTimes(48); expect(result.requestsSent).toBe(24);
    expect(result.normalPrefillCount).toBe(18); expect(result.edgePassCount).toBe(6); expect(result.passed).toBe(true);
    expect(result.mode).toBe("offline-test");
  });
  it("runs the fixed 24 in order without retries and never uses gold review points as provider output", async () => {
    let index = 0;
    const network = fixtureHttp(() => { const document = corpus.documents[index++]!; return Response.json({ id: `receipt-${index}`, model: "approved-model", usage: { prompt_tokens: 100, completion_tokens: 100, cost: 0.0001 }, choices: [{ message: { content: JSON.stringify({ schemaVersion: "2026.11.1", items: document.goldFields.map((field, itemIndex) => ({ id: `candidate-${itemIndex}`, kind: field.kind, text: field.acceptedForms[0], requirementLevel: field.requirementLevel, skillLabels: field.skillLabels, selfLevelHint: field.selfLevelHint, source: field.source })) }) } }] }); });
    const result = await runDocumentQualification(environment(), { fetch: network, checkpoint: async () => {}, mode: "offline-test", now });
    expect(network).toHaveBeenCalledTimes(48); expect(result.requestsSent).toBe(24);
    expect(result.documents.map(document => document.documentId)).toEqual(corpus.documents.map(document => document.id));
    expect(result.documents[0]!.quality?.failures).toContain("missing-review-point");
    expect(result.mode).toBe("offline-test"); expect(result.passed).toBe(false);
    const serialized = JSON.stringify(result); expect(serialized).not.toContain("offline-secret");
    for (const document of corpus.documents) expect(serialized).not.toContain(document.text);
  });
  it("holds the first reservation and stops the quality run when its two raw cost reports disagree", async () => {
    const events: QualificationCheckpoint[] = [];
    const network = fixtureHttp(() => reply("charge-conflict"), id => generation(id, { total_cost: 0.0001001 }));
    const result = await runDocumentQualification(environment(), {
      fetch: network, now, mode: "offline-test", checkpoint: async event => { events.push(event); },
    });
    expect(result).toMatchObject({ stoppedReason: "cost-conflict", settledMicroUsd: 0 });
    expect(result.heldMicroUsd).toBeGreaterThan(0);
    expect(events.find(e => e.type === "settlement")).toMatchObject({ state: "held-unknown", actualMicroUsd: null,
      audit: { conflictingCostsUsd: { chat: "0.0001", generation: "0.0001001" } } });
    expect(network.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET"]);
  });
  it("settles an attributable charge even with the wrong upstream, quarantines the result and sends no next document", async () => {
    const events: QualificationCheckpoint[] = [];
    const network = fixtureHttp(() => reply("gen-1"), id => generation(id, { provider_name: "Other Provider" }));
    const result = await runDocumentQualification(environment(), { fetch: network, checkpoint: async e => { events.push(e); }, mode: "offline-test", now });
    expect(network.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET"]);
    expect(result).toMatchObject({ requestsSent: 1, settledMicroUsd: 100, heldMicroUsd: 0, stoppedReason: "route-mismatch", passed: false });
    expect(result.documents[0]).toMatchObject({ status: "failed", accounting: "settled", quality: null, reason: "route-mismatch", audit: { status: "route-mismatch" } });
    expect(events.find(e => e.type === "settlement")).toMatchObject({ state: "settled", actualMicroUsd: 100, status: "route-mismatch", audit: { metadataAttempts: 1 } });
    expect(result.documents.filter(e => e.status === "not-run")).toHaveLength(23);
  });
  it("records a repeated generation once, holds the second reservation and never queries that ID again", async () => {
    const network = fixtureHttp(() => reply("repeat-1"));
    const result = await runDocumentQualification(environment(), { fetch: network, checkpoint: async () => {}, mode: "offline-test", now });
    expect(network.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET", "POST"]);
    expect(result).toMatchObject({ requestsSent: 2, settledMicroUsd: 100, heldMicroUsd: 18_048, stoppedReason: "duplicate-receipt" });
    expect(result.documents[1]).toMatchObject({ accounting: "held-unknown", quality: null, actualMicroUsd: null, audit: { status: "duplicate-receipt", metadataAttempts: 0 } });
  });
  it("blocks the next POST until the previous metadata and durable settlement finished; includes per-document processing times", async () => {
    const events: QualificationCheckpoint[] = []; let index = 0;
    let verified!: () => void; const hold = new Promise<void>(resolve => { verified = resolve; });
    let started!: () => void; const reading = new Promise<void>(resolve => { started = resolve; });
    const network = vi.fn<DocumentFetch>(async (url, init) => {
      if (init?.method === "POST") {
        if (index === 1) expect(events.filter(e => e.type === "settlement")).toHaveLength(1);
        return reply("gen-" + ++index);
      }
      if (index === 1) { started(); await hold; }
      return generation(new URL(String(url)).searchParams.get("id")!);
    });
    const pending = runDocumentQualification(environment(), { fetch: network, checkpoint: async e => { events.push(e); }, mode: "offline-test", now });
    await reading; expect(index).toBe(1); verified();
    const result = await pending;
    expect(result.requestsSent).toBe(24);
    expect(result.documents.every(e => e.processingStartedAt === now().toISOString() && e.processingEndedAt === now().toISOString()
      && e.audit?.checkedAt === now().toISOString() && e.queueDurationMs === null)).toBe(true);
    expect(events.filter(e => e.type === "settlement" && e.audit?.status === "verified")).toHaveLength(24);
  });
  it("checks authorization again after the durable write and before the POST", async () => {
    let expired = false; const network = fixtureHttp(() => reply("gen-1"));
    const result = await runDocumentQualification(environment(), { fetch: network,
      checkpoint: async e => { if (e.type === "reservation") expired = true; }, mode: "offline-test",
      now: () => expired ? new Date("2026-11-06T00:00:00Z") : now() });
    expect(network).not.toHaveBeenCalled(); expect(result).toMatchObject({ requestsSent: 0, stoppedReason: "authorization-expired", heldMicroUsd: 0 });
  });
  it.each(["2026-11-03T23:00:00Z", "2026-11-04T07:59:59Z"])("latches a local clock rollback before sending (%s)", async rewound => {
    let clock = now();
    const network = fixtureHttp(() => reply("gen-1"));
    const result = await runDocumentQualification(environment(), { fetch: network, mode: "offline-test", now: () => clock,
      checkpoint: async e => { if (e.type === "reservation") clock = new Date(rewound); } });
    expect(network.mock.calls.length).toBe(0);
    expect(result).toMatchObject({ requestsSent: 0, stoppedReason: "authorization-clock-rollback", heldMicroUsd: 0 });
  });
  it("validates the window at the transport handoff when expiry occurs between admission and send", async () => {
    let readsSinceReservation: number | null = null;
    const network = fixtureHttp(() => reply("gen-1"));
    const result = await runDocumentQualification(environment(), { fetch: network, mode: "offline-test",
      checkpoint: async e => { if (e.type === "reservation") readsSinceReservation = 0; },
      now: () => readsSinceReservation !== null && ++readsSinceReservation >= 2 ? new Date("2026-11-05T00:00:00Z") : now() });
    expect(network.mock.calls.length).toBe(0);
    expect(result).toMatchObject({ heldMicroUsd: 0, requestsSent: 0, stoppedReason: "authorization-expired" });
  });
  it("journals the exact completion ID and observed cost before reading metadata, then halts on an unwritable settlement", async () => {
    const events: QualificationCheckpoint[] = []; const methods: string[] = [];
    const fetch: DocumentFetch = async (url, init) => {
      methods.push(init!.method!);
      if (init?.method === "POST") return reply("durable-1");
      expect(events.at(-1)).toMatchObject({ type: "receipt", receiptId: "durable-1", actualMicroUsd: 100, inputTokens: 100, outputTokens: 100 });
      return generation(new URL(String(url)).searchParams.get("id")!);
    };
    await expect(runDocumentQualification(environment(), { fetch, checkpoint: async e => {
      if (e.type === "settlement") throw new Error("disk unavailable");
      events.push(e);
    }, mode: "offline-test", now })).rejects.toThrow("qualification-checkpoint-failed");
    expect(methods).toEqual(["POST", "GET"]);
    expect(events.at(-1)?.type).toBe("receipt");
  });
  it("settles a charge over the worst-case reservation, preserving both readings without scoring the candidate", async () => {
    const network = fixtureHttp(() => Response.json({ id: "over", model: "approved-model", usage: { prompt_tokens: 100, completion_tokens: 100, cost: 0.02 } }),
      id => generation(id, { total_cost: 0.02 }));
    const result = await runDocumentQualification(environment(), { fetch: network, checkpoint: async () => {}, mode: "offline-test", now });
    expect(result).toMatchObject({ requestsSent: 1, stoppedReason: "price-bound-exceeded", settledMicroUsd: 20_000, heldMicroUsd: 0 });
    expect(result.documents[0]).toMatchObject({ accounting: "settled", quality: null, audit: { metadataMicroUsd: 20_000 } });
  });
});
