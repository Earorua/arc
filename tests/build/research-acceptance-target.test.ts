// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCloudflareConfig, loadCloudflareTarget, parseRemoteTarget } from "../../build/cloudflare-target";
import {
  createResearchAcceptanceConfigPair, parseResearchAcceptanceTarget, type ResearchAcceptanceTarget,
} from "../../build/research-acceptance-target";
import { readResearchPolicyConfiguration } from "../../app/server/research/production-policy";
import { readResearchBridgeConnection } from "../../app/server/research/executor/connection-config";
import syntheticInventory from "../fixtures/build/research-acceptance.json";

// This closed fixture contains synthetic identities for offline validation only.
// It must never be used as an operational target or evidence of resource readiness.
const fixturePath = "tests/fixtures/build/research-acceptance.json";
const inventory = () => structuredClone(syntheticInventory);
const invalidMessage = "Invalid restricted Research target inventory.";
const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function atPath(value: object, path: string): Record<string, unknown> {
  return path.split(".").filter(Boolean).reduce<Record<string, unknown>>(
    (current, key) => current[key] as Record<string, unknown>, value as Record<string, unknown>,
  );
}
function changed(path: string, value: unknown) {
  const target = inventory();
  const keys = path.split(".");
  const key = keys.pop()!;
  atPath(target, keys.join("."))[key] = value;
  return target;
}
function jsonWithUnknownPrototype(path: string): string {
  const nested = atPath(inventory(), path);
  // JSON.parse creates an own JSON property; an object literal would set a prototype.
  const replacement = JSON.parse(JSON.stringify(nested).replace(
    /^\{/u, '{"__proto__":{"secret":"synthetic-q1-do-not-print"},',
  ));
  return JSON.stringify(path ? changed(path, replacement) : replacement);
}
function requiredPaths(value: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return [path, ...(child && typeof child === "object" ? requiredPaths(child as Record<string, unknown>, path) : [])];
  });
}
const objectPaths = ["", "site", "site.d1", "site.r2", "executor", "executor.d1", "executor.r2", "bridge"];
const siteNamePaths = ["site.workerName", "site.d1.databaseName", "site.r2.bucketName"];
const executorNamePaths = ["executor.workerName", "executor.d1.databaseName", "executor.r2.bucketName", "executor.workflowName"];
const namePaths = [...siteNamePaths, ...executorNamePaths];
const excludedDatabaseIds = [
  "00000000-0000-4000-8000-000000000000", "fe4952d0-da78-4c85-b1fa-8a5706d42fa3",
  "81d44533-40d9-4544-a03d-81a01e2719ae", "0b832b24-7ece-46f6-9899-59a755bead6b",
  "d52456da-a78f-4765-9e56-4a7d2ad92a4b", "eee6702f-ad59-45c8-bcfe-aec09aebcdd4",
  "eb8a443d-53ca-4fab-b028-ae03b03b6a2a", "eda666b8-6d49-4c3b-aa45-59eb9ff2bf74",
  "a480e7d5-c008-46da-99bf-ca2422c06621",
];

describe("restricted Research target", () => {
  it("loads an explicit Research inventory and selects the private Executor service", async () => {
    const target = await loadCloudflareTarget({ targetPath: fixturePath });
    expect(target.stage).toBe("research-acceptance");
    expect(createCloudflareConfig(target).services).toEqual([
      { binding: "ARC_RESEARCH_EXECUTOR", service: "arc-v8-migration-research-test-executor" },
    ]);
  });

  it.each(["closed", "active", "draining"] as const)("parses the required %s state without changing the inventory", (state) => {
    const value = { ...inventory(), state };
    const parsed: ResearchAcceptanceTarget = parseResearchAcceptanceTarget(value);
    expect(parsed).toEqual(value);
    expect(parsed).not.toBe(value);
    expect(parsed.site).not.toBe(value.site);
  });

  it.each(objectPaths)("rejects unknown keys at strict object %s", (path) => {
    const value = inventory();
    atPath(value, path).secret = "synthetic-do-not-print";
    expect(() => parseResearchAcceptanceTarget(value)).toThrow(new Error(invalidMessage));
    expect(() => createResearchAcceptanceConfigPair(value)).toThrow(new Error(invalidMessage));
  });

  it.each(objectPaths.flatMap((path) => [
    { path, name: "parser", parse: parseResearchAcceptanceTarget },
    { path, name: "paired generator", parse: createResearchAcceptanceConfigPair },
  ]))("Q1 rejects own JSON __proto__ at $path through the $name", ({ path, parse }) => {
    const value = JSON.parse(jsonWithUnknownPrototype(path));
    const nested = atPath(value, path);
    expect(Object.hasOwn(nested, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(nested, "__proto__")?.enumerable).toBe(true);
    expect(() => parse(value)).toThrow(new Error(invalidMessage));
  });

  it.each(objectPaths)("Q1 rejects own JSON __proto__ at %s through a native loader file", async (path) => {
    const directory = await mkdtemp(join(tmpdir(), "arc-q1-target-test-"));
    temporaryDirectories.push(directory);
    const targetPath = join(directory, "target.json");
    await writeFile(targetPath, jsonWithUnknownPrototype(path));
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `
      import { loadCloudflareTarget } from './build/cloudflare-target.ts';
      try {
        await loadCloudflareTarget({ targetPath: process.argv[1] });
        console.log('Unexpected inventory acceptance.');
        process.exitCode = 2;
      } catch (error) {
        console.error(error instanceof Error ? error.message : 'Unexpected non-Error failure.');
        process.exitCode = 1;
      }
    `, targetPath], { cwd: process.cwd(), encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe(invalidMessage);
    expect(result.stderr).not.toContain("synthetic-q1-do-not-print");
  });

  it.each(requiredPaths(syntheticInventory))("requires field %s without a default", (path) => {
    const value = inventory();
    const keys = path.split(".");
    delete atPath(value, keys.slice(0, -1).join("."))[keys.at(-1)!];
    expect(() => parseResearchAcceptanceTarget(value)).toThrow(new Error(invalidMessage));
  });

  it.each([
    undefined, null, false, 1, "synthetic-do-not-print", [],
    changed("stage", "shadow"), changed("stage", "production"), changed("stage", "Research-acceptance"),
    changed("accountId", "00000000000000000000000000000000"), changed("state", "paused"),
    changed("bridge.transport", "http-hmac-v1"),
  ])("rejects malformed roots and non-exact selectors %#", (value) => {
    expect(() => parseResearchAcceptanceTarget(value)).toThrow(new Error(invalidMessage));
  });

  it.each(namePaths)("enforces format, length and the smoke exclusion on %s", (path) => {
    for (const name of [
      "", "arc-local-only", "arc-v8-migration-", "arc-v8-migration-A", "arc-v8-migration-a_1",
      "arc-v8-migration-a--b", "arc-v8-migration-a-", "arc-v8-migration-smoke-test",
      "arc-v8-migration-presmoked", "arc-v8-migration-a\n", " arc-v8-migration-a",
      `arc-v8-migration-${"a".repeat(47)}`,
    ]) expect(() => parseResearchAcceptanceTarget(changed(path, name))).toThrow(new Error(invalidMessage));
    const target = changed(path, `arc-v8-migration-${"a".repeat(46)}`);
    if (path.endsWith("workerName")) {
      const role = path.startsWith("site") ? target.site : target.executor;
      role.runtimeOrigin = `https://${role.workerName}.23711031.workers.dev`;
    }
    expect(() => parseResearchAcceptanceTarget(target)).not.toThrow();
  });

  it.each(["site", "executor"] as const)("requires a distinct, non-excluded UUID for %s", (role) => {
    for (const id of ["not-a-uuid", "12345678-1234-0123-0123-123456789abc", ...excludedDatabaseIds.flatMap((id) => [id, id.toUpperCase()])]) {
      expect(() => parseResearchAcceptanceTarget(changed(`${role}.d1.databaseId`, id))).toThrow(new Error(invalidMessage));
    }
    const other = role === "site" ? "executor" : "site";
    for (const id of [syntheticInventory[other].d1.databaseId, syntheticInventory[other].d1.databaseId.toUpperCase()]) {
      expect(() => parseResearchAcceptanceTarget(changed(`${role}.d1.databaseId`, id))).toThrow(new Error(invalidMessage));
    }
    expect(() => parseResearchAcceptanceTarget(changed(`${role}.d1.databaseId`, syntheticInventory[role].d1.databaseId.toUpperCase()))).not.toThrow();
  });

  it.each(siteNamePaths.flatMap((site) => executorNamePaths.map((executor) => [site, executor])))
    ("rejects cross-role resource overlap %s / %s", (sitePath, executorPath) => {
      const keys = sitePath.split(".");
      const name = atPath(syntheticInventory, keys.slice(0, -1).join("."))[keys.at(-1)!];
      const target = changed(executorPath, name);
      if (executorPath === "executor.workerName") target.executor.runtimeOrigin = `https://${name}.23711031.workers.dev`;
      expect(() => parseResearchAcceptanceTarget(target)).toThrow(new Error(invalidMessage));
    });

  it.each(["site", "executor"] as const)("requires private storage and an exact canonical %s origin", (role) => {
    for (const visibility of [true, "false", 0, null]) {
      expect(() => parseResearchAcceptanceTarget(changed(`${role}.r2.public`, visibility))).toThrow(new Error(invalidMessage));
    }
    const origin = syntheticInventory[role].runtimeOrigin;
    for (const candidate of [
      origin.replace("https:", "http:"), origin.toUpperCase(), `${origin}/`, `${origin}/path`, `${origin}?x=1`,
      `${origin}#fragment`, `${origin}:443`, origin.replace("https://", "https://user:password@"),
      `${origin}.evil.test`, origin.replace(".23711031.", ".other."), ` ${origin}`, `${origin}\n`,
      syntheticInventory[role === "site" ? "executor" : "site"].runtimeOrigin,
    ]) expect(() => parseResearchAcceptanceTarget(changed(`${role}.runtimeOrigin`, candidate))).toThrow(new Error(invalidMessage));
  });

  it.each(["siteToExecutorKeyId", "executorToSiteKeyId"] as const)("validates directional key ID %s", (key) => {
    for (const value of ["", "a".repeat(33), "has space", "clé", "key\n", "key.", 1, null]) {
      expect(() => parseResearchAcceptanceTarget(changed(`bridge.${key}`, value))).toThrow(new Error(invalidMessage));
    }
    for (const value of ["a", "A_-012", "z".repeat(32)]) {
      expect(() => parseResearchAcceptanceTarget(changed(`bridge.${key}`, value))).not.toThrow();
    }
  });

  it("rejects equal directional IDs", () => {
    expect(() => parseResearchAcceptanceTarget(changed("bridge.executorToSiteKeyId", syntheticInventory.bridge.siteToExecutorKeyId)))
      .toThrow(new Error(invalidMessage));
  });

  it("requires an exact trimmed owner ID without control characters", () => {
    const controls = Array.from({ length: 32 }, (_, index) => String.fromCharCode(index))
      .concat(Array.from({ length: 33 }, (_, index) => String.fromCharCode(0x7f + index)));
    for (const value of ["", " ", " owner", "owner ", "a".repeat(161), null, 1, ...controls.map((control) => `owner${control}a`)]) {
      expect(() => parseResearchAcceptanceTarget(changed("acceptanceOwnerId", value))).toThrow(new Error(invalidMessage));
    }
    for (const value of ["a", "a".repeat(160), "synthetic owner 中文"]) {
      expect(() => parseResearchAcceptanceTarget(changed("acceptanceOwnerId", value))).not.toThrow();
    }
  });

  it("sanitizes arbitrary thrown input errors and revalidates forged generator inputs", () => {
    const throwing = Object.defineProperty(inventory(), "site", {
      get() { throw new Error("synthetic-do-not-print"); },
    });
    for (const value of [throwing, changed("site.r2.public", true), { ...inventory(), vars: { OPENROUTER_API_KEY: "synthetic-do-not-print" } }]) {
      for (const parse of [parseResearchAcceptanceTarget, createResearchAcceptanceConfigPair]) {
        expect(() => parse(value)).toThrow(new Error(invalidMessage));
      }
      expect(() => createCloudflareConfig(value as unknown as ResearchAcceptanceTarget)).toThrow(new Error(invalidMessage));
    }
  });

  it("keeps shadow parsing and default local dispatch separate", async () => {
    expect(() => parseRemoteTarget(inventory())).toThrow("Invalid shadow Cloudflare target inventory.");
    expect((await loadCloudflareTarget()).stage).toBe("local");
    const directory = await mkdtemp(join(tmpdir(), "arc-research-target-test-"));
    temporaryDirectories.push(directory);
    const targetPath = join(directory, "target.json");
    for (const value of [null, [], { stage: "research-acceptance " }, { stage: "production" }, { stage: "local" }]) {
      await writeFile(targetPath, JSON.stringify(value));
      await expect(loadCloudflareTarget({ targetPath })).rejects.toThrow("Invalid shadow Cloudflare target inventory.");
    }
    await writeFile(targetPath, JSON.stringify(changed("site.r2.public", true)));
    await expect(loadCloudflareTarget({ targetPath })).rejects.toThrow(invalidMessage);
  });
});

describe("restricted Research configuration pair", () => {
  it.each([
    ["closed", "false", "false", []],
    ["active", "true", "true", ["* * * * *"]],
    ["draining", "false", "true", ["* * * * *"]],
  ] as const)("emits exactly the %s Site and Executor contracts", (state, admitting, maintaining, crons) => {
    const target = inventory();
    const pair = createResearchAcceptanceConfigPair({ ...target, state });
    const common = {
      account_id: "54eaadb89014252836694203c1e22546", compatibility_date: "2026-05-15",
      compatibility_flags: ["nodejs_compat"], preview_urls: false,
    };
    const bridgeVars = {
      BETTER_AUTH_URL: target.site.runtimeOrigin, ARC_AI_RESEARCH_EXECUTOR_URL: target.executor.runtimeOrigin,
      ARC_AI_RESEARCH_BRIDGE_TRANSPORT: "service-binding-v1",
      ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID: "synthetic-site", ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID: "synthetic-executor",
    };
    expect(pair.site).toEqual({
      ...common, name: target.site.workerName, main: "./worker/index.ts", workers_dev: true,
      assets: { binding: "ASSETS" },
      d1_databases: [{ binding: "DB", database_id: target.site.d1.databaseId, database_name: target.site.d1.databaseName }],
      r2_buckets: [{ binding: "PROOF_ASSETS", bucket_name: target.site.r2.bucketName }],
      services: [{ binding: "ARC_RESEARCH_EXECUTOR", service: target.executor.workerName }],
      secrets: { required: [
        "BETTER_AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET",
        "ARC_AI_IP_HASH_SALT", "ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX", "ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX",
      ] },
      vars: {
        ...bridgeVars, ARC_ENVIRONMENT: "production", ARC_AI_ENABLED: admitting, ARC_AI_RESEARCH_ENABLED: admitting,
        ARC_AI_RESEARCH_EXECUTOR: "cloudflare-workflow-v1", ARC_AI_RESEARCH_PROFILE: "kimi-low-output32k-v3",
        ARC_AI_MODEL_RESEARCH: "moonshotai/kimi-k3", ARC_AI_MODEL_ECONOMY: "moonshotai/kimi-k3",
        ARC_AI_RESEARCH_TIMEOUT_MS: "1200000", ARC_AI_REPAIR_TIMEOUT_MS: "10000", ARC_AI_RESEARCH_CACHE_DAYS: "14",
        ARC_AI_USER_DAILY_QUOTA: "1", ARC_AI_RATE_LIMIT_PER_MINUTE: "1", ARC_AI_SITE_DAILY_BUDGET_MICROS: "5000000",
        ARC_AI_SITE_MONTHLY_BUDGET_MICROS: "5000000", ARC_AI_RESEARCH_MAX_COST_MICROS: "5000000", ARC_AI_REPAIR_MAX_COST_MICROS: "0",
      },
    });
    expect(pair.executor).toEqual({
      ...common, name: target.executor.workerName, main: "./worker/research-executor/index.ts", workers_dev: false, routes: [],
      d1_databases: [{ binding: "EXECUTOR_DB", database_id: target.executor.d1.databaseId, database_name: target.executor.d1.databaseName }],
      r2_buckets: [{ binding: "EXECUTOR_RECEIPTS", bucket_name: target.executor.r2.bucketName }],
      workflows: [{ binding: "RESEARCH_WORKFLOW", name: target.executor.workflowName, class_name: "ResearchWorkflow" }],
      services: [{ binding: "ARC_RESEARCH_SITE", service: target.site.workerName }],
      secrets: { required: ["OPENROUTER_API_KEY", "ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX", "ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX"] },
      vars: { ...bridgeVars, ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: admitting, ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED: maintaining },
      triggers: { crons },
    });
    expect(createCloudflareConfig(parseResearchAcceptanceTarget({ ...target, state }))).toEqual(pair.site);
    expect(Object.values(pair.site.vars!).every((value) => typeof value === "string")).toBe(true);
    expect(Object.values(pair.executor.vars!).every((value) => typeof value === "string")).toBe(true);
    expect(JSON.stringify(pair)).not.toContain(target.acceptanceOwnerId);
  });

  it("creates independent mutable containers between roles, calls and input", () => {
    const target = inventory();
    const first = createResearchAcceptanceConfigPair(target);
    const second = createResearchAcceptanceConfigPair(target);
    function containers(value: unknown): object[] {
      return value && typeof value === "object" ? [value, ...Object.values(value).flatMap(containers)] : [];
    }
    const groups = [containers(target), containers(first.site), containers(first.executor), containers(second.site), containers(second.executor)];
    groups.forEach((group, index) => {
      const otherReferences = new Set(groups.slice(index + 1).flat());
      expect(group.some((value) => otherReferences.has(value))).toBe(false);
    });
    first.site.secrets!.required!.push("SYNTHETIC_EXTRA");
    first.site.vars!.BETTER_AUTH_URL = "synthetic-mutated";
    first.executor.triggers!.crons!.push("0 * * * *");
    target.site.d1.databaseId = "synthetic-mutated";
    expect(second).toEqual(createResearchAcceptanceConfigPair(inventory()));
    expect(first.executor.vars!.BETTER_AUTH_URL).toBe(syntheticInventory.site.runtimeOrigin);
    expect(first.site.d1_databases![0]!.database_id).toBe(syntheticInventory.site.d1.databaseId);
  });

  it.each(["closed", "active", "draining"] as const)("checks %s admission against the actual production policy source", (state) => {
    const pair = createResearchAcceptanceConfigPair({ ...inventory(), state });
    const syntheticSecrets = {
      ARC_AI_IP_HASH_SALT: "synthetic-test-salt-value",
      ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX: "01".repeat(32),
      ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX: "02".repeat(32),
    };
    const environment = { ...pair.site.vars, ...syntheticSecrets };
    expect(environment).not.toHaveProperty("OPENROUTER_API_KEY");
    const selected = readResearchPolicyConfiguration(environment);
    if (state === "active") {
      expect(selected).toMatchObject({
        executor: "cloudflare-workflow-v1",
        configuration: {
          configuredOrigin: syntheticInventory.site.runtimeOrigin, modelResearch: "moonshotai/kimi-k3",
          modelEconomy: "moonshotai/kimi-k3", researchProfile: "kimi-low-output32k-v3", researchTimeoutMs: 1200000,
          repairTimeoutMs: 10000, cacheDays: 14, userDailyQuota: 1, rateLimitPerMinute: 1, activeTtlMs: 1260000,
          budget: { dailyBudgetMicros: 5000000, monthlyBudgetMicros: 5000000, maximumMicros: 5000000, researchMaximumMicros: 5000000, repairMaximumMicros: 0 },
        },
      });
    } else expect(selected).toBeNull();
    for (const config of [pair.site, pair.executor]) {
      expect(readResearchBridgeConnection({ ...config.vars, ...syntheticSecrets })).toMatchObject({
        siteOrigin: syntheticInventory.site.runtimeOrigin, executorOrigin: syntheticInventory.executor.runtimeOrigin,
        siteToExecutor: { keyId: "synthetic-site" }, executorToSite: { keyId: "synthetic-executor" },
      });
    }
  });
});
