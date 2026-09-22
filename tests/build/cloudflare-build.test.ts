// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkCloudflareBuild } from "../../scripts/check-cloudflare-build.mjs";

const script = resolve("scripts/check-cloudflare-build.mjs");
const temporaryDirectories: string[] = [];
const target = {
  stage: "shadow", accountId: "54eaadb89014252836694203c1e22546", workerName: "arc-v8-migration-shadow-test",
  runtimeOrigin: "https://arc-v8-migration-shadow-test.23711031.workers.dev",
  d1: { databaseId: "12345678-1234-4123-8123-123456789abc", databaseName: "arc-v8-migration-test-db" },
  r2: { bucketName: "arc-v8-migration-test-proofs", public: false },
};
// Based on the actual manifest produced by locked Cloudflare Vite plugin 1.37.1.
function manifest(): Record<string, unknown> {
  return {
    topLevelName: target.workerName, name: target.workerName, account_id: target.accountId,
    dev: { ip: "127.0.0.1", local_protocol: "http", upstream_protocol: "http", enable_containers: true, generate_types: false },
    compatibility_date: "2026-05-15", compatibility_flags: ["nodejs_compat"],
    vars: { ARC_ENVIRONMENT: "production", BETTER_AUTH_URL: target.runtimeOrigin, ARC_AI_ENABLED: "false", ARC_AI_RESEARCH_ENABLED: "false" },
    durable_objects: { bindings: [] }, kv_namespaces: [], queues: { producers: [], consumers: [] },
    r2_buckets: [{ binding: "PROOF_ASSETS", bucket_name: target.r2.bucketName }],
    d1_databases: [{ binding: "DB", database_name: target.d1.databaseName, database_id: target.d1.databaseId }],
    vectorize: [], ai_search_namespaces: [], ai_search: [], hyperdrive: [], workflows: [], secrets_store_secrets: [],
    artifacts: [], services: [], analytics_engine_datasets: [], unsafe_hello_world: [], flagship: [], ratelimits: [], worker_loaders: [],
    legacy_env: true, main: "index.js", workers_dev: true, preview_urls: false,
    jsx_factory: "React.createElement", jsx_fragment: "React.Fragment", migrations: [], triggers: {},
    rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }], build: { watch_dir: "./src" }, no_bundle: true,
    dispatch_namespaces: [], logfwdr: { bindings: [] }, assets: { binding: "ASSETS", directory: "../client" },
    observability: { enabled: true }, python_modules: { exclude: ["**/*.pyc"] }, define: {}, cloudchamber: {},
    send_email: [], mtls_certificates: [], pipelines: [], vpc_services: [], vpc_networks: [],
  };
}
async function fixture(config: Record<string, unknown> = manifest()) {
  const rootDirectory = await mkdtemp(join(tmpdir(), "arc-build-test-"));
  temporaryDirectories.push(rootDirectory);
  await mkdir(join(rootDirectory, "dist/server"), { recursive: true });
  await mkdir(join(rootDirectory, "dist/client/assets"), { recursive: true });
  const targetPath = join(rootDirectory, "target.json");
  await writeFile(targetPath, JSON.stringify(target));
  await writeFile(join(rootDirectory, "dist/server/wrangler.json"), JSON.stringify(config));
  await writeFile(join(rootDirectory, "dist/server/index.js"), "export default { fetch() { return new Response('SSR'); } };");
  await writeFile(join(rootDirectory, "dist/client/assets/app.js"), "export {};");
  await writeFile(join(rootDirectory, "dist/client/assets/app.css"), "body{margin:0}");
  return { rootDirectory, targetPath };
}
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("read-only Cloudflare artifact preflight", () => {
  it("accepts the inspected framework defaults and exact shadow bindings without changing files", async () => {
    const options = await fixture();
    const configPath = join(options.rootDirectory, "dist/server/wrangler.json");
    const before = await readFile(configPath, "utf8");
    await expect(checkCloudflareBuild(options)).resolves.toEqual({ stage: "shadow", workerName: target.workerName });
    expect(await readFile(configPath, "utf8")).toBe(before);
  });

  it.each([
    ["name", "arc-local-only"], ["account_id", "other-account"], ["main", "../client/app.js"],
    ["d1_databases", [{ binding: "DB", database_id: "81d44533-40d9-4544-a03d-81a01e2719ae", database_name: target.d1.databaseName }]],
    ["d1_databases", []], ["r2_buckets", [{ binding: "PROOF_ASSETS", bucket_name: "other-bucket" }]],
    ["r2_buckets", [{ binding: "PUBLIC", bucket_name: target.r2.bucketName }]],
    ["assets", { binding: "ASSETS", directory: "../../public" }],
    ["services", [{ binding: "OTHER", service: "live" }]], ["triggers", { crons: ["* * * * *"] }],
    ["workflows", [{ binding: "WORKFLOW", name: "live", class_name: "Research" }]],
    ["routes", [{ pattern: "arcmaps.net", custom_domain: true }]], ["custom_domains", ["arcmaps.net"]],
    ["images", { binding: "IMAGES" }], ["unsafe", { bindings: [{ type: "secret_text", name: "SECRET", text: "do-not-print-this" }] }],
    ["secrets", ["OPENROUTER_API_KEY"]], ["future_operational_binding", {}], ["preview_urls", true],
    ["build", { command: "deploy-something" }], ["durable_objects", { bindings: [{ name: "DO", class_name: "Background" }] }],
  ])("rejects altered or unexpected generated field %s", async (key, value) => {
    await expect(checkCloudflareBuild(await fixture({ ...manifest(), [key]: value }))).rejects.toThrow();
  });

  it.each([
    ["ARC_AI_ENABLED", "true"], ["ARC_AI_RESEARCH_ENABLED", "true"], ["ARC_ENVIRONMENT", "development"],
    ["BETTER_AUTH_URL", "https://arcmaps.net"], ["OPENROUTER_API_KEY", "do-not-print-this"],
  ])("rejects altered or secret-like runtime var %s", async (key, value) => {
    const config = manifest();
    config.vars = { ...(config.vars as object), [key]: value };
    await expect(checkCloudflareBuild(await fixture(config))).rejects.toThrow();
  });

  it("requires an explicit valid shadow inventory even with valid-looking artifacts", async () => {
    const options = await fixture();
    await expect(checkCloudflareBuild({ rootDirectory: options.rootDirectory })).rejects.toThrow();
    for (const text of ["bad-json", JSON.stringify({ ...target, secret: "do-not-print-this" }), JSON.stringify({ stage: "local" })]) {
      await writeFile(options.targetPath, text);
      await expect(checkCloudflareBuild(options)).rejects.toThrow();
    }
  });

  it.each(["dist/server/index.js", "dist/client/assets/app.js", "dist/client/assets/app.css", "dist/server/wrangler.json"])("rejects missing artifact %s", async (path) => {
    const options = await fixture();
    await rm(join(options.rootDirectory, path));
    await expect(checkCloudflareBuild(options)).rejects.toThrow();
  });

  it("rejects an empty SSR entry and Sites metadata inside deployed assets", async () => {
    const options = await fixture();
    await writeFile(join(options.rootDirectory, "dist/server/index.js"), "");
    await expect(checkCloudflareBuild(options)).rejects.toThrow();
    await writeFile(join(options.rootDirectory, "dist/server/index.js"), "export default {};");
    await mkdir(join(options.rootDirectory, "dist/.openai"));
    await expect(checkCloudflareBuild(options)).resolves.toEqual({ stage: "shadow", workerName: target.workerName });
    await mkdir(join(options.rootDirectory, "dist/client/.openai"));
    await expect(checkCloudflareBuild(options)).rejects.toThrow();
  });

  it("CLI returns bounded, non-secret failure and nonzero exit, or a concise success", async () => {
    const options = await fixture();
    const run = (...args: string[]) => spawnSync(process.execPath, ["--experimental-strip-types", script, ...args], { cwd: options.rootDirectory, encoding: "utf8" });
    const success = run(options.targetPath);
    expect(success.status).toBe(0);
    expect(success.stdout).toContain("Shadow build preflight passed");
    expect(run().status).toBe(1);
    await writeFile(options.targetPath, JSON.stringify({ ...target, OPENROUTER_API_KEY: "do-not-print-this" }));
    const failure = run(options.targetPath);
    expect(failure.status).toBe(1);
    expect(failure.stderr).not.toContain("do-not-print-this");
    expect(failure.stderr.length).toBeLessThan(512);
  });
});
