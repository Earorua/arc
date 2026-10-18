// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCloudflareConfig, loadCloudflareTarget, parseRemoteTarget } from "../../build/cloudflare-target";

// Synthetic identities are used only to exercise offline validation.
const shadow = () => ({
  stage: "shadow",
  accountId: "54eaadb89014252836694203c1e22546",
  workerName: "arc-v8-migration-shadow-test",
  runtimeOrigin: "https://arc-v8-migration-shadow-test.23711031.workers.dev",
  d1: { databaseId: "12345678-1234-4123-8123-123456789abc", databaseName: "arc-v8-migration-test-db" },
  r2: { bucketName: "arc-v8-migration-test-proofs", public: false },
});
const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("standalone Cloudflare target", () => {
  it("builds a shadow SSR worker with assets, separate storage and closed AI", () => {
    const config = createCloudflareConfig(parseRemoteTarget(shadow()));
    expect(config).toMatchObject({
      name: shadow().workerName,
      account_id: shadow().accountId,
      main: "./worker/index.ts",
      assets: { binding: "ASSETS" },
      workers_dev: true,
      preview_urls: false,
      d1_databases: [{ binding: "DB", database_name: shadow().d1.databaseName, database_id: shadow().d1.databaseId }],
      r2_buckets: [{ binding: "PROOF_ASSETS", bucket_name: shadow().r2.bucketName }],
      vars: { ARC_ENVIRONMENT: "production", BETTER_AUTH_URL: shadow().runtimeOrigin, ARC_AI_ENABLED: "false", ARC_AI_RESEARCH_ENABLED: "false" },
    });
    expect(config.secrets).toEqual({ required: [
      "BETTER_AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET",
    ] });
    expect(config).not.toHaveProperty("images");
    expect(config).not.toHaveProperty("routes");
  });

  it("creates a fresh required-name array for each shadow config", () => {
    const first = createCloudflareConfig(parseRemoteTarget(shadow()));
    const second = createCloudflareConfig(parseRemoteTarget(shadow()));
    expect(first.secrets).toEqual(second.secrets);
    expect(first.secrets).not.toBe(second.secrets);
    expect(first.secrets?.required).not.toBe(second.secrets?.required);
  });

  it.each([
    ["stage", "production"], ["stage", "local"], ["accountId", "00000000000000000000000000000000"],
    ["workerName", "arc-v8-migration-smoke-test"], ["workerName", "arc-v8-migration-shadow-"],
    ["routes", []], ["custom_domains", []], ["triggers", {}], ["services", []], ["workflows", []],
    ["OPENROUTER_API_KEY", "synthetic-secret"], ["vars", { ARC_AI_RESEARCH_ENABLED: "true" }],
    ["secrets", { required: ["BETTER_AUTH_SECRET"] }],
  ])("rejects invalid or unrecognized field %s", (key, value) => {
    expect(() => parseRemoteTarget({ ...shadow(), [key]: value })).toThrow();
  });

  it.each([
    "http://arc-v8-migration-shadow-test.23711031.workers.dev",
    "https://arcmaps.net", "https://arc-v8-migration-shadow-other.23711031.workers.dev",
    "https://arc-v8-migration-shadow-test.other.workers.dev",
    "https://arc-v8-migration-shadow-test.23711031.workers.dev.evil.test",
    "https://user:password@arc-v8-migration-shadow-test.23711031.workers.dev",
    "https://arc-v8-migration-shadow-test.23711031.workers.dev/",
    "https://arc-v8-migration-shadow-test.23711031.workers.dev/path",
    "https://arc-v8-migration-shadow-test.23711031.workers.dev?x=1",
    "https://arc-v8-migration-shadow-test.23711031.workers.dev#fragment",
    "https://arc-v8-migration-shadow-test.23711031.workers.dev:443",
  ])("rejects non-exact shadow origin %s", (runtimeOrigin) => {
    expect(() => parseRemoteTarget({ ...shadow(), runtimeOrigin })).toThrow();
  });

  it.each([
    undefined,
    { databaseId: "not-a-uuid", databaseName: "arc-v8-migration-test-db" },
    ...["00000000-0000-4000-8000-000000000000", "fe4952d0-da78-4c85-b1fa-8a5706d42fa3", "81d44533-40d9-4544-a03d-81a01e2719ae"]
      .map((databaseId) => ({ databaseId, databaseName: "arc-v8-migration-test-db" })),
    { databaseId: shadow().d1.databaseId, databaseName: "site-creator-d1" },
    { databaseId: shadow().d1.databaseId, databaseName: "arc-v8-migration-smoke-db" },
    { ...shadow().d1, binding: "OTHER_DB" },
    { ...shadow().d1, token: "synthetic-secret" },
  ])("rejects missing, reused or extended database identity %#", (d1) => {
    expect(() => parseRemoteTarget({ ...shadow(), d1 })).toThrow();
  });

  it.each([
    undefined, { bucketName: "site-creator-r2", public: false },
    { bucketName: "arc-v8-migration-smoke-proofs", public: false },
    { ...shadow().r2, public: true }, { ...shadow().r2, accessKey: "synthetic-secret" },
  ])("rejects missing, reused, public or extended bucket identity %#", (r2) => {
    expect(() => parseRemoteTarget({ ...shadow(), r2 })).toThrow();
  });

  it("defaults only to an unmistakably local inventory that remote validation refuses", async () => {
    const local = await loadCloudflareTarget();
    expect(local.stage).toBe("local");
    expect(() => parseRemoteTarget(local)).toThrow();
    const config = createCloudflareConfig(local);
    expect(config.name).toBe("arc-local-only");
    expect(config.workers_dev).toBe(false);
    expect(config).not.toHaveProperty("account_id");
    expect(config).not.toHaveProperty("secrets");
    expect(config.vars).toMatchObject({ ARC_ENVIRONMENT: "development", ARC_AI_ENABLED: "false", ARC_AI_RESEARCH_ENABLED: "false" });
  });

  it("loads an explicit non-secret shadow JSON, with no fallback for any invalid file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "arc-target-test-"));
    temporaryDirectories.push(directory);
    const targetPath = join(directory, "target.json");
    await expect(loadCloudflareTarget({ targetPath })).rejects.toThrow();
    await expect(loadCloudflareTarget({ targetPath: "" })).rejects.toThrow();
    await writeFile(targetPath, "invalid JSON");
    await expect(loadCloudflareTarget({ targetPath })).rejects.toThrow();
    await writeFile(targetPath, JSON.stringify({ ...shadow(), secret: "synthetic-secret" }));
    await expect(loadCloudflareTarget({ targetPath })).rejects.toThrow();
    await writeFile(targetPath, JSON.stringify(await loadCloudflareTarget()));
    await expect(loadCloudflareTarget({ targetPath })).rejects.toThrow();
    await writeFile(targetPath, JSON.stringify(shadow()));
    await expect(loadCloudflareTarget({ targetPath })).resolves.toEqual(shadow());
  });
});
