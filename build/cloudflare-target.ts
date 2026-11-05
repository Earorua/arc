import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { WorkerConfig } from "@cloudflare/vite-plugin";
import { z } from "zod";
import { documentReceiptRouteSchema } from "../app/server/documents/receipt-route.ts";
import {
  createResearchAcceptanceConfigPair, parseResearchAcceptanceTarget, protectedCloudflareDatabaseIds, type ResearchAcceptanceTarget,
} from "./research-acceptance-target.ts";

const ACCOUNT_ID = "54eaadb89014252836694203c1e22546";
const LOCAL_DATABASE_ID = "00000000-0000-4000-8000-000000000000";
const excludedDatabaseIds = new Set([
  LOCAL_DATABASE_ID,
  "fe4952d0-da78-4c85-b1fa-8a5706d42fa3",
  "81d44533-40d9-4544-a03d-81a01e2719ae",
]);
const resourceName = z.string().max(63)
  .regex(/^arc-v8-migration-[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine((name) => !name.includes("smoke"));
const remoteTargetSchema = z.strictObject({
  stage: z.literal("shadow"),
  accountId: z.literal(ACCOUNT_ID),
  workerName: resourceName.refine((name) => name.startsWith("arc-v8-migration-shadow-")),
  runtimeOrigin: z.string(),
  d1: z.strictObject({
    databaseId: z.uuid().refine((id) => !excludedDatabaseIds.has(id.toLowerCase())),
    databaseName: resourceName,
  }),
  r2: z.strictObject({ bucketName: resourceName, public: z.literal(false) }),
}).refine((target) => target.runtimeOrigin === `https://${target.workerName}.23711031.workers.dev`);

const localTargetSchema = z.strictObject({
  stage: z.literal("local"),
  workerName: z.literal("arc-local-only"),
  runtimeOrigin: z.literal("http://localhost:3000"),
  d1: z.strictObject({ databaseId: z.literal(LOCAL_DATABASE_ID), databaseName: z.literal("arc-local-only-db") }),
  r2: z.strictObject({ bucketName: z.literal("arc-local-only-proofs"), public: z.literal(false) }),
});

export type RemoteCloudflareTarget = z.infer<typeof remoteTargetSchema>;
export type LocalCloudflareTarget = z.infer<typeof localTargetSchema>;
export type CloudflareTarget = RemoteCloudflareTarget | LocalCloudflareTarget | ResearchAcceptanceTarget | MaterialsAcceptanceTarget;

export function parseRemoteTarget(value: unknown): RemoteCloudflareTarget {
  const result = remoteTargetSchema.safeParse(value);
  // Never echo unknown inventory values: an incorrectly supplied file may contain secrets.
  if (!result.success) throw new Error("Invalid shadow Cloudflare target inventory.");
  return result.data;
}

function parseLocalTarget(value: unknown): LocalCloudflareTarget {
  const result = localTargetSchema.safeParse(value);
  if (!result.success) throw new Error("Invalid local-only Cloudflare inventory.");
  return result.data;
}

export async function loadCloudflareTarget(options: {
  targetPath?: string;
  rootDirectory?: string;
} = {}): Promise<CloudflareTarget> {
  const root = options.rootDirectory ?? process.cwd();
  const explicit = options.targetPath !== undefined;
  if (explicit && !options.targetPath?.trim()) throw new Error("An explicit Cloudflare target path must not be empty.");
  let value: unknown;
  try {
    value = JSON.parse(await readFile(resolve(root, explicit ? options.targetPath! : "cloudflare.local.json"), "utf8"));
  } catch {
    throw new Error("Cannot read Cloudflare target inventory JSON.");
  }
  if (explicit && typeof value === "object" && value !== null && "stage" in value) {
    if (value.stage === "research-acceptance") return parseResearchAcceptanceTarget(value);
    if (value.stage === "materials-acceptance") return parseMaterialsAcceptanceTarget(value);
  }
  return explicit ? parseRemoteTarget(value) : parseLocalTarget(value);
}

export function createCloudflareConfig(value: CloudflareTarget): Partial<WorkerConfig> {
  if (value.stage === "materials-acceptance") return createMaterialsAcceptanceConfigPair(value).site;
  if (value.stage === "research-acceptance") return createResearchAcceptanceConfigPair(value).site;
  const target = value.stage === "local" ? parseLocalTarget(value) : parseRemoteTarget(value);
  return {
    name: target.workerName,
    ...(target.stage === "shadow" ? {
      account_id: target.accountId,
      secrets: { required: [
        "BETTER_AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET",
      ] },
    } : {}),
    main: "./worker/index.ts",
    compatibility_date: "2026-05-15",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: target.stage === "shadow",
    preview_urls: false,
    assets: { binding: "ASSETS" },
    d1_databases: [{ binding: "DB", database_name: target.d1.databaseName, database_id: target.d1.databaseId }],
    r2_buckets: [{ binding: "PROOF_ASSETS", bucket_name: target.r2.bucketName },
      ...(target.stage === "local" ? [{ binding: "DOCUMENT_ASSETS", bucket_name: "arc-local-only-documents" }] : [])],
    ...(target.stage === "local" ? {
      services: [{ binding: "DOCUMENT_EXECUTOR", service: "arc-document-executor-local", entrypoint: "DocumentExecutorEntrypoint" }],
      triggers: { crons: ["*/5 * * * *"] },
    } : {}),
    vars: {
      ARC_ENVIRONMENT: target.stage === "shadow" ? "production" : "development",
      BETTER_AUTH_URL: target.runtimeOrigin,
      ARC_AI_ENABLED: "false",
      ARC_AI_RESEARCH_ENABLED: "false",
      ...(target.stage === "local" ? { ARC_DOCUMENTS_ENABLED: "false", ARC_DOCUMENT_ANALYSIS_ENABLED: "false", ARC_DOCUMENT_PLANNING_ENABLED: "false" } : {}),
    },
  };
}

// This module is also loaded directly by the offline Node build verifier.
const dedicatedName = z.string().max(63).regex(/^arc-materials-g1b-[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const restrictedIds = new Set([...protectedCloudflareDatabaseIds, "83a47917-a4f4-4121-baad-1032677f18a8",
  "12345678-1234-4123-8123-123456789abc", "87654321-4321-4321-8321-cba987654321"]);
export function isDedicatedMaterialsDatabaseId(id: string) {
  return !id.startsWith("00000000-") && !restrictedIds.has(id.toLowerCase());
}
const materialDb = z.strictObject({ name: dedicatedName, id: z.uuid().refine(isDedicatedMaterialsDatabaseId) });
const privateBucket = z.strictObject({ name: dedicatedName, public: z.literal(false) });
const publicId = z.string().max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const version = z.string().max(32).regex(/^\d{4}\.\d{2}\.\d+$/u);
const label = z.string().trim().min(1).max(100);
const micros = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const approvedAnalysis = z.strictObject({
  provider: label, model: z.string().trim().min(1).max(200), endpoint: z.url().max(2048), providerPolicyId: publicId,
  policyVersion: version, priceVersion: version, upstream: label, receiptRoute: documentReceiptRouteSchema,
  inputMicroUsdPerMillionTokens: micros, outputMicroUsdPerMillionTokens: micros,
  maxJobMicroUsd: micros, userDailyMicroUsd: micros, globalDailyMicroUsd: micros,
}).refine(x => {
  const reserve = (BigInt(16000) * BigInt(x.inputMicroUsdPerMillionTokens) + BigInt(4096) * BigInt(x.outputMicroUsdPerMillionTokens) + BigInt(999999)) / BigInt(1000000);
  return reserve <= BigInt(x.maxJobMicroUsd) && x.maxJobMicroUsd <= x.userDailyMicroUsd && x.userDailyMicroUsd <= x.globalDailyMicroUsd;
});
const resources = {
  stage: z.literal("materials-acceptance"), accountId: z.literal(ACCOUNT_ID),
  site: z.strictObject({ workerName: dedicatedName, origin: z.url(), executorEntrypoint: z.literal("DocumentExecutorEntrypoint"),
    authProviders: z.array(z.enum(["github", "google"])).min(1).max(2).refine(list => new Set(list).size === list.length),
    d1: materialDb, proofs: privateBucket, documents: privateBucket }),
  executor: z.strictObject({ workerName: dedicatedName, siteEntrypoint: z.literal("DocumentSite"), d1: materialDb,
    results: privateBucket, workflow: dedicatedName }),
};
const materialsSchema = z.discriminatedUnion("mode", [
  z.strictObject({ ...resources, mode: z.literal("closed") }),
  z.strictObject({ ...resources, mode: z.literal("synthetic"), analysis: approvedAnalysis, fakeTransport: dedicatedName }),
  z.strictObject({ ...resources, mode: z.literal("live"), analysis: approvedAnalysis, runId: publicId }),
]).refine(t => {
  const { site, executor } = t;
  const names = [site.workerName, executor.workerName, site.d1.name, executor.d1.name, site.proofs.name,
    site.documents.name, executor.results.name, executor.workflow, ...(t.mode === "synthetic" ? [t.fakeTransport] : [])];
  if (new Set(names).size !== names.length || site.d1.id.toLowerCase() === executor.d1.id.toLowerCase()
    || site.origin !== `https://${site.workerName}.23711031.workers.dev`) return false;
  if (t.mode === "closed") return true;
  if (t.mode === "live") return t.analysis.endpoint === "https://openrouter.ai/api/v1/chat/completions";
  const url = new URL(t.analysis.endpoint);
  return url.protocol === "https:" && url.hostname.endsWith(".invalid") && url.pathname.endsWith("/chat/completions")
    && !url.search && !url.hash && !url.username && !url.password;
});
export type MaterialsAcceptanceTarget = z.infer<typeof materialsSchema>;
export function parseMaterialsAcceptanceTarget(input: unknown): MaterialsAcceptanceTarget {
  try {
    // Strict Zod objects can skip an own __proto__ key. Inventory is JSON only.
    JSON.stringify(input, (key, value: unknown) => { if (key === "__proto__") throw new Error(); return value; });
    return materialsSchema.parse(input);
  } catch { throw new Error("Invalid materials acceptance target inventory."); }
}
export function createMaterialsAcceptanceConfigPair(input: unknown): {
  site: Partial<WorkerConfig>; executor: Partial<WorkerConfig>; fakeTransport?: Partial<WorkerConfig>;
} {
  const t = parseMaterialsAcceptanceTarget(input);
  const enabled = String(t.mode !== "closed");
  const vars: Record<string, string> = { ARC_ENVIRONMENT: "production", ARC_DOCUMENT_ACCEPTANCE_MODE: t.mode,
    ARC_DOCUMENTS_ENABLED: enabled, ARC_DOCUMENT_ANALYSIS_ENABLED: enabled, ARC_DOCUMENT_PLANNING_ENABLED: enabled };
  if (t.mode !== "closed") {
    const a = t.analysis;
    const routingPolicy = { policyVersion: a.policyVersion, providerOrder: [a.upstream], allowFallback: false, dataPolicy: "zdr-only" };
    const qualification = { qualified: true, endpoint: a.endpoint, model: a.model, providerPolicyId: a.providerPolicyId, priceVersion: a.priceVersion,
      routingPolicy, receiptRoute: a.receiptRoute, inputMicroUsdPerMillionTokens: a.inputMicroUsdPerMillionTokens,
      outputMicroUsdPerMillionTokens: a.outputMicroUsdPerMillionTokens, inputTokenBound: "utf8-bytes-plus-4096" };
    Object.assign(vars, { ARC_DOCUMENT_PROVIDER: a.provider, ARC_DOCUMENT_MODEL: a.model, ARC_DOCUMENT_PROVIDER_ENDPOINT: a.endpoint,
      ARC_DOCUMENT_PROVIDER_POLICY_ID: a.providerPolicyId, ARC_DOCUMENT_PRICE_VERSION: a.priceVersion,
      ARC_DOCUMENT_ROUTING_POLICY: JSON.stringify(routingPolicy), ARC_DOCUMENT_PROVIDER_QUALIFICATION: JSON.stringify(qualification),
      ARC_DOCUMENT_MAX_INPUT_TOKENS: "16000", ARC_DOCUMENT_MAX_OUTPUT_TOKENS: "4096", ARC_DOCUMENT_HTTP_TIMEOUT_MS: "180000",
      ARC_DOCUMENT_MAX_JOB_MICRO_USD: String(a.maxJobMicroUsd), ARC_DOCUMENT_USER_DAILY_MICRO_USD: String(a.userDailyMicroUsd),
      ARC_DOCUMENT_GLOBAL_DAILY_MICRO_USD: String(a.globalDailyMicroUsd) });
  }
  if (t.mode === "live") vars.ARC_DOCUMENT_ACCEPTANCE_RUN_ID = t.runId;
  const common = { account_id: t.accountId, compatibility_date: "2026-05-15", compatibility_flags: ["nodejs_compat"],
    preview_urls: false, triggers: { crons: ["*/5 * * * *"] } };
  return {
    site: { ...common, name: t.site.workerName, main: "./worker/index.ts", workers_dev: true, assets: { binding: "ASSETS" },
      d1_databases: [{ binding: "DB", database_name: t.site.d1.name, database_id: t.site.d1.id, migrations_dir: "drizzle" }],
      r2_buckets: [{ binding: "PROOF_ASSETS", bucket_name: t.site.proofs.name }, { binding: "DOCUMENT_ASSETS", bucket_name: t.site.documents.name }],
      services: [{ binding: "DOCUMENT_EXECUTOR", service: t.executor.workerName, entrypoint: t.site.executorEntrypoint }],
      secrets: { required: ["BETTER_AUTH_SECRET", ...t.site.authProviders.flatMap(provider =>
        [provider.toUpperCase() + "_CLIENT_ID", provider.toUpperCase() + "_CLIENT_SECRET"]), "ARC_DOCUMENT_BRIDGE_SECRET"] },
      vars: { ...vars, BETTER_AUTH_URL: t.site.origin, ARC_AI_ENABLED: "false", ARC_AI_RESEARCH_ENABLED: "false" } },
    executor: { ...common, name: t.executor.workerName, main: "./worker/document-executor/index.ts", workers_dev: false, routes: [],
      d1_databases: [{ binding: "DOCUMENT_EXECUTOR_DB", database_name: t.executor.d1.name, database_id: t.executor.d1.id, migrations_dir: "worker/document-executor/migrations" }],
      r2_buckets: [{ binding: "DOCUMENT_JOB_ASSETS", bucket_name: t.executor.results.name }],
      workflows: [{ binding: "DOCUMENT_WORKFLOW", name: t.executor.workflow, class_name: "DocumentWorkflow" }],
      services: [{ binding: "DOCUMENT_SITE", service: t.site.workerName, entrypoint: t.executor.siteEntrypoint },
        ...(t.mode === "synthetic" ? [{ binding: "DOCUMENT_PROVIDER_TRANSPORT", service: t.fakeTransport, entrypoint: "DocumentFakeTransport" }] : [])],
      secrets: { required: ["ARC_DOCUMENT_BRIDGE_SECRET", ...(t.mode === "live" ? ["ARC_DOCUMENT_PROVIDER_API_KEY"] : [])] },
      vars: { ...vars, ARC_DOCUMENT_MAINTENANCE_ENABLED: "true" } },
    ...(t.mode === "synthetic" ? { fakeTransport: {
      name: t.fakeTransport, main: "./worker/document-fake-transport/index.ts",
      account_id: t.accountId, compatibility_date: common.compatibility_date, workers_dev: false, preview_urls: false, routes: [],
      durable_objects: { bindings: [{ name: "SYNTHETIC_RECEIPTS", class_name: "DocumentSyntheticReceipts" }] },
      migrations: [{ tag: "v1", new_sqlite_classes: ["DocumentSyntheticReceipts"] }],
      vars: { SYNTHETIC_QUALIFICATION: vars.ARC_DOCUMENT_PROVIDER_QUALIFICATION! },
    } } : {}),
  };
}
