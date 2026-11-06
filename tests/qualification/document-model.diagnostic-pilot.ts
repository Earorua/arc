import { expect, it } from "vitest";
import { DOCUMENT_LIMITS } from "../../app/server/documents/policy";
import { DOCUMENT_METADATA_TIMEOUT_MS } from "../../worker/document-executor/generation-receipt";
import { runDocumentDiagnosticPilot } from "../../scripts/materials-qualification-runner";

// A host-approved issue and a fresh exclusive directory are both required for this one-shot entry.
it("collects and scores the four separately approved diagnostic receipts", async () => {
  const result = await runDocumentDiagnosticPilot(process.env, { mode: "authorized-live" });
  // Completion includes four verified settlements and scores. The separate quality decision stays in result.json.
  expect({ pilotCompleted: result.pilotCompleted, b2Passed: result.passed, heldMicroUsd: result.heldMicroUsd,
    requestsSent: result.requestsSent, stoppedReason: result.stoppedReason })
    .toEqual({ pilotCompleted: true, b2Passed: false, heldMicroUsd: 0, requestsSent: 4, stoppedReason: null });
}, 4 * (DOCUMENT_LIMITS.httpTimeoutMs + DOCUMENT_METADATA_TIMEOUT_MS) + 60_000);
