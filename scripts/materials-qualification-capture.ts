import { createHash } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, realpathSync, writeSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { z } from "zod";
import corpus from "../tests/fixtures/documents/quality-corpus.json";
import { materialDigestSchema, materialIdSchema } from "../app/contracts/documents";
import type { DocumentProviderOutcome } from "../app/server/documents/provider";
import { readDocumentHttpJson } from "../worker/document-executor/generation-receipt";
import { corpusDigest } from "./materials-qualification-inputs";

/** Private local evidence, never part of the public/legacy qualification report. */
export type QualificationChatCapture = {
  status: "not-returned" | "http-rejected" | "unreadable" | "captured";
  httpStatus: number | null;
  assistantContent: unknown;
  finishReason: unknown;
  nativeFinishReason: unknown;
  topLevelFinishReason: unknown;
  topLevelNativeFinishReason: unknown;
};
export type QualificationOutputCapture = Readonly<{
  schemaVersion: "materials-qualification-output-v1";
  runId: string; authorizationId: string; mode: "offline-test" | "authorized-live";
  documentId: string; documentVersionId: string; textVersionId: string; sourceTextSha256: string;
  providerPolicyId: string; endpoint: string; model: string; requestBodySha256: string | null;
  chat: QualificationChatCapture;
  outcome: DocumentProviderOutcome;
  accounting: { state: "settled" | "released" | "held-unknown"; reservedMicroUsd: number; actualMicroUsd: number | null };
}>;

export function emptyQualificationChat(): QualificationChatCapture {
  return { status: "not-returned", httpStatus: null, assistantContent: null, finishReason: null,
    nativeFinishReason: null, topLevelFinishReason: null, topLevelNativeFinishReason: null };
}

/** Parse a bounded clone; the provider receives the untouched original and its exact cost literals. */
export async function captureQualificationChat(response: Response, signal: AbortSignal): Promise<QualificationChatCapture> {
  const empty = { ...emptyQualificationChat(), httpStatus: response.status };
  if (response.status !== 200 || response.redirected) return { ...empty, status: "http-rejected" };
  try {
    const raw = await readDocumentHttpJson(response.clone(), signal, () => signal.throwIfAborted());
    const first = Array.isArray(raw.choices) ? raw.choices[0] : null;
    return { ...empty, status: "captured", assistantContent: first?.message?.content ?? null,
      finishReason: first?.finish_reason ?? null, nativeFinishReason: first?.native_finish_reason ?? null,
      topLevelFinishReason: raw.finish_reason ?? null, topLevelNativeFinishReason: raw.native_finish_reason ?? null };
  } catch { return { ...empty, status: "unreadable" }; }
}

export function assertQualificationCaptureHasNoCredential(value: QualificationOutputCapture, credential: string) {
  const encodedCredential = JSON.stringify(credential).slice(1, -1);
  if (JSON.stringify(value).includes(encodedCredential)) throw new Error("qualification-capture-credential");
  // Preserve arbitrary original content, but also detect a credential escaped inside its JSON text.
  if (typeof value.chat.assistantContent === "string") {
    let decoded: unknown;
    try { decoded = JSON.parse(value.chat.assistantContent); } catch { return; }
    if (JSON.stringify(decoded).includes(encodedCredential)) throw new Error("qualification-capture-credential");
  }
}

const writerBindingSchema = z.strictObject({ runId: materialIdSchema, authorizationId: materialIdSchema,
  mode: z.enum(["offline-test", "authorized-live"]), candidateCommit: z.string().regex(/^[a-f0-9]{40}$/u),
  configurationSha256: materialDigestSchema });
const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const MAX_CAPTURE_BYTES = 1024 * 1024;
function writeExclusive(path: string, value: string) {
  const descriptor = openSync(path, "wx", 0o600);
  try {
    const bytes = Buffer.from(value, "utf8");
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(descriptor, bytes, offset, bytes.length - offset);
      if (written === 0) throw new Error("qualification-capture-short-write");
      offset += written;
    }
    fsyncSync(descriptor);
  } finally { closeSync(descriptor); }
}

/** Exclusive local output only; the frozen operator packet, not this writer, attests execution source and grants transport. */
export function createQualificationOutputWriter(baseDirectory: string, input: z.infer<typeof writerBindingSchema>) {
  const binding = writerBindingSchema.parse(input);
  const base = resolve(baseDirectory);
  mkdirSync(base, { recursive: true, mode: 0o700 });
  if (relative(base, realpathSync.native(base)) !== "") throw new Error("qualification-capture-directory");
  const directory = join(base, binding.runId);
  mkdirSync(directory, { mode: 0o700 });
  const documents = corpus.documents.map(doc => ({ documentId: doc.id, documentVersionId: doc.documentVersionId,
    textVersionId: doc.textVersionId, sourceTextSha256: hash(doc.text) }));
  const manifest = { schemaVersion: "materials-qualification-capture-binding-v1", ...binding, corpusSha256: corpusDigest,
    maxCaptures: 24, maxCaptureBytes: MAX_CAPTURE_BYTES, documents };
  const manifestJson = JSON.stringify(manifest) + "\n", bindingSha256 = hash(manifestJson);
  writeExclusive(join(directory, "binding.json"), manifestJson);
  return {
    directory, bindingSha256,
    async capture(value: QualificationOutputCapture) {
      const doc = documents.find(document => document.documentId === value.documentId);
      if (value.schemaVersion !== "materials-qualification-output-v1" || value.runId !== binding.runId || value.authorizationId !== binding.authorizationId
        || value.mode !== binding.mode || !doc || value.documentVersionId !== doc.documentVersionId || value.textVersionId !== doc.textVersionId
        || value.sourceTextSha256 !== doc.sourceTextSha256 || !materialDigestSchema.safeParse(value.requestBodySha256).success)
        throw new Error("qualification-capture-binding");
      const serialized = JSON.stringify(value, (_key, field: unknown) => {
        // JSON.parse accepts overflowing exponents; JSON.stringify would silently replace them with null.
        if (typeof field === "number" && !Number.isFinite(field)) throw new Error("qualification-capture-nonfinite");
        return field;
      });
      const envelope = JSON.stringify({ bindingSha256, captureSha256: hash(serialized), capture: value }) + "\n";
      if (Buffer.byteLength(envelope, "utf8") > MAX_CAPTURE_BYTES) throw new Error("qualification-capture-size");
      // Frozen IDs bound the file set to 24; exclusive creation prevents resume, substitution and overwrite.
      writeExclusive(join(directory, doc.documentId + ".json"), envelope);
    },
  };
}
