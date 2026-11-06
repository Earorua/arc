import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { QualityDocument } from "../tests/helpers/document-quality-evaluation";

export const corpusDigest = createHash("sha256")
  .update(readFileSync(new URL("../tests/fixtures/documents/quality-corpus.json", import.meta.url))).digest("hex");

export class QualificationRunError extends Error {
  constructor(readonly code: "qualification-disabled" | "qualification-settings-invalid" | "qualification-authorization-mismatch" | "qualification-checkpoint-failed") {
    super(code); this.name = "QualificationRunError";
  }
}

/** Preserve every frozen source ID/offset; gap segments cover only the prefix and separators. */
export function qualificationSegments(document: QualityDocument) {
  const segments: { id: string; start: number; end: number }[] = [];
  let offset = 0, gap = 0;
  for (const segment of document.segments) {
    if (segment.start < offset || segment.end <= segment.start || document.text.slice(segment.start, segment.end) !== segment.text) throw new QualificationRunError("qualification-settings-invalid");
    if (segment.start > offset) segments.push({ id: `qualification-gap-${++gap}`, start: offset, end: segment.start });
    segments.push({ id: segment.id, start: segment.start, end: segment.end });
    offset = segment.end;
  }
  if (offset < document.text.length) segments.push({ id: `qualification-gap-${++gap}`, start: offset, end: document.text.length });
  return segments;
}

export function qualificationInput(document: QualityDocument, providerPolicyId: string) {
  return {
    textVersionId: document.textVersionId, text: document.text, segments: qualificationSegments(document),
    kind: document.kind as "resume" | "jd", providerPolicyId, outputSchemaVersion: "2026.11.1" as const,
  };
}
