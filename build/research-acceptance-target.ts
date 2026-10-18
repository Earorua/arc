import type { WorkerConfig } from "@cloudflare/vite-plugin";
import { z } from "zod";

function strictInventoryObject<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.preprocess((value) => {
    // Zod skips this own JSON key when checking extras; reject it before parsing.
    if (typeof value === "object" && value !== null && Object.hasOwn(value, "__proto__")) {
      throw new Error("Unknown inventory key.");
    }
    return value;
  }, z.strictObject(shape));
}

const ACCOUNT_ID = "54eaadb89014252836694203c1e22546";
const excludedDatabaseIds = new Set([
  "00000000-0000-4000-8000-000000000000",
  "fe4952d0-da78-4c85-b1fa-8a5706d42fa3",
  "81d44533-40d9-4544-a03d-81a01e2719ae",
  "0b832b24-7ece-46f6-9899-59a755bead6b",
  "d52456da-a78f-4765-9e56-4a7d2ad92a4b",
  "eee6702f-ad59-45c8-bcfe-aec09aebcdd4",
  "eb8a443d-53ca-4fab-b028-ae03b03b6a2a",
  "eda666b8-6d49-4c3b-aa45-59eb9ff2bf74",
  "a480e7d5-c008-46da-99bf-ca2422c06621",
]);
const resourceName = z.string().max(63)
  .regex(/^arc-v8-migration-[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine((name) => name === name.trim() && !name.includes("smoke"));
const database = strictInventoryObject({
  databaseId: z.uuid().refine((id) => !excludedDatabaseIds.has(id.toLowerCase())),
  databaseName: resourceName,
});
const bucket = strictInventoryObject({ bucketName: resourceName, public: z.literal(false) });
const keyId = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/)
  .refine((value) => value === value.trim());
const researchAcceptanceSchema = strictInventoryObject({
  stage: z.literal("research-acceptance"),
  accountId: z.literal(ACCOUNT_ID),
  state: z.enum(["closed", "active", "draining"]),
  site: strictInventoryObject({
    workerName: resourceName, runtimeOrigin: z.string(), d1: database, r2: bucket,
  }),
  executor: strictInventoryObject({
    workerName: resourceName, runtimeOrigin: z.string(), d1: database, r2: bucket,
    workflowName: resourceName,
  }),
  bridge: strictInventoryObject({
    transport: z.literal("service-binding-v1"), siteToExecutorKeyId: keyId, executorToSiteKeyId: keyId,
  }),
  acceptanceOwnerId: z.string().min(1).max(160)
    .refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f-\u009f]/u.test(value)),
}).refine((target) => {
  const siteNames = [target.site.workerName, target.site.d1.databaseName, target.site.r2.bucketName];
  const executorNames = new Set([
    target.executor.workerName, target.executor.d1.databaseName, target.executor.r2.bucketName, target.executor.workflowName,
  ]);
  return target.site.runtimeOrigin === `https://${target.site.workerName}.23711031.workers.dev`
    && target.executor.runtimeOrigin === `https://${target.executor.workerName}.23711031.workers.dev`
    && target.site.d1.databaseId.toLowerCase() !== target.executor.d1.databaseId.toLowerCase()
    && !siteNames.some((name) => executorNames.has(name))
    && target.bridge.siteToExecutorKeyId !== target.bridge.executorToSiteKeyId;
});

export type ResearchAcceptanceTarget = z.infer<typeof researchAcceptanceSchema>;

export function parseResearchAcceptanceTarget(value: unknown): ResearchAcceptanceTarget {
  try {
    const result = researchAcceptanceSchema.safeParse(value);
    if (result.success) return result.data;
  } catch {
    // Forged objects can throw from getters; no input values or Zod details escape.
  }
  throw new Error("Invalid restricted Research target inventory.");
}

export function createResearchAcceptanceConfigPair(value: unknown): {
  site: Partial<WorkerConfig>;
  executor: Partial<WorkerConfig>;
} {
  const target = parseResearchAcceptanceTarget(value);
  const admitting = target.state === "active";
  // This state selects configuration only; it is not proof that a drain completed.
  const maintaining = target.state !== "closed";
  const common = {
    account_id: target.accountId, compatibility_date: "2026-05-15", preview_urls: false,
  };
  const bridgeVars = {
    BETTER_AUTH_URL: target.site.runtimeOrigin,
    ARC_AI_RESEARCH_EXECUTOR_URL: target.executor.runtimeOrigin,
    ARC_AI_RESEARCH_BRIDGE_TRANSPORT: target.bridge.transport,
    ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID: target.bridge.siteToExecutorKeyId,
    ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID: target.bridge.executorToSiteKeyId,
  };
  return {
    site: {
      ...common,
      name: target.site.workerName,
      main: "./worker/index.ts",
      compatibility_flags: ["nodejs_compat"],
      workers_dev: true,
      assets: { binding: "ASSETS" },
      d1_databases: [{ binding: "DB", database_name: target.site.d1.databaseName, database_id: target.site.d1.databaseId }],
      r2_buckets: [{ binding: "PROOF_ASSETS", bucket_name: target.site.r2.bucketName }],
      services: [{ binding: "ARC_RESEARCH_EXECUTOR", service: target.executor.workerName }],
      secrets: { required: [
        "BETTER_AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET",
        "ARC_AI_IP_HASH_SALT", "ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX", "ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX",
      ] },
      vars: {
        ...bridgeVars,
        ARC_ENVIRONMENT: "production",
        ARC_AI_ENABLED: String(admitting),
        ARC_AI_RESEARCH_ENABLED: String(admitting),
        ARC_AI_RESEARCH_EXECUTOR: "cloudflare-workflow-v1",
        ARC_AI_RESEARCH_PROFILE: "kimi-low-output32k-v3",
        ARC_AI_MODEL_RESEARCH: "moonshotai/kimi-k3",
        ARC_AI_MODEL_ECONOMY: "moonshotai/kimi-k3",
        ARC_AI_RESEARCH_TIMEOUT_MS: "1200000",
        ARC_AI_REPAIR_TIMEOUT_MS: "10000",
        ARC_AI_RESEARCH_CACHE_DAYS: "14",
        ARC_AI_USER_DAILY_QUOTA: "1",
        ARC_AI_RATE_LIMIT_PER_MINUTE: "1",
        ARC_AI_SITE_DAILY_BUDGET_MICROS: "5000000",
        ARC_AI_SITE_MONTHLY_BUDGET_MICROS: "5000000",
        ARC_AI_RESEARCH_MAX_COST_MICROS: "5000000",
        ARC_AI_REPAIR_MAX_COST_MICROS: "0",
      },
    },
    executor: {
      ...common,
      name: target.executor.workerName,
      main: "./worker/research-executor/index.ts",
      compatibility_flags: ["nodejs_compat"],
      workers_dev: false,
      routes: [],
      d1_databases: [{ binding: "EXECUTOR_DB", database_name: target.executor.d1.databaseName, database_id: target.executor.d1.databaseId }],
      r2_buckets: [{ binding: "EXECUTOR_RECEIPTS", bucket_name: target.executor.r2.bucketName }],
      workflows: [{ binding: "RESEARCH_WORKFLOW", name: target.executor.workflowName, class_name: "ResearchWorkflow" }],
      services: [{ binding: "ARC_RESEARCH_SITE", service: target.site.workerName }],
      secrets: { required: [
        "OPENROUTER_API_KEY", "ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX", "ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX",
      ] },
      vars: {
        ...bridgeVars,
        ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: String(admitting),
        ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED: String(maintaining),
      },
      triggers: { crons: maintaining ? ["* * * * *"] : [] },
    },
  };
}
