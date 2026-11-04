/** In-memory provider boundary. Never serialize this input into Workflow history. */
export type DocumentProviderInput = Readonly<{
  textVersionId: string;
  text: string;
  segments: readonly Readonly<{ id: string; start: number; end: number }>[];
  kind: "resume" | "jd" | "supplement";
  providerPolicyId: string;
  outputSchemaVersion: "2026.11.1";
}>;

export type DocumentProviderOutcome =
  | Readonly<{ kind: "received"; candidate: unknown; inputTokens: number | null; outputTokens: number | null;
      actualMicroUsd: number | null; receiptId: string | null }>
  | Readonly<{ kind: "not-sent"; code: "configuration" | "aborted-before-send" }>
  | Readonly<{ kind: "unknown"; code: "timeout" | "connection-lost" | "invalid-receipt" }>;

export interface DocumentAnalysisProvider {
  analyze(input: DocumentProviderInput, signal: AbortSignal): Promise<DocumentProviderOutcome>;
}
