import type { ResearchBridgeEnvironment } from "../../app/server/research/executor/connection-config";

export type ExecutorEnvironment = ResearchBridgeEnvironment & Readonly<{
  EXECUTOR_DB: D1Database;
  EXECUTOR_RECEIPTS: R2Bucket;
  RESEARCH_WORKFLOW: Workflow<{ jobId: string }>;
  ARC_RESEARCH_EXECUTOR_ACCEPT_NEW?: string;
  ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED?: string;
  OPENROUTER_API_KEY?: string;
}>;
