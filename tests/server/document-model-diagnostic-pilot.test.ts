// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, matchesGlob } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as runner from "../../scripts/materials-qualification-runner";
import { createQualificationJournal } from "../../scripts/materials-qualification-journal";
import review from "../../docs/verification/materials-gate-1b-b1/b2-settings.canonical-model.review.json";
import corpus from "../fixtures/documents/quality-corpus.json";
import { fixtureGenerationResponse } from "../helpers/document-generation-response";
import type { DocumentFetch } from "../../worker/document-executor/provider-http";
import normalConfig from "../../vitest.config";
import fullConfig from "../../vitest.materials-qualification.config";
import pilotConfig from "../../vitest.materials-diagnostic-pilot.config";

const ids = ["resume-01", "resume-08", "jd-01", "jd-11"];
const time = new Date("2026-11-01T08:30:00Z");
const now = () => time;
const window = { approvedAt: "2026-11-01T08:00:00Z", expiresAt: "2026-11-01T10:00:00Z" };
const credential = "offline-pilot-fixture-credential";
const runId = "materials-b2-diagnostic-pilot-fixture";
const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const hash = sha("offline-fixture-evidence");
const checkpoint = async () => {};
const mode = "offline-test" as const;

async function issueFixture() {
  const scope = await runner.inspectDiagnosticPilotScope();
  return { runId, authorization: { id: "fixture-owner-approval", runId, mode, candidateCommit: "1".repeat(40),
    sourceBundleSha256: hash, preflightSha256: hash, credentialSha256: sha(credential), ...window,
    totalBudgetMicroUsd: 300_000, scope } };
}
function environment(issued: unknown) {
  const raw = JSON.stringify(issued);
  return { ARC_DOCUMENT_PILOT_ENABLED: "true", ARC_DOCUMENT_PILOT_SETTINGS: raw,
    ARC_DOCUMENT_PILOT_ISSUANCE_SHA256: sha(raw), ARC_DOCUMENT_PILOT_PROVIDER_API_KEY: credential };
}
function legacyEnvironment() {
  const legacyId = "materials-b2-kimi-timing-r2";
  const raw = JSON.stringify({ ...review, runId: legacyId, qualification: { ...review.qualification, qualified: true },
    authorization: { ...review.authorization, ...window, runId: legacyId, id: "fixture-legacy-approval" } });
  return { ARC_DOCUMENT_QUALIFICATION_ENABLED: "true", ARC_DOCUMENT_QUALIFICATION_SETTINGS: raw, ARC_DOCUMENT_PROVIDER_API_KEY: credential };
}

function chat(id: string, content: unknown) {
  return Response.json({ id, model: review.config.model, usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.000007 },
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }] });
}
const empty = { format: "source-spans-v1", items: [], reviewPoints: [] };
beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => { throw new Error("network forbidden in offline pilot tests"); })));
afterEach(() => vi.unstubAllGlobals());

describe("separately authorized four-document diagnostic pilot", () => {
  it("is disabled by default, including when only the full qualification gate has been enabled", async () => {
    const http = vi.fn<DocumentFetch>();
    for (const env of [{}, legacyEnvironment(), { ARC_DOCUMENT_PILOT_ENABLED: "true" }]) {
      await expect(runner.runDocumentDiagnosticPilot(env, { fetch: http, checkpoint, mode, now })).rejects.toThrow();
    }
    expect(http).not.toHaveBeenCalled();
  });

  it("keeps both live files outside ordinary discovery with only the four-case entry in its one-worker config", () => {
    const entry = "tests/qualification/document-model.diagnostic-pilot.ts";
    expect(pilotConfig.test).toMatchObject({ include: [entry], fileParallelism: false, maxWorkers: 1, retry: 0 });
    expect(fullConfig.test?.include).toEqual(["tests/qualification/document-model.qualification.ts"]);
    for (const file of [entry, fullConfig.test!.include![0]!]) {
      expect(normalConfig.test!.include!.some(pattern => matchesGlob(file, pattern))).toBe(false);
    }
    const suite = readFileSync(new URL("../../" + entry, import.meta.url), "utf8");
    expect(suite).toContain('runDocumentDiagnosticPilot(process.env, { mode: "authorized-live" })');
    expect(suite).not.toContain("createQualificationJournal");
    expect(suite).not.toContain("runDocumentQualification(");
  });

  it("builds the review commitments using only local fixture bodies and no credential", async () => {
    const forbidden = vi.fn(() => { throw new Error("global network forbidden"); });
    vi.stubGlobal("fetch", forbidden);
    try {
      const scope = await runner.inspectDiagnosticPilotScope();
      expect(scope).toMatchObject({ purpose: "materials-b2-diagnostic-pilot-v1", maxRequests: 4, maxPostsPerDocument: 1,
        maxGetsPerDocument: 3, reservationMicroUsd: 72_960, maxTotalBudgetMicroUsd: 300_000,
        corpusSha256: "69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750",
        configurationSha256: expect.stringMatching(/^[a-f0-9]{64}$/u) });
      expect(scope.documents.map(doc => doc.documentId)).toEqual(ids);
      for (const [index, doc] of scope.documents.entries()) {
        const fixture = corpus.documents.find(value => value.id === ids[index])!;
        expect(doc).toEqual({ documentId: fixture.id, documentVersionId: fixture.documentVersionId, textVersionId: fixture.textVersionId,
          sourceSha256: sha(fixture.text), bodySha256: expect.stringMatching(/^[a-f0-9]{64}$/u) });
      }
      expect(new Set(scope.documents.map(doc => doc.bodySha256)).size).toBe(4);
      expect(await runner.inspectDiagnosticPilotScope()).toEqual(scope);
      expect(forbidden).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it("requires independently pinned issue bytes, the dedicated key, a new run identity and the same execution mode", async () => {
    const issued = await issueFixture(), env = environment(issued);
    const network = vi.fn<DocumentFetch>(), record = vi.fn(checkpoint);
    const dependencies = { fetch: network, checkpoint: record, mode, now };
    for (const altered of [
      { ...env, ARC_DOCUMENT_PILOT_ENABLED: "false" }, { ...env, ARC_DOCUMENT_PILOT_SETTINGS: env.ARC_DOCUMENT_PILOT_SETTINGS + " " },
      { ...env, ARC_DOCUMENT_PILOT_ISSUANCE_SHA256: undefined }, { ...env, ARC_DOCUMENT_PILOT_PROVIDER_API_KEY: undefined },
      { ...env, ARC_DOCUMENT_PILOT_PROVIDER_API_KEY: "different-fixture-key" }, { ...env, ...legacyEnvironment() },
      { ...environment({ ...issued, authorization: { ...issued.authorization, credentialSha256: sha("other-synthetic-credential") } }),
        ARC_DOCUMENT_PILOT_PROVIDER_API_KEY: "other-synthetic-credential" },
      environment({ ...issued, runId: "materials-b2-kimi-timing-r2", authorization: { ...issued.authorization, runId: "materials-b2-kimi-timing-r2" } }),
      environment({ ...issued, authorization: { ...issued.authorization, runId: runId + "-other" } }),
      environment({ ...issued, authorization: { ...issued.authorization, mode: "authorized-live" } }),
      environment({ ...issued, authorization: { ...issued.authorization, candidateCommit: "" } }),
      environment({ ...issued, authorization: { ...issued.authorization, preflightSha256: undefined } }),
    ]) {
      await expect(runner.runDocumentDiagnosticPilot(altered, dependencies)).rejects.toThrow();
    }
    await expect(runner.runDocumentDiagnosticPilot(env, { ...dependencies, mode: "authorized-live" })).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("refuses full/pilot grants in the other entry, even after copying them into the other entry's settings", async () => {
    const pilot = environment(await issueFixture()), full = legacyEnvironment();
    const http = vi.fn<DocumentFetch>(), dependencies = { fetch: http, checkpoint, now, mode };
    expect(runner.readQualificationConfiguration(full, now()).authorization.maxRequests).toBe(24);
    for (const env of [pilot, { ...full, ...pilot }, { ...full, ARC_DOCUMENT_QUALIFICATION_SETTINGS: pilot.ARC_DOCUMENT_PILOT_SETTINGS }]) {
      await expect(runner.runDocumentQualification(env, dependencies)).rejects.toThrow();
    }
    await expect(runner.runDocumentDiagnosticPilot(environment(JSON.parse(full.ARC_DOCUMENT_QUALIFICATION_SETTINGS)), dependencies)).rejects.toThrow();
    expect(http).not.toHaveBeenCalled();
  });

  it("refuses an approval identifier that could disclose the credential or its private fingerprint in a result", async () => {
    const issued = await issueFixture();
    const network = vi.fn<DocumentFetch>(), record = vi.fn(checkpoint);
    for (const id of [credential, sha(credential)]) {
      const env = environment({ ...issued, authorization: { ...issued.authorization, id } });
      // JSON escaping must not let the decoded value flow into authorizationId.
      env.ARC_DOCUMENT_PILOT_SETTINGS = env.ARC_DOCUMENT_PILOT_SETTINGS.replace('"id":"' + id, '"id":"\\u' + id.charCodeAt(0).toString(16).padStart(4, "0") + id.slice(1));
      env.ARC_DOCUMENT_PILOT_ISSUANCE_SHA256 = sha(env.ARC_DOCUMENT_PILOT_SETTINGS);
      await expect(runner.runDocumentDiagnosticPilot(env, { fetch: network, checkpoint: record, mode, now })).rejects.toThrow();
    }
    expect(network).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("rejects the private materials-b2 key binding in either published identifier, independent of hex case", async () => {
    const issued = await issueFixture(), fingerprint = sha(credential), binding = sha("materials-b2\0" + fingerprint);
    const network = vi.fn<DocumentFetch>(), record = vi.fn(checkpoint);
    for (const value of [binding, binding.toUpperCase(), fingerprint, fingerprint.toUpperCase()]) {
      for (const changed of [
        { ...issued, authorization: { ...issued.authorization, id: "approval-" + value } },
        { runId: runId + "-" + value, authorization: { ...issued.authorization, runId: runId + "-" + value } },
      ]) {
        await expect(runner.runDocumentDiagnosticPilot(environment(changed), { fetch: network, checkpoint: record, mode, now })).rejects.toThrow();
      }
    }
    expect(network).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("rejects every scope substitution before reserving or forwarding even the first body", async () => {
    const issued = await issueFixture(), { scope } = issued.authorization;
    const docs = scope.documents;
    const network = vi.fn<DocumentFetch>(), record = vi.fn(checkpoint);
    const variants = [
      { purpose: "b2-full" }, { maxRequests: 24 }, { maxPostsPerDocument: 2 }, { maxGetsPerDocument: 4 },
      { maxTotalBudgetMicroUsd: undefined }, { maxTotalBudgetMicroUsd: 300_001 }, { reservationMicroUsd: 72_959 },
      { configurationSha256: hash }, { corpusSha256: hash }, { documents: docs.slice(0, 3) },
      { documents: [...docs].reverse() }, { documents: [...docs.slice(0, 3), docs[0]] },
      { documents: [...docs.slice(0, 3), { ...docs[3], documentId: "jd-12" }] },
      ...["bodySha256", "sourceSha256", "textVersionId", "documentVersionId"].map(field => ({
        documents: [...docs.slice(0, 3), { ...docs[3], [field]: field.endsWith("Sha256") ? hash : "replacement" }],
      })),
    ];
    for (const changed of variants) {
      const env = environment({ ...issued, authorization: { ...issued.authorization, scope: { ...scope, ...changed } } });
      await expect(runner.runDocumentDiagnosticPilot(env, { fetch: network, checkpoint: record, now, mode })).rejects.toThrow();
    }
    for (const totalBudgetMicroUsd of [undefined, 0, -1, 299_999.5, 300_001]) {
      const env = environment({ ...issued, authorization: { ...issued.authorization, totalBudgetMicroUsd } });
      await expect(runner.runDocumentDiagnosticPilot(env, { fetch: network, checkpoint: record, now, mode })).rejects.toThrow();
    }
    expect(network).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("admits exactly the four prospectively hashed POST bodies and scores each verified receipt even when quality fails", async () => {
    const issued = await issueFixture();
    const events: runner.QualificationCheckpoint[] = [];
    const bodies: string[] = [];
    const http = vi.fn<DocumentFetch>(async (url, init) => {
      if (init?.method === "GET") {
        const id = new URL(String(url)).searchParams.get("id")!;
        return fixtureGenerationResponse(id, review.config.model, review.qualification.receiptRoute);
      }
      const index = bodies.length;
      expect(init?.method).toBe("POST");
      expect(String(url)).toBe(review.config.endpoint);
      expect(events.at(-1)).toMatchObject({ type: "reservation", documentId: ids[index], reservedMicroUsd: 72_960 });
      expect(events.filter(e => e.type === "settlement")).toHaveLength(index);
      bodies.push(String(init?.body));
      return chat("gen-fixture-" + index, empty);
    });
    const result = await runner.runDocumentDiagnosticPilot(environment(issued), {
      fetch: http, checkpoint: async event => { events.push(event); }, now, mode,
    });
    expect(bodies.map(sha)).toEqual(issued.authorization.scope.documents.map(doc => doc.bodySha256));
    for (const [index, body] of bodies.entries()) {
      const doc = corpus.documents.find(fixture => fixture.id === ids[index])!;
      const wire = JSON.parse(body);
      expect(wire).toMatchObject({ model: review.config.model, max_tokens: 4096, stream: false,
        provider: { only: ["moonshotai/mxfp4"], order: ["moonshotai/mxfp4"], allow_fallbacks: false,
          zdr: true, data_collection: "deny", max_price: { prompt: 2, completion: 10, request: 0 } } });
      expect(wire.messages).toHaveLength(2);
      expect(wire.messages[0].content).toContain("source-spans-v1");
      expect(JSON.parse(wire.messages[1].content)).toEqual({ kind: doc.kind, segments: runner.qualificationSegments(doc).map(s =>
        ({ segmentId: s.id, text: doc.text.slice(s.start, s.end) })) });
    }
    expect(http.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET", "POST", "GET", "POST", "GET", "POST", "GET"]);
    expect(result).toMatchObject({ purpose: "materials-b2-diagnostic-pilot-v1", mode, passed: false, pilotCompleted: true,
      pilotQualityPassed: false, stoppedReason: null, requestsSent: 4, maxRequests: 4, settledMicroUsd: 28, heldMicroUsd: 0 });
    expect(result.documents.map(doc => doc.documentId)).toEqual(ids);
    expect(result.documents.every(doc => doc.audit?.status === "verified" && doc.quality?.passed === false)).toBe(true);
    expect(events).toHaveLength(14);
    expect(events.at(-1)).toMatchObject({ type: "run-end", status: "pilot-completed" });
    const serialized = JSON.stringify([result, events]);
    for (const value of [credential, sha(credential), ...corpus.documents.map(doc => doc.text)]) expect(serialized).not.toContain(value);
  });

  it("reports even four fully correct verified pilot fixtures separately from full B2", async () => {
    const issued = await issueFixture();
    let index = 0;
    const http = vi.fn<DocumentFetch>(async (url, init) => {
      if (init?.method === "GET") return fixtureGenerationResponse(new URL(String(url)).searchParams.get("id")!, review.config.model, review.qualification.receiptRoute);
      const id = ids[index++];
      const doc = corpus.documents.find(value => value.id === id)!;
      return chat("gen-oracle-" + index, { format: "source-spans-v1",
        items: doc.goldFields.map(({ kind, requirementLevel, skillLabels, selfLevelHint, source }) =>
          ({ kind, requirementLevel, skillLabels, selfLevelHint, source })), reviewPoints: doc.expectedReviewPoints });
    });
    const result = await runner.runDocumentDiagnosticPilot(environment(issued), { fetch: http, checkpoint, mode, now });
    expect(result).toMatchObject({ requestsSent: 4, passed: false, pilotCompleted: true, pilotQualityPassed: true,
      normalPrefillCount: 3, edgePassCount: 1, settledMicroUsd: 28, heldMicroUsd: 0 });
    expect(result.documents.every(doc => doc.quality?.passed === true)).toBe(true);
  });

  it("requires an open window of at most two hours and rechecks expiry after reservation at handoff", async () => {
    const issued = await issueFixture(), http = vi.fn<DocumentFetch>(), record = vi.fn(checkpoint);
    for (const changed of [
      { approvedAt: "2026-11-01T08:30:01Z" }, { expiresAt: time.toISOString() }, { expiresAt: "2026-11-01T10:00:01Z" },
    ]) {
      const env = environment({ ...issued, authorization: { ...issued.authorization, ...changed } });
      await expect(runner.runDocumentDiagnosticPilot(env, { fetch: http, checkpoint: record, mode, now })).rejects.toThrow();
    }
    expect(record).not.toHaveBeenCalled();
    let expired = false;
    const result = await runner.runDocumentDiagnosticPilot(environment(issued), {
      fetch: http, mode, now: () => expired ? new Date(window.expiresAt) : now(),
      checkpoint: async event => { if (event.type === "reservation") expired = true; },
    });
    expect(result).toMatchObject({ requestsSent: 0, heldMicroUsd: 0, settledMicroUsd: 0, stoppedReason: "authorization-expired", pilotCompleted: false });
    expect(result.documents[0]).toMatchObject({ accounting: "released", quality: null });
    expect(http).not.toHaveBeenCalled();
  });

  it("rechecks actual outgoing bytes at handoff if a fixture changes after all four commitments passed", async () => {
    const issued = await issueFixture(), http = vi.fn<DocumentFetch>();
    const doc = corpus.documents.find(fixture => fixture.id === ids[0])!, original = doc.text;
    try {
      const result = await runner.runDocumentDiagnosticPilot(environment(issued), { fetch: http, mode, now,
        checkpoint: async event => { if (event.type === "run-start") doc.text = "X" + original.slice(1); } });
      expect(result).toMatchObject({ requestsSent: 0, heldMicroUsd: 0, settledMicroUsd: 0, stoppedReason: "pilot-body-scope-mismatch" });
      expect(result.documents[0]).toMatchObject({ accounting: "released", status: "failed" });
      expect(http).not.toHaveBeenCalled();
    } finally { doc.text = original; }
  });

  it("checks remaining budget before each reservation and holds an unresolved POST without another send", async () => {
    const issued = await issueFixture(), events: runner.QualificationCheckpoint[] = [];
    const http = vi.fn<DocumentFetch>(async () => { throw new Error("fixture lost connection"); });
    const deps = { fetch: http, checkpoint: async (value: runner.QualificationCheckpoint) => { events.push(value); }, mode, now };
    const tooLittle = environment({ ...issued, authorization: { ...issued.authorization, totalBudgetMicroUsd: 72_959 } });
    expect(await runner.runDocumentDiagnosticPilot(tooLittle, deps)).toMatchObject({ requestsSent: 0, heldMicroUsd: 0, stoppedReason: "budget-exhausted" });
    expect(http).not.toHaveBeenCalled();
    expect(events.some(e => e.type === "reservation")).toBe(false);
    events.length = 0;
    const result = await runner.runDocumentDiagnosticPilot(environment(issued), deps);
    expect(result).toMatchObject({ requestsSent: 1, heldMicroUsd: 72_960, settledMicroUsd: 0, pilotCompleted: false, passed: false });
    expect(result.documents[0]).toMatchObject({ accounting: "held-unknown", status: "cost-unknown", reservedMicroUsd: 72_960 });
    expect(result.documents.slice(1).every(doc => doc.status === "not-run")).toBe(true);
    expect(events.map(event => event.type)).toEqual(["run-start", "reservation", "settlement", "run-end"]);
    expect(http).toHaveBeenCalledTimes(1);
  });

  it("requires a durable reservation and unique receipt, and never sends a fifth case or re-reads a claimed receipt", async () => {
    const issued = await issueFixture();
    const http = vi.fn<DocumentFetch>(async (url, init) => init?.method === "POST" ? chat("gen-repeat", empty) :
      fixtureGenerationResponse(new URL(String(url)).searchParams.get("id")!, review.config.model, review.qualification.receiptRoute));
    await expect(runner.runDocumentDiagnosticPilot(environment(issued), {
      fetch: http, mode, now, checkpoint: async event => { if (event.type === "reservation") throw new Error("disk"); },
    })).rejects.toThrow("qualification-checkpoint-failed");
    expect(http).not.toHaveBeenCalled();
    const result = await runner.runDocumentDiagnosticPilot(environment(issued), { fetch: http, mode, now, checkpoint });
    expect(result).toMatchObject({ requestsSent: 2, settledMicroUsd: 7, heldMicroUsd: 72_960, stoppedReason: "duplicate-receipt", pilotCompleted: false });
    expect(http.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET", "POST"]);
  });

  it("preserves an unknown charge in the exclusive pilot journal and refuses to reopen its used run directory", async () => {
    const issued = await issueFixture();
    const parent = realpathSync(tmpdir()), base = mkdtempSync(join(parent, "arc-materials-pilot-test-"));
    const http = vi.fn<DocumentFetch>(async () => { throw new Error("offline transport"); });
    try {
      const journal = createQualificationJournal(base, runId);
      const result = await runner.runDocumentDiagnosticPilot(environment(issued), { fetch: http, checkpoint: journal.checkpoint, now, mode });
      journal.finish(result);
      const ledger = readFileSync(join(journal.directory, "ledger.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
      expect(ledger.map(event => event.type)).toEqual(["run-start", "reservation", "settlement", "run-end"]);
      expect(ledger[2]).toMatchObject({ state: "held-unknown", runId, documentId: "resume-01", reservedMicroUsd: 72_960 });
      expect(JSON.parse(readFileSync(join(journal.directory, "result.json"), "utf8"))).toEqual(result);
      expect(() => createQualificationJournal(base, runId)).toThrow("qualification-run-already-exists");
      expect(http).toHaveBeenCalledTimes(1);
    } finally {
      if (dirname(realpathSync(base)) !== parent) throw new Error("unexpected-temporary-directory");
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("uses at most three receipt queries per document and continues only after complete verified accounting", async () => {
    const issued = await issueFixture();
    let count = 0;
    let started!: () => void;
    const firstRead = new Promise<void>(resolve => { started = resolve; });
    const attempts = new Map<string, number>();
    const http = vi.fn<DocumentFetch>(async (url, init) => {
      if (init?.method === "POST") return chat("gen-read-" + ++count, empty);
      const id = new URL(String(url)).searchParams.get("id")!;
      started();
      const attempt = (attempts.get(id) ?? 0) + 1;
      attempts.set(id, attempt);
      return attempt < 3 ? new Response(null, { status: 404 }) : fixtureGenerationResponse(id, review.config.model, review.qualification.receiptRoute);
    });
    vi.useFakeTimers();
    try {
      const pending = runner.runDocumentDiagnosticPilot(environment(issued), { fetch: http, mode, now, checkpoint });
      await firstRead;
      await vi.runAllTimersAsync();
      const result = await pending;
      expect([...attempts.values()]).toEqual([3, 3, 3, 3]);
      expect(http).toHaveBeenCalledTimes(16);
      expect(result).toMatchObject({ requestsSent: 4, pilotCompleted: true, heldMicroUsd: 0, settledMicroUsd: 28 });
    } finally { vi.useRealTimers(); }
  });
});
