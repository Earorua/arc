// @vitest-environment node
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { expect, it } from "vitest";
import * as capture from "../../scripts/materials-qualification-capture";
import corpus from "../fixtures/documents/quality-corpus.json";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
it("writes exclusive bounded capture files bound to the frozen document and execution identity", async () => {
  expect(typeof capture.createQualificationOutputWriter).toBe("function");
  const directory = mkdtempSync(join(tmpdir(), "arc-qualification-capture-"));
  try {
    const binding = { runId: "capture-fixture", authorizationId: "capture-grant", mode: "offline-test" as const,
      candidateCommit: "a".repeat(40), configurationSha256: "b".repeat(64) };
    const writer = capture.createQualificationOutputWriter(directory, binding);
    const doc = corpus.documents[0]!;
    const value: capture.QualificationOutputCapture = { schemaVersion: "materials-qualification-output-v1", ...binding,
      documentId: doc.id, documentVersionId: doc.documentVersionId, textVersionId: doc.textVersionId,
      sourceTextSha256: sha(doc.text), providerPolicyId: "fixture-policy", endpoint: "https://example.invalid/chat/completions",
      model: "fixture-model", requestBodySha256: "c".repeat(64),
      chat: { ...capture.emptyQualificationChat(), status: "captured", httpStatus: 200, assistantContent: " \n{broken\u0000\ud800 ", finishReason: "length" },
      outcome: { kind: "unknown", code: "invalid-receipt" }, accounting: { state: "held-unknown", actualMicroUsd: null, reservedMicroUsd: 18048 } };
    await writer.capture(value);
    const stored = JSON.parse(readFileSync(join(writer.directory, doc.id + ".json"), "utf8"));
    expect(stored).toEqual({ bindingSha256: writer.bindingSha256, captureSha256: sha(JSON.stringify(value)), capture: value });
    expect(JSON.parse(readFileSync(join(writer.directory, "binding.json"), "utf8"))).toMatchObject({ ...binding,
      corpusSha256: "69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750", maxCaptures: 24 });
    await expect(writer.capture(value)).rejects.toThrow();
    await expect(writer.capture({ ...value, textVersionId: "wrong-version" })).rejects.toThrow("qualification-capture-binding");
    const second = corpus.documents[1]!;
    await expect(writer.capture({ ...value, documentId: second.id, documentVersionId: second.documentVersionId,
      textVersionId: second.textVersionId, sourceTextSha256: sha(second.text),
      chat: { ...value.chat, assistantContent: "x".repeat(1024 * 1024) } })).rejects.toThrow("qualification-capture-size");
    expect(existsSync(join(writer.directory, second.id + ".json"))).toBe(false);
    expect(() => capture.createQualificationOutputWriter(directory, binding)).toThrow();
  } finally {
    const target = realpathSync(directory);
    if (dirname(target) !== realpathSync(tmpdir()) || !basename(target).startsWith("arc-qualification-capture-")) throw new Error("unexpected capture fixture directory");
    rmSync(target, { recursive: true, force: true });
  }
});
