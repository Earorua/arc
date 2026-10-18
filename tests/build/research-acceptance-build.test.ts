// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkCloudflareBuild } from "../../scripts/check-cloudflare-build.mjs";
import syntheticInventory from "../fixtures/build/research-acceptance.json";

// Synthetic inventories and artifact stubs only: this suite never builds or deploys.
type State = "closed" | "active" | "draining";
const script = resolve("scripts/check-cloudflare-build.mjs");
const temporaryDirectories: string[] = [];
const requiredSecretNames = [
  "BETTER_AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET",
  "ARC_AI_IP_HASH_SALT", "ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX", "ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX",
];

// Locked Cloudflare Vite plugin 1.37.1 defaults inspected for the accepted shadow
// manifest. These independent literals keep the full normalization contract visible.
const inspectedDefaults = {
  dev: { ip: "127.0.0.1", local_protocol: "http", upstream_protocol: "http", enable_containers: true, generate_types: false },
  durable_objects: { bindings: [] }, kv_namespaces: [], queues: { producers: [], consumers: [] },
  vectorize: [], ai_search_namespaces: [], ai_search: [], hyperdrive: [], workflows: [], secrets_store_secrets: [],
  artifacts: [], services: [], analytics_engine_datasets: [], unsafe_hello_world: [], flagship: [], ratelimits: [], worker_loaders: [],
  legacy_env: true, jsx_factory: "React.createElement", jsx_fragment: "React.Fragment", migrations: [], triggers: {},
  rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }], build: { watch_dir: "./src" }, no_bundle: true,
  dispatch_namespaces: [], logfwdr: { bindings: [] }, observability: { enabled: true },
  python_modules: { exclude: ["**/*.pyc"] }, define: {}, cloudchamber: {},
  send_email: [], mtls_certificates: [], pipelines: [], vpc_services: [], vpc_networks: [],
};

// Do not derive this expectation from the production generator under test.
function manifest(state: State = "closed"): Record<string, unknown> {
  return {
    ...structuredClone(inspectedDefaults),
    topLevelName: "arc-v8-migration-research-test-site", name: "arc-v8-migration-research-test-site",
    account_id: "54eaadb89014252836694203c1e22546", main: "index.js",
    compatibility_date: "2026-05-15", compatibility_flags: ["nodejs_compat"], workers_dev: true, preview_urls: false,
    assets: { binding: "ASSETS", directory: "../client" },
    d1_databases: [{ binding: "DB", database_name: "arc-v8-migration-research-test-site-db", database_id: "12345678-1234-4123-8123-123456789abc" }],
    r2_buckets: [{ binding: "PROOF_ASSETS", bucket_name: "arc-v8-migration-research-test-proofs" }],
    services: [{ binding: "ARC_RESEARCH_EXECUTOR", service: "arc-v8-migration-research-test-executor" }],
    secrets: { required: [...requiredSecretNames] },
    vars: {
      BETTER_AUTH_URL: "https://arc-v8-migration-research-test-site.23711031.workers.dev",
      ARC_AI_RESEARCH_EXECUTOR_URL: "https://arc-v8-migration-research-test-executor.23711031.workers.dev",
      ARC_AI_RESEARCH_BRIDGE_TRANSPORT: "service-binding-v1",
      ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID: "synthetic-site", ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID: "synthetic-executor",
      ARC_ENVIRONMENT: "production", ARC_AI_ENABLED: String(state === "active"), ARC_AI_RESEARCH_ENABLED: String(state === "active"),
      ARC_AI_RESEARCH_EXECUTOR: "cloudflare-workflow-v1", ARC_AI_RESEARCH_PROFILE: "kimi-low-output32k-v3",
      ARC_AI_MODEL_RESEARCH: "moonshotai/kimi-k3", ARC_AI_MODEL_ECONOMY: "moonshotai/kimi-k3",
      ARC_AI_RESEARCH_TIMEOUT_MS: "1200000", ARC_AI_REPAIR_TIMEOUT_MS: "10000", ARC_AI_RESEARCH_CACHE_DAYS: "14",
      ARC_AI_USER_DAILY_QUOTA: "1", ARC_AI_RATE_LIMIT_PER_MINUTE: "1", ARC_AI_SITE_DAILY_BUDGET_MICROS: "5000000",
      ARC_AI_SITE_MONTHLY_BUDGET_MICROS: "5000000", ARC_AI_RESEARCH_MAX_COST_MICROS: "5000000", ARC_AI_REPAIR_MAX_COST_MICROS: "0",
    },
  };
}

async function fixture(state: State = "closed", config = manifest(state)) {
  const rootDirectory = await mkdtemp(join(tmpdir(), "arc-research-build-test-"));
  temporaryDirectories.push(rootDirectory);
  await mkdir(join(rootDirectory, "dist/server"), { recursive: true });
  await mkdir(join(rootDirectory, "dist/client/assets"), { recursive: true });
  const targetPath = join(rootDirectory, "target.json");
  await writeFile(targetPath, JSON.stringify({ ...syntheticInventory, state }));
  await writeFile(join(rootDirectory, "dist/server/wrangler.json"), JSON.stringify(config));
  await writeFile(join(rootDirectory, "dist/server/index.js"), "export default { fetch() { return new Response('synthetic'); } };");
  await writeFile(join(rootDirectory, "dist/client/assets/app.js"), "export {};");
  await writeFile(join(rootDirectory, "dist/client/assets/app.css"), "body{margin:0}");
  return { rootDirectory, targetPath };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function nestedObjects(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [];
  return [
    ...(Array.isArray(value) ? [] : [prefix]),
    ...Object.entries(value).flatMap(([key, child]) => nestedObjects(child, prefix ? `${prefix}.${key}` : key)),
  ];
}

describe("read-only restricted Research Site artifact preflight", () => {
  it.each(["closed", "active", "draining"] as const)("accepts the exact %s Site manifest without rewriting files", async (state) => {
    const options = await fixture(state);
    const path = join(options.rootDirectory, "dist/server/wrangler.json");
    const before = await readFile(path, "utf8");
    await expect(checkCloudflareBuild(options)).resolves.toEqual({
      stage: "research-acceptance", workerName: syntheticInventory.site.workerName,
    });
    expect(await readFile(path, "utf8")).toBe(before);
  });

  it.each([
    ["closed", "active"], ["active", "closed"], ["active", "draining"], ["draining", "active"],
  ] as const)("rejects inventory %s with Site admission flags for %s", async (inventoryState, manifestState) => {
    await expect(checkCloudflareBuild(await fixture(inventoryState, manifest(manifestState)))).rejects.toThrow();
  });

  const alteredFields: Array<[string, unknown]> = [
    ["name", "arc-local-only"], ["topLevelName", syntheticInventory.executor.workerName], ["account_id", "other-account"],
    ["main", "../client/app.js"], ["compatibility_date", "2026-01-01"], ["compatibility_flags", []],
    ["workers_dev", false], ["preview_urls", true], ["keep_vars", true], ["assets", { binding: "ASSETS", directory: "../../public" }],
    ["d1_databases", []], ["d1_databases", [{ binding: "DB", database_name: syntheticInventory.site.d1.databaseName, database_id: syntheticInventory.executor.d1.databaseId }]],
    ["d1_databases", [...manifest().d1_databases as object[], { binding: "EXECUTOR_DB", database_id: syntheticInventory.executor.d1.databaseId }]],
    ["r2_buckets", []], ["r2_buckets", [{ binding: "PROOF_ASSETS", bucket_name: syntheticInventory.executor.r2.bucketName }]],
    ["r2_buckets", [...manifest().r2_buckets as object[], { binding: "EXECUTOR_RECEIPTS", bucket_name: syntheticInventory.executor.r2.bucketName }]],
    ["services", []], ["services", [{ binding: "ARC_RESEARCH_EXECUTOR", service: syntheticInventory.site.workerName }]],
    ["services", [{ binding: "WRONG", service: syntheticInventory.executor.workerName }]],
    ["services", [...manifest().services as object[], { binding: "EXTRA", service: "arc-v8-migration-other" }]],
    ["routes", []], ["routes", [{ pattern: "arcmaps.net", custom_domain: true }]], ["custom_domains", ["arcmaps.net"]],
    ["triggers", { crons: [] }], ["triggers", { crons: ["* * * * *"] }],
    ["workflows", [{ binding: "RESEARCH_WORKFLOW", name: syntheticInventory.executor.workflowName, class_name: "ResearchWorkflow" }]],
    ["unsafe", { bindings: [{ type: "secret_text", name: "SECRET", text: "synthetic-do-not-print" }] }],
    ["future_operational_binding", {}], ["build", { command: "deploy-something" }],
  ];
  it.each(alteredFields)("rejects altered resource or runtime field %s (%#)", async (key, value) => {
    await expect(checkCloudflareBuild(await fixture("closed", { ...manifest(), [key]: value }))).rejects.toThrow();
  });

  it.each([
    ["ARC_AI_ENABLED", "true"], ["ARC_AI_RESEARCH_ENABLED", "true"], ["ARC_ENVIRONMENT", "development"],
    ["ARC_AI_RESEARCH_BRIDGE_TRANSPORT", "http-hmac-v1"], ["ARC_AI_RESEARCH_EXECUTOR", "synchronous"],
    ["ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID", "synthetic-rotated"], ["ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID", "synthetic-rotated"],
    ["BETTER_AUTH_URL", "https://arcmaps.net"], ["ARC_AI_RESEARCH_EXECUTOR_URL", "https://other.example"],
    ["ARC_AI_RESEARCH_PROFILE", "other-profile"], ["ARC_AI_MODEL_RESEARCH", "other/model"], ["ARC_AI_MODEL_ECONOMY", "other/model"],
    ["ARC_AI_RESEARCH_TIMEOUT_MS", "1200001"], ["ARC_AI_REPAIR_TIMEOUT_MS", "10001"], ["ARC_AI_RESEARCH_CACHE_DAYS", "15"],
    ["ARC_AI_USER_DAILY_QUOTA", "2"], ["ARC_AI_RATE_LIMIT_PER_MINUTE", "2"],
    ["ARC_AI_SITE_DAILY_BUDGET_MICROS", "5000001"], ["ARC_AI_SITE_MONTHLY_BUDGET_MICROS", "5000001"],
    ["ARC_AI_RESEARCH_MAX_COST_MICROS", "5000001"], ["ARC_AI_REPAIR_MAX_COST_MICROS", "1"],
    ["BETTER_AUTH_SECRET", "synthetic-do-not-print"], ["OPENROUTER_API_KEY", "synthetic-do-not-print"],
    ["ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX", "01".repeat(32)], ["ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX", "02".repeat(32)],
    ["ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED", "true"],
  ])("rejects altered or plaintext runtime var %s", async (key, value) => {
    const config = manifest();
    config.vars = { ...config.vars as object, [key]: value };
    await expect(checkCloudflareBuild(await fixture("closed", config))).rejects.toThrow();
  });

  it.each(requiredSecretNames)("rejects missing required secret name %s", async (name) => {
    const config = manifest();
    config.secrets = { required: requiredSecretNames.filter((key) => key !== name) };
    await expect(checkCloudflareBuild(await fixture("closed", config))).rejects.toThrow();
  });

  it.each([
    undefined, { required: [] }, { required: [...requiredSecretNames, "OPENROUTER_API_KEY"] },
    { required: [...requiredSecretNames, requiredSecretNames[0]] }, { required: [...requiredSecretNames].reverse() },
    { required: { BETTER_AUTH_SECRET: "synthetic-do-not-print" } },
    { required: requiredSecretNames, values: { BETTER_AUTH_SECRET: "synthetic-do-not-print" } },
  ])("rejects malformed or extra secret declarations %#", async (secrets) => {
    const config = manifest();
    if (secrets === undefined) delete config.secrets;
    else config.secrets = secrets;
    await expect(checkCloudflareBuild(await fixture("closed", config))).rejects.toThrow();
  });

  it.each(nestedObjects(manifest()))("rejects unknown keys in manifest object %s", async (path) => {
    const config = manifest();
    const nested = path.split(".").filter(Boolean).reduce<Record<string, unknown>>(
      (value, key) => value[key] as Record<string, unknown>, config,
    );
    nested.synthetic_unknown = "synthetic-do-not-print";
    await expect(checkCloudflareBuild(await fixture("closed", config))).rejects.toThrow();
  });

  it("requires an explicit remote inventory, with no local/default fallback", async () => {
    const options = await fixture();
    await expect(checkCloudflareBuild({ rootDirectory: options.rootDirectory })).rejects.toThrow();
    await expect(checkCloudflareBuild({ ...options, targetPath: "" })).rejects.toThrow();
    const local = JSON.parse(await readFile(resolve("cloudflare.local.json"), "utf8"));
    for (const value of [local, { ...syntheticInventory, state: "unknown" }, { ...syntheticInventory, secret: "synthetic-do-not-print" }]) {
      await writeFile(options.targetPath, JSON.stringify(value));
      await expect(checkCloudflareBuild(options)).rejects.toThrow();
    }
  });

  it.each(["dist/server/index.js", "dist/client/assets/app.js", "dist/client/assets/app.css", "dist/server/wrangler.json"])
    ("still checks the full artifact set: %s", async (path) => {
      const options = await fixture();
      await rm(join(options.rootDirectory, path));
      await expect(checkCloudflareBuild(options)).rejects.toThrow();
    });

  it("still rejects empty server artifacts and packaged Sites metadata", async () => {
    const options = await fixture();
    await writeFile(join(options.rootDirectory, "dist/server/index.js"), "");
    await expect(checkCloudflareBuild(options)).rejects.toThrow();
    await writeFile(join(options.rootDirectory, "dist/server/index.js"), "export default {};");
    await mkdir(join(options.rootDirectory, "dist/client/.openai"));
    await expect(checkCloudflareBuild(options)).rejects.toThrow();
  });

  it("runs native Node strip-types imports and bounds CLI output without secrets", async () => {
    const options = await fixture();
    const run = (...args: string[]) => spawnSync(process.execPath, ["--experimental-strip-types", script, ...args], {
      cwd: options.rootDirectory, encoding: "utf8",
    });
    const success = run(options.targetPath);
    expect(success.status).toBe(0);
    expect(success.stdout).toContain("Restricted Research build preflight passed");
    expect(success.stdout).toContain(syntheticInventory.site.workerName);
    expect(success.stderr).toBe("");
    const failures = [run(), run(options.targetPath, "extra")];
    await writeFile(options.targetPath, JSON.stringify({ ...syntheticInventory, secret: "synthetic-do-not-print" }));
    failures.push(run(options.targetPath));
    await writeFile(options.targetPath, "synthetic-do-not-print malformed JSON");
    failures.push(run(options.targetPath));
    await writeFile(options.targetPath, JSON.stringify(syntheticInventory));
    const config = manifest();
    config.secrets = { required: requiredSecretNames, BETTER_AUTH_SECRET: "synthetic-do-not-print" };
    await writeFile(join(options.rootDirectory, "dist/server/wrangler.json"), JSON.stringify(config));
    failures.push(run(options.targetPath));
    for (const failure of failures) {
      expect(failure.status).toBe(1);
      expect(failure.stdout).toBe("");
      expect(failure.stderr).not.toContain("synthetic-do-not-print");
      expect(failure.stderr).not.toContain(options.rootDirectory);
      expect(failure.stderr.length).toBeLessThan(512);
    }
  });
});
