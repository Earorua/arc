// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { DOCUMENT_SCHEMA_VERSION } from "../../app/contracts/documents";
import { MATERIAL_MAPPING_VERSION } from "../../app/lib/materials/skill-mapper";
import { parseDocumentWorkflowArgs } from "../../worker/document-executor/workflow-policy";
import { documentAcceptanceCases } from "../../worker/document-executor/acceptance-policy";
import { qualificationSegments } from "../../scripts/materials-qualification-runner";
import corpus from "../fixtures/documents/quality-corpus.json";

const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
it("binds the offline candidate, page register and admission manifest to the exact qualification inputs", () => {
  const worksheet = readFileSync("docs/superpowers/runbooks/2026-11-04-materials-gate-1b-ui-casebook.md", "utf8");
  expect(sha(readFileSync("tests/fixtures/documents/quality-corpus.json"))).toBe("69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750");
  expect(DOCUMENT_SCHEMA_VERSION).toBe("2026.11.1");
  expect(parseDocumentWorkflowArgs({ jobId: "fixture-job", contractVersion: "2026.11.1" }).contractVersion).toBe("2026.11.1");
  const frozen = JSON.parse(readFileSync("docs/verification/materials-gate-1b-b0/candidate.json", "utf8"));
  expect(frozen.mappingVersion).toBe("2026.11.2");
  expect(MATERIAL_MAPPING_VERSION).toBe("2026.11.5");
  expect(Object.keys(documentAcceptanceCases)).toHaveLength(24);
  expect([...worksheet.matchAll(/^## \d{2}　`([^\x60]+)`/gmu)].map(x => x[1])).toEqual(corpus.documents.map(d => d.id));
  const bounds = corpus.documents.map(d => {
    expect(sha(d.text)).toBe(documentAcceptanceCases[d.id]);
    expect(worksheet).toContain(documentAcceptanceCases[d.id]);
    const segments = qualificationSegments(d).map(s => ({ segmentId: s.id, text: d.text.slice(s.start, s.end) }));
    return Buffer.byteLength(JSON.stringify({ kind: d.kind, segments })) + 4096;
  });
  expect(Math.max(...bounds)).toBe(4750);
  expect(bounds.reduce((sum, n) => sum + n, 0)).toBe(112234);
});
