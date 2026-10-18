import type { EntitlementAuthorizer } from "../entitlements/policy";
import type { ProviderUsage } from "../../contracts/research";
import {
  roleResearchPreviewSchema,
  roleResearchRequestSchema,
  type AiProvider,
  type RoleResearchPreview,
} from "./contracts";

export class InvalidProviderOutputError extends Error {
  constructor() {
    super("The AI provider returned invalid structured output.");
    this.name = "InvalidProviderOutputError";
  }
}

type PreviewAiRunRecord = {
  userId: string;
  requestId: string;
  purpose: "role-research-preview";
  provider: string;
  model: string;
  promptVersion: string;
  inputSchemaVersion: string;
  outputSchemaVersion: string;
  status: "accepted" | "rejected" | "failed";
  latencyMs: number;
  errorCode: string | null;
};

export type ResearchAiRunRecord = Omit<PreviewAiRunRecord, "purpose" | "provider" | "model" | "errorCode"> & {
  purpose: "role-research" | "role-research-repair";
  provider: "openrouter" | "deterministic-mock";
  model: string | null;
  errorCode: "repair-required" | "invalid-result" | "missing-key" | "timeout" | "rate" | "balance" | "unavailable" | "filtered" | "invalid-transport" | null;
  usage: ProviderUsage | null;
  charged: boolean | "unknown";
};
export type AiRunRecord = PreviewAiRunRecord | ResearchAiRunRecord;
export interface ResearchAiRunReader {
  readResearchAttempt(userId: string, requestId: string): Promise<ResearchAiRunRecord | null>;
}

export interface AiRunSink {
  record(record: AiRunRecord): Promise<void>;
}

type AiGatewayDependencies = {
  provider: AiProvider;
  entitlements: EntitlementAuthorizer;
  runs: AiRunSink;
  now?: () => number;
  providerName?: string;
  model?: string;
  cohortEnabled?: (userId: string) => Promise<boolean>;
};

export type AiGatewayResult =
  | { accepted: true; preview: RoleResearchPreview }
  | { accepted: false; reason: "disabled" | "cohort" | "quota" | "rate" | "budget" };

export class AiGateway {
  private readonly now: () => number;
  private readonly providerName: string;
  private readonly model: string;

  constructor(private readonly dependencies: AiGatewayDependencies) {
    this.now = dependencies.now ?? (() => Date.now());
    this.providerName = dependencies.providerName ?? "deterministic-mock";
    this.model = dependencies.model ?? "foundation-preview-v1";
  }

  private runRecord(
    userId: string,
    requestId: string,
    status: AiRunRecord["status"],
    startedAt: number,
    errorCode: string | null,
  ): AiRunRecord {
    return {
      userId,
      requestId,
      purpose: "role-research-preview",
      provider: this.providerName,
      model: this.model,
      promptVersion: "role-preview-v1",
      inputSchemaVersion: "1",
      outputSchemaVersion: "1",
      status,
      latencyMs: Math.max(0, Math.round(this.now() - startedAt)),
      errorCode,
    };
  }

  async research(userId: string, input: unknown): Promise<AiGatewayResult> {
    const request = roleResearchRequestSchema.parse(input);
    let cohortEnabled = true;
    if (this.dependencies.cohortEnabled) {
      try {
        cohortEnabled = await this.dependencies.cohortEnabled(userId);
      } catch {
        cohortEnabled = false;
      }
    }
    const decision = await this.dependencies.entitlements.authorize({
      userId,
      purpose: "role-research-preview",
      idempotencyKey: request.requestId,
      units: 1,
      cohortEnabled,
      rateAllowed: true,
    });
    if (!decision.allowed) return { accepted: false, reason: decision.reason };

    const startedAt = this.now();
    try {
      const initial = await this.dependencies.provider.run(request);
      let parsed = roleResearchPreviewSchema.safeParse(initial);
      if (!parsed.success) {
        const repaired = await this.dependencies.provider.repair(request, initial);
        parsed = roleResearchPreviewSchema.safeParse(repaired);
      }
      if (!parsed.success) throw new InvalidProviderOutputError();

      await this.dependencies.entitlements.finalize(decision.reservationId, "accepted", 1);
      await this.dependencies.runs.record(
        this.runRecord(userId, request.requestId, "accepted", startedAt, null),
      ).catch(() => undefined);
      return { accepted: true, preview: parsed.data };
    } catch (error) {
      const rejected = error instanceof InvalidProviderOutputError;
      await this.dependencies.entitlements.finalize(
        decision.reservationId,
        rejected ? "rejected" : "failed",
        0,
      );
      await this.dependencies.runs.record(this.runRecord(
        userId,
        request.requestId,
        rejected ? "rejected" : "failed",
        startedAt,
        rejected ? "INVALID_PROVIDER_OUTPUT" : "PROVIDER_FAILURE",
      )).catch(() => undefined);
      throw error;
    }
  }
}
