import { resolve } from "node:path";
import { expect, it } from "vitest";
import { DOCUMENT_LIMITS } from "../../app/server/documents/policy";
import { DOCUMENT_METADATA_TIMEOUT_MS } from "../../worker/document-executor/generation-receipt";
import { createQualificationJournal } from "../../scripts/materials-qualification-journal";
import { readQualificationConfiguration, runDocumentQualification } from "../../scripts/materials-qualification-runner";

// This file is excluded from normal *.test.ts discovery. Do not run it without separately authorized scope and budget.
it("qualifies the fixed 24 synthetic documents through the production HTTP adapter", async () => {
  // Validation runs before creating a directory or reaching the actual transport.
  const settings = readQualificationConfiguration(process.env, new Date());
  const journal = createQualificationJournal(resolve("work/materials-qualification"), settings.runId);
  const result = await runDocumentQualification(process.env, {
    mode: "authorized-live", fetch: (input, init) => fetch(input, init), checkpoint: journal.checkpoint,
  });
  journal.finish(result);
  // Only bounded metadata reaches assertion output. No raw document/model response is persisted.
  const verified = result.documents.filter(row => row.accounting === "settled" && row.receiptId && row.audit?.status === "verified");
  expect({ passed: result.passed, requestsSent: result.requestsSent, uniqueVerifiedReceipts: new Set(verified.map(row => row.receiptId)).size,
    normalPrefillCount: result.normalPrefillCount, edgePassCount: result.edgePassCount,
    heldMicroUsd: result.heldMicroUsd, stoppedReason: result.stoppedReason })
    .toEqual({ passed: true, requestsSent: 24, uniqueVerifiedReceipts: 24, normalPrefillCount: 18, edgePassCount: 6, heldMicroUsd: 0, stoppedReason: null });
}, 24 * (DOCUMENT_LIMITS.httpTimeoutMs + DOCUMENT_METADATA_TIMEOUT_MS) + 60_000);
