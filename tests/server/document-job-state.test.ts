// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mayActivateResult, mayDispatch, mayReleaseReservation, settleProviderOutcome } from "../../worker/document-executor/job-state";
import { DOCUMENT_PAID_STEP_CONFIG, parseDocumentWorkflowArgs, parseDocumentWorkflowOutput } from "../../worker/document-executor/workflow-policy";

const eligibility = { state: "queued" as const, dispatch: "not-sent" as const, consentValid: true,
  generationMatches: true, budgetReserved: true, executionSlotOwned: true };

describe("document dispatch and accounting policy", () => {
  it("requires every send eligibility condition", () => {
    expect(mayDispatch(eligibility)).toBe(true);
    for (const key of ["consentValid", "generationMatches", "budgetReserved", "executionSlotOwned"]) {
      expect(mayDispatch({ ...eligibility, [key]: false })).toBe(false);
    }
    for (const state of ["running", "succeeded", "failed", "cancel-requested", "cancelled", "revoked", "cost-unknown"] as const)
      expect(mayDispatch({ ...eligibility, state })).toBe(false);
    expect(mayDispatch({ ...eligibility, dispatch: "may-have-sent" })).toBe(false);
    expect(mayDispatch({ ...eligibility, dispatch: "settled" })).toBe(false);
  });
  it("never expires a potentially sent reservation, even across a day boundary", () => {
    expect(mayReleaseReservation({ dispatch: "not-sent", expired: true, cancelled: false })).toBe(true);
    expect(mayReleaseReservation({ dispatch: "not-sent", expired: false, cancelled: true })).toBe(true);
    expect(mayReleaseReservation({ dispatch: "not-sent", expired: false, cancelled: false })).toBe(false);
    for (const dispatch of ["may-have-sent", "settled"] as const)
      expect(mayReleaseReservation({ dispatch, expired: true, cancelled: true })).toBe(false);
  });
  it("gates late result activation on revision, generation and consent", () => {
    const input = { state: "running" as const, revisionMatches: true, generationMatches: true, consentValid: true };
    expect(mayActivateResult(input)).toBe(true);
    for (const key of ["revisionMatches", "generationMatches", "consentValid"])
      expect(mayActivateResult({ ...input, [key]: false })).toBe(false);
    expect(mayActivateResult({ ...input, state: "cancel-requested" })).toBe(false);
    expect(mayActivateResult({ ...input, state: "revoked" })).toBe(false);
  });
  it("keeps cost unknown independently of a successfully received candidate", () => {
    expect(settleProviderOutcome({ kind: "received", candidate: {}, inputTokens: 1, outputTokens: 1,
      actualMicroUsd: null, receiptId: null })).toEqual({ dispatch: "may-have-sent", accounting: "held-unknown", releaseSlot: false });
    expect(settleProviderOutcome({ kind: "unknown", code: "connection-lost" })).toEqual({
      dispatch: "may-have-sent", accounting: "held-unknown", releaseSlot: false });
    expect(settleProviderOutcome({ kind: "not-sent", code: "configuration" })).toEqual({
      dispatch: "not-sent", accounting: "released", releaseSlot: true });
    expect(settleProviderOutcome({ kind: "received", candidate: {}, inputTokens: 1, outputTokens: 1,
      actualMicroUsd: 0, receiptId: "receipt-1" })).toEqual({ dispatch: "settled", accounting: "settled", releaseSlot: true });
  });
});

describe("document Workflow boundary", () => {
  it("disables paid-step retries and bounds its timeout", () => {
    expect(DOCUMENT_PAID_STEP_CONFIG).toEqual({ retries: { limit: 0, delay: "1 second", backoff: "constant" }, timeout: "4 minutes" });
    expect(Object.isFrozen(DOCUMENT_PAID_STEP_CONFIG.retries)).toBe(true);
  });
  it("accepts only bounded reference arguments and output", () => {
    expect(parseDocumentWorkflowArgs({ jobId: "job-1", contractVersion: "2026.11.1" })).toEqual({
      jobId: "job-1", contractVersion: "2026.11.1" });
    const output = { jobId: "job-1", state: "succeeded", resultRef: "receipt-1" };
    expect(parseDocumentWorkflowOutput(output)).toEqual(output);
    for (const value of [{ ...output, text: "PRIVATE_SENTINEL" }, { ...output, jobId: "x".repeat(5000) },
      { ...output, state: "PRIVATE_SENTINEL" }, { ...output, resultRef: "https://private.invalid/path" }])
      expect(() => parseDocumentWorkflowOutput(value)).toThrow("Document workflow unavailable");
    expect(() => parseDocumentWorkflowArgs({ jobId: "job-1", contractVersion: "2026.11.1", text: "PRIVATE_SENTINEL" }))
      .toThrow("Document workflow unavailable");
  });
});
