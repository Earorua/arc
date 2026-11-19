import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { materialDigestSchema, materialIdSchema } from "../../../app/contracts/documents";
import { documentReceiptAuditSchema } from "../../../app/server/documents/provider-receipt";
import { documentReceiptRouteSchema } from "../../../app/server/documents/receipt-route";
import { KIMI_SOURCE_MENTIONS_POLICY_ID } from "../../../app/server/documents/policy";
import type { QualificationOutputCapture } from "../../../scripts/materials-qualification-capture";
import { deepFreeze } from "../materials-quality-v2/candidate-common.mjs";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const fail = (message: string): never => { throw new Error(`capture-integrity: ${message}`); };
const mode = z.enum(["offline-test", "authorized-live"]);
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const identity = { documentId: materialIdSchema, documentVersionId: materialIdSchema, textVersionId: materialIdSchema };
const expectedSchema = z.strictObject({ bindingSha256: materialDigestSchema, runId: materialIdSchema, authorizationId: materialIdSchema, mode,
  candidateCommit: z.string().regex(/^[a-f0-9]{40}$/u), configurationSha256: materialDigestSchema,
  providerPolicyId: z.literal(KIMI_SOURCE_MENTIONS_POLICY_ID), endpoint: z.string().url(), model: z.string().min(1), receiptRoute: documentReceiptRouteSchema,
  requestBodies: z.array(z.strictObject({ documentId: materialIdSchema, requestBodySha256: materialDigestSchema })).length(24) });
export type QualificationCaptureExpectation = z.infer<typeof expectedSchema>;
const bindingSchema = z.strictObject({ schemaVersion: z.literal("materials-qualification-capture-binding-v1"),
  runId: materialIdSchema, authorizationId: materialIdSchema, mode, candidateCommit: z.string(), configurationSha256: materialDigestSchema,
  corpusSha256: z.literal("69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750"), maxCaptures: z.literal(24), maxCaptureBytes: z.literal(1048576),
  documents: z.array(z.strictObject({ ...identity, sourceTextSha256: materialDigestSchema })).length(24) });
const chatSchema = z.strictObject({ status: z.enum(["not-returned", "http-rejected", "unreadable", "captured"]), httpStatus: z.number().int().nullable(),
  assistantContent: z.unknown(), finishReason: z.unknown(), nativeFinishReason: z.unknown(), topLevelFinishReason: z.unknown(), topLevelNativeFinishReason: z.unknown() });
const outcomeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("received"), candidate: z.unknown(), inputTokens: amount.nullable(), outputTokens: amount.nullable(),
    actualMicroUsd: amount.nullable(), receiptId: z.string().min(1).nullable(), audit: documentReceiptAuditSchema.optional() }),
  z.strictObject({ kind: z.literal("not-sent"), code: z.enum(["configuration", "aborted-before-send"]) }),
  z.strictObject({ kind: z.literal("unknown"), code: z.enum(["timeout", "connection-lost", "invalid-receipt"]) }),
]);
const captureSchema = z.strictObject({ schemaVersion: z.literal("materials-qualification-output-v1"), runId: materialIdSchema, authorizationId: materialIdSchema, mode,
  ...identity, sourceTextSha256: materialDigestSchema, providerPolicyId: z.string(), endpoint: z.string(), model: z.string(), requestBodySha256: materialDigestSchema,
  chat: chatSchema, outcome: outcomeSchema, accounting: z.strictObject({ state: z.enum(["settled", "released", "held-unknown"]), reservedMicroUsd: amount, actualMicroUsd: amount.nullable() }) });
const envelopeSchema = z.strictObject({ bindingSha256: materialDigestSchema, captureSha256: materialDigestSchema, capture: captureSchema });

export type CapturedDocument = {
  documentId: string; documentVersionId: string; textVersionId: string; sourceTextSha256: string | null; providerPolicyId: string;
  decodedCandidate: unknown; rawAssistant: Record<string, unknown>; provenance: { kind: "constructed-control" | "captured-output"; actualModelOutput: boolean };
  accounting: { state: string; receiptVerified: boolean; actualMicroUsd?: number | null; reservedMicroUsd?: number; receiptId?: string | null; audit?: unknown };
  captureIdentity: Record<string, unknown>; originalCapture?: QualificationOutputCapture; originalSupplementOutput?: unknown;
};
export type CaptureBatch = {
  collection: "qualification-24" | "supplement-6"; mode: "offline-test" | "authorized-live"; complete: boolean;
  outputs: CapturedDocument[]; missingDocumentIds: string[]; binding: unknown; limitations: string[];
};
const verifiedBatches = new WeakSet<CaptureBatch>();
export const isVerifiedCaptureBatch = (batch: CaptureBatch) => verifiedBatches.has(batch);
const finishBatch = (batch: CaptureBatch) => { deepFreeze(batch); verifiedBatches.add(batch); return batch; };

async function boundedRead(file: string, maximum: number) {
  const info = await stat(file);
  if (!info.isFile() || info.size > maximum) fail("file exceeds capture bound");
  const bytes = await readFile(file);
  if (bytes.length > maximum) fail("file exceeds capture bound");
  return bytes;
}
function parse(bytes: Buffer) {
  return JSON.parse(bytes.toString("utf8"), (_key, value: unknown) => {
    if (typeof value === "number" && !Number.isFinite(value)) fail("nonfinite JSON");
    return value;
  });
}

/** expected is the externally frozen original packet, never values inferred from the capture directory. */
export async function readQualificationCaptures(directory: string, input: QualificationCaptureExpectation): Promise<CaptureBatch> {
  try {
    const expected = expectedSchema.parse(input), bytes = await boundedRead(path.join(directory, "binding.json"), 32768);
    if (hash(bytes) !== expected.bindingSha256) fail("original binding digest differs");
    const binding = bindingSchema.parse(parse(bytes));
    for (const key of ["runId", "authorizationId", "mode", "candidateCommit", "configurationSha256"] as const)
      if (binding[key] !== expected[key]) fail(`original ${key} differs`);
    const corpusBytes = await boundedRead(fileURLToPath(new URL("../../../tests/fixtures/documents/quality-corpus.json", import.meta.url)), 1048576);
    if (hash(corpusBytes) !== binding.corpusSha256) fail("original corpus bytes differ");
    const corpus = parse(corpusBytes);
    // Corpus bytes are frozen separately by the current reference loader; identity is also checked here before importing any output.
    const documents = corpus.documents.map((doc: { id: string; documentVersionId: string; textVersionId: string; text: string }) => ({
      documentId: doc.id, documentVersionId: doc.documentVersionId, textVersionId: doc.textVersionId, sourceTextSha256: hash(doc.text) }));
    if (JSON.stringify(binding.documents) !== JSON.stringify(documents)
      || new Set(expected.requestBodies.map(doc => doc.documentId)).size !== 24
      || documents.some((doc: { documentId: string }) => !expected.requestBodies.some(value => value.documentId === doc.documentId))) fail("document commitment differs");
    const names = new Set(await readdir(directory)), allowed = new Set(["binding.json", ...binding.documents.map(doc => `${doc.documentId}.json`)]);
    if ([...names].some(name => !allowed.has(name))) fail("unexpected capture file");
    const outputs: CapturedDocument[] = [], missingDocumentIds: string[] = [], receipts = new Set<string>();
    for (const doc of binding.documents) {
      const filename = `${doc.documentId}.json`;
      if (!names.has(filename)) { missingDocumentIds.push(doc.documentId); continue; }
      const envelope = parse(await boundedRead(path.join(directory, filename), binding.maxCaptureBytes)) as z.infer<typeof envelopeSchema>;
      envelopeSchema.parse(envelope); // Validate without reordering/reconstructing the stored capture before its digest check.
      const capture = envelope.capture;
      if (envelope.bindingSha256 !== expected.bindingSha256 || envelope.captureSha256 !== hash(JSON.stringify(capture))) fail("capture envelope digest differs");
      for (const key of ["runId", "authorizationId", "mode", "providerPolicyId", "endpoint", "model"] as const)
        if (capture[key] !== expected[key]) fail(`capture ${key} differs`);
      for (const key of ["documentId", "documentVersionId", "textVersionId", "sourceTextSha256"] as const)
        if (capture[key] !== doc[key]) fail(`capture ${key} differs`);
      if (capture.requestBodySha256 !== expected.requestBodies.find(value => value.documentId === doc.documentId)!.requestBodySha256) fail("actual request body differs");
      if (Object.keys(chatSchema.shape).some(key => !Object.hasOwn(capture.chat, key))) fail("missing original chat field");
      const received = capture.outcome.kind === "received" ? capture.outcome : null, audit = received?.audit;
      if (received && !Object.hasOwn(received, "candidate")) fail("decoded candidate absent");
      if (received?.receiptId) {
        if (receipts.has(received.receiptId)) fail("duplicate receipt");
        receipts.add(received.receiptId);
      }
      if (capture.accounting.actualMicroUsd !== (received?.actualMicroUsd ?? null)) fail("accounting cost differs");
      if (capture.accounting.state === "settled" && (!received?.receiptId || received.actualMicroUsd === null)) fail("settled receipt absent");
      if ((capture.accounting.state === "released") !== (capture.outcome.kind === "not-sent")) fail("release outcome differs");
      const receiptVerified = capture.accounting.state === "settled" && audit?.status === "verified";
      if (receiptVerified && (audit.actualModel !== (expected.receiptRoute.generationModel ?? expected.model)
        || audit.actualProvider !== expected.receiptRoute.providerName || audit.actualEndpointId !== expected.receiptRoute.endpointId
        || (audit.metadataMicroUsd !== null && audit.metadataMicroUsd !== received!.actualMicroUsd)
        || (audit.metadataInputTokens !== null && audit.metadataInputTokens !== received!.inputTokens)
        || (audit.metadataOutputTokens !== null && audit.metadataOutputTokens !== received!.outputTokens))) fail("verified receipt route/accounting differs");
      outputs.push({ ...doc, providerPolicyId: capture.providerPolicyId, decodedCandidate: received ? received.candidate : undefined,
        rawAssistant: { ...capture.chat, finishEvidence: capture.chat.status === "captured" ? "captured" : "not-available" },
        provenance: { kind: "captured-output", actualModelOutput: expected.mode === "authorized-live" },
        accounting: { ...capture.accounting, receiptId: received?.receiptId ?? null, audit: audit ?? null, receiptVerified },
        captureIdentity: { collection: "qualification-24", bindingSha256: envelope.bindingSha256, captureSha256: envelope.captureSha256,
          runId: binding.runId, authorizationId: binding.authorizationId, candidateCommit: binding.candidateCommit, configurationSha256: binding.configurationSha256,
          corpusSha256: binding.corpusSha256, requestBodySha256: capture.requestBodySha256, requestBodyEvidence: "captured" }, originalCapture: capture });
    }
    return finishBatch({ collection: "qualification-24", mode: expected.mode, binding, outputs, missingDocumentIds,
      complete: missingDocumentIds.length === 0 && outputs.every(output => output.accounting.receiptVerified),
      limitations: ["Local envelope hashes bind captured evidence to the external packet; they do not independently authenticate provider records or grant authorization."] });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("capture-integrity:")) throw error;
    throw new Error("capture-integrity: invalid or unavailable qualification capture", { cause: error });
  }
}

/** Reopen the original ledger read-only. Callers cannot substitute a self-authored export object. */
export async function readSupplementCaptures(input: { issuance: string; issuanceSha256: string; directory: string; mode: CaptureBatch["mode"] }): Promise<CaptureBatch> {
  const { exportSupplementRun } = await import("../../../scripts/collect-materials-supplements");
  const archive = await exportSupplementRun(input.issuance, input.issuanceSha256, input.directory, input.mode);
  const issued = JSON.parse(input.issuance);
  if (issued.config.providerPolicyId !== KIMI_SOURCE_MENTIONS_POLICY_ID) fail("supplement projection policy differs");
  const outputs: CapturedDocument[] = archive.outputs.map(output => ({ documentId: output.documentId, documentVersionId: output.documentVersionId,
    textVersionId: output.textVersionId, sourceTextSha256: null, providerPolicyId: issued.config.providerPolicyId,
    decodedCandidate: output.extractionRecorded ? output.extraction : undefined,
    rawAssistant: { assistantContent: output.assistantContent, rawCaptured: output.rawCaptured, rawContentSha256: output.rawContentSha256,
      finishEvidence: "not-recorded", extractionRead: output.audit?.extractionRead ?? null },
    provenance: { kind: "captured-output", actualModelOutput: input.mode === "authorized-live" },
    accounting: { state: output.state, receiptId: output.receiptId, receiptVerified: output.state === "settled" && output.audit?.status === "verified",
      reservedMicroUsd: output.reservedMicroUsd, actualMicroUsd: output.actualMicroUsd, audit: output.audit },
    captureIdentity: { collection: "supplement-6", runId: archive.runId, authorizationId: archive.authorizationId, issuanceSha256: archive.issuanceSha256,
      ledgerSha256: archive.ledgerSha256, candidateCommit: archive.candidateCommit, configurationSha256: archive.configurationSha256,
      corpusSha256: archive.corpusSha256, evidenceSha256: output.evidenceSha256, requestBodyEvidence: "not-recorded" }, originalSupplementOutput: output }));
  const binding = Object.fromEntries(Object.entries(archive).filter(([key]) => key !== "outputs"));
  return finishBatch({ collection: "supplement-6", mode: input.mode, binding, outputs,
    missingDocumentIds: issued.authorization.documents.filter((doc: { documentId: string }) => !outputs.some(output => output.documentId === doc.documentId)).map((doc: { documentId: string }) => doc.documentId),
    complete: archive.complete, limitations: ["The original supplement ledger did not record finish flags or actual request-body digests; neither is reconstructed as captured evidence."] });
}

