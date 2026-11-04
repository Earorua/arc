import type { DocumentProviderOutcome } from "../../app/server/documents/provider";

export type DispatchState = "not-sent" | "may-have-sent" | "settled";
export type DocumentJobState = "queued" | "running" | "succeeded" | "failed"
  | "cancel-requested" | "cancelled" | "revoked" | "cost-unknown";
export type DocumentAccountingState = "reserved" | "released" | "settled" | "held-unknown";

export function mayDispatch(input: {
  state: DocumentJobState; dispatch: DispatchState; consentValid: boolean; generationMatches: boolean;
  budgetReserved: boolean; executionSlotOwned: boolean;
}): boolean {
  return input.state === "queued" && input.dispatch === "not-sent" && input.consentValid
    && input.generationMatches && input.budgetReserved && input.executionSlotOwned;
}

export function mayReleaseReservation(input: {
  dispatch: DispatchState; expired: boolean; cancelled: boolean;
}): boolean {
  return input.dispatch === "not-sent" && (input.expired || input.cancelled);
}

export function mayActivateResult(input: {
  state: DocumentJobState; revisionMatches: boolean; generationMatches: boolean; consentValid: boolean;
}): boolean {
  return (input.state === "running" || input.state === "succeeded")
    && input.revisionMatches && input.generationMatches && input.consentValid;
}

export function settleProviderOutcome(outcome: DocumentProviderOutcome): Readonly<{
  dispatch: DispatchState; accounting: DocumentAccountingState; releaseSlot: boolean;
}> {
  if (outcome.kind === "not-sent") return { dispatch: "not-sent", accounting: "released", releaseSlot: true };
  if (outcome.kind === "received" && outcome.actualMicroUsd !== null && Number.isSafeInteger(outcome.actualMicroUsd)
      && outcome.actualMicroUsd >= 0 && outcome.receiptId !== null) {
    return { dispatch: "settled", accounting: "settled", releaseSlot: true };
  }
  return { dispatch: "may-have-sent", accounting: "held-unknown", releaseSlot: false };
}
