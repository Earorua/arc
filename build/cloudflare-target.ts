import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { WorkerConfig } from "@cloudflare/vite-plugin";
import { z } from "zod";

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
export type CloudflareTarget = RemoteCloudflareTarget | LocalCloudflareTarget;

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
  return explicit ? parseRemoteTarget(value) : parseLocalTarget(value);
}

export function createCloudflareConfig(value: CloudflareTarget): Partial<WorkerConfig> {
  const target = value.stage === "local" ? parseLocalTarget(value) : parseRemoteTarget(value);
  return {
    name: target.workerName,
    ...(target.stage === "shadow" ? { account_id: target.accountId } : {}),
    main: "./worker/index.ts",
    compatibility_date: "2026-05-15",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: target.stage === "shadow",
    preview_urls: false,
    assets: { binding: "ASSETS" },
    d1_databases: [{ binding: "DB", database_name: target.d1.databaseName, database_id: target.d1.databaseId }],
    r2_buckets: [{ binding: "PROOF_ASSETS", bucket_name: target.r2.bucketName }],
    vars: {
      ARC_ENVIRONMENT: target.stage === "shadow" ? "production" : "development",
      BETTER_AUTH_URL: target.runtimeOrigin,
      ARC_AI_ENABLED: "false",
      ARC_AI_RESEARCH_ENABLED: "false",
    },
  };
}
