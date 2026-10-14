export const PAID_STEP_CONFIG = Object.freeze({
  retries: { limit: 0, delay: "1 second" as const },
  timeout: "21 minutes" as const,
});

export type ExecutionReference = Readonly<{
  jobId: string;
  state: "recorded" | "already-claimed" | "closed" | "unavailable";
  receiptHash: string | null;
}>;
