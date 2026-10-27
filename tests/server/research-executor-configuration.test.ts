import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readResearchRuntimePolicy } from "../../app/server/admin/policy";
import { createResearchEligibilityDependencies } from "../../app/server/http/research-eligibility-route";
import {
  readResearchBridgeConnection,
  type ResearchBridgeEnvironment,
} from "../../app/server/research/executor/connection-config";
import {
  readConfiguredResearchOrigin,
  readResearchPolicyConfiguration,
  RESEARCH_CONFIGURATION_VERSIONS,
  resolveResearchExecutor,
  type ResearchProductionEnvironment,
} from "../../app/server/research/production-policy";
import {
  createResearchServiceFactory,
  readResearchProductionConfiguration,
} from "../../app/server/research/service-factory";
import { createResearchD1 } from "../helpers/sqlite-d1";

const legacySnapshot = {
  configuredOrigin: "https://arc.example",
  configFingerprint: "p2-53f4211866bc6dd6aaaa47e461299792",
  modelResearch: "test/research-fixed",
  modelEconomy: "test/economy-fixed",
  researchTimeoutMs: 20_000,
  repairTimeoutMs: 10_000,
  cacheDays: 14,
  userDailyQuota: 3,
  rateLimitPerMinute: 2,
  budget: {
    dailyBudgetMicros: 20_000_000,
    monthlyBudgetMicros: 100_000_000,
    maximumMicros: 1_500,
    researchMaximumMicros: 1_200,
    repairMaximumMicros: 300,
  },
  activeTtlMs: 60_000,
};

const legacyVariantSnapshot = {
  configuredOrigin: "https://arc.example",
  configFingerprint: "p2-6e3e04d6b202e598ea7ffa1a76f56a2c",
  modelResearch: "test/research-fixed",
  modelEconomy: "test/economy-fixed",
  researchTimeoutMs: 35_000,
  repairTimeoutMs: 10_000,
  cacheDays: 14,
  userDailyQuota: 3,
  rateLimitPerMinute: 2,
  budget: {
    dailyBudgetMicros: 20_000_000,
    monthlyBudgetMicros: 100_000_000,
    maximumMicros: 1_600,
    researchMaximumMicros: 1_300,
    repairMaximumMicros: 300,
  },
  activeTtlMs: 60_000,
};

const kimiSnapshot = {
  configuredOrigin: "https://arc.example",
  configFingerprint: "p2-bf84466e68fe0508833fac9a35e83654",
  modelResearch: "moonshotai/kimi-k3",
  modelEconomy: "test/economy-fixed",
  researchTimeoutMs: 1_200_000,
  repairTimeoutMs: 10_000,
  cacheDays: 14,
  userDailyQuota: 3,
  rateLimitPerMinute: 2,
  budget: {
    dailyBudgetMicros: 20_000_000,
    monthlyBudgetMicros: 100_000_000,
    maximumMicros: 5_000_000,
    researchMaximumMicros: 5_000_000,
    repairMaximumMicros: 0,
  },
  researchProfile: "kimi-low-output32k-v3" as const,
  activeTtlMs: 1_260_000,
};

const legacyEnvironment: ResearchProductionEnvironment = {
  ARC_ENVIRONMENT: "test",
  BETTER_AUTH_URL: "https://arc.example",
  ARC_AI_ENABLED: "true",
  ARC_AI_RESEARCH_ENABLED: "true",
  ARC_AI_USER_DAILY_QUOTA: "3",
  ARC_AI_RATE_LIMIT_PER_MINUTE: "2",
  ARC_AI_MODEL_RESEARCH: "test/research-fixed",
  ARC_AI_MODEL_ECONOMY: "test/economy-fixed",
  ARC_AI_RESEARCH_TIMEOUT_MS: "20000",
  ARC_AI_REPAIR_TIMEOUT_MS: "10000",
  ARC_AI_RESEARCH_CACHE_DAYS: "14",
  ARC_AI_SITE_DAILY_BUDGET_MICROS: "20000000",
  ARC_AI_SITE_MONTHLY_BUDGET_MICROS: "100000000",
  ARC_AI_RESEARCH_MAX_COST_MICROS: "1200",
  ARC_AI_REPAIR_MAX_COST_MICROS: "300",
  ARC_AI_IP_HASH_SALT: "synthetic-test-salt-value",
  OPENROUTER_API_KEY: "synthetic-dummy-credential",
};

const kimiEnvironment: ResearchProductionEnvironment = {
  ...legacyEnvironment,
  ARC_AI_RESEARCH_PROFILE: "kimi-low-output32k-v3",
  ARC_AI_MODEL_RESEARCH: "moonshotai/kimi-k3",
  ARC_AI_RESEARCH_TIMEOUT_MS: "1200000",
  ARC_AI_RESEARCH_MAX_COST_MICROS: "5000000",
  ARC_AI_REPAIR_MAX_COST_MICROS: "0",
};

const remoteEnvironment: ResearchProductionEnvironment = {
  ...kimiEnvironment,
  ARC_AI_RESEARCH_EXECUTOR: "cloudflare-workflow-v1",
};

const bridgeEnvironment: ResearchBridgeEnvironment = {
  BETTER_AUTH_URL: "https://arc.example",
  ARC_AI_RESEARCH_EXECUTOR_URL: "https://executor.example/",
  ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID: "site_key-1",
  ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX: "01".repeat(32),
  ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID: "executor_key-1",
  ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX: "02".repeat(32),
};

const executorEnvironmentKeys = [
  "ARC_AI_RESEARCH_EXECUTOR",
  "ARC_AI_RESEARCH_EXECUTOR_URL",
  "ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID",
  "ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX",
  "ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID",
  "ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX",
] as const;

function activeExampleEnvironment(content: string): ResearchProductionEnvironment {
  const assignments: Record<string, string> = {};
  for (const line of content.split(/\r?\n/u)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (match) assignments[match[1]!] = match[2]!;
  }
  return assignments as ResearchProductionEnvironment;
}

function propertyWithThrowingGetter(
  fields: ResearchProductionEnvironment,
  key: string,
): ResearchProductionEnvironment {
  return Object.defineProperty({ ...fields }, key, {
    enumerable: true,
    get() { throw new Error(`unexpected read: ${key}`); },
  }) as ResearchProductionEnvironment;
}

describe("Research executor policy configuration", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected network access"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults only an absent executor selector to synchronous", () => {
    expect(resolveResearchExecutor(undefined)).toBe("synchronous");
    expect(resolveResearchExecutor("cloudflare-workflow-v1")).toBe("cloudflare-workflow-v1");
    for (const value of ["synchronous", "", " ", null, {}, [], 1, "cloudflare-workflow-v1\n"]) {
      expect(resolveResearchExecutor(value)).toBeNull();
    }
  });

  it("pins the three current public configurations and synchronous fingerprints exactly", () => {
    expect(readResearchPolicyConfiguration(legacyEnvironment)).toEqual({
      executor: "synchronous",
      configuration: legacySnapshot,
    });
    expect(readResearchPolicyConfiguration({
      ...legacyEnvironment,
      ARC_AI_RESEARCH_TIMEOUT_MS: "35000",
      ARC_AI_RESEARCH_MAX_COST_MICROS: "1300",
    })).toEqual({ executor: "synchronous", configuration: legacyVariantSnapshot });
    expect(readResearchPolicyConfiguration(kimiEnvironment)).toEqual({
      executor: "synchronous",
      configuration: kimiSnapshot,
    });
    expect(readResearchProductionConfiguration(legacyEnvironment)).toEqual(legacySnapshot);
    expect(readResearchProductionConfiguration(kimiEnvironment)).toEqual(kimiSnapshot);
  });

  it("parses the exact remote Kimi policy without requiring a provider credential", () => {
    const withoutCredentials = { ...remoteEnvironment };
    delete withoutCredentials.OPENROUTER_API_KEY;
    const selection = readResearchPolicyConfiguration(withoutCredentials);
    expect(selection).toMatchObject({
      executor: "cloudflare-workflow-v1",
      configuration: {
        ...kimiSnapshot,
        configFingerprint: expect.stringMatching(/^p2-[0-9a-f]{32}$/u),
      },
    });
    expect(selection?.configuration.configFingerprint)
      .toBe("p2-d7a7a16769de618514df818ba38c8a19");
    expect(selection?.configuration.configFingerprint).not.toBe(kimiSnapshot.configFingerprint);
    expect(JSON.stringify(selection)).not.toMatch(/synthetic-(?:dummy-credential|test-salt-value)/u);
  });

  it("retains all eight configuration versions exactly", () => {
    expect(RESEARCH_CONFIGURATION_VERSIONS).toEqual({
      promptVersion: "research-prompt-v6",
      inputSchemaVersion: "research-input-v1",
      outputSchemaVersion: "research-output-v1",
      qualityVersion: "research-quality-v5",
      modelConfigVersion: "research-model-config-v2",
      blueprintVersion: "2026.09.1",
      registryVersion: "2026.09.1",
      templateVersion: "2026.09.1",
    });
    expect(Object.isFrozen(RESEARCH_CONFIGURATION_VERSIONS)).toBe(true);
  });

  it("keeps connection rotations out of the remote fingerprint and policy changes in it", () => {
    const base = readResearchPolicyConfiguration(remoteEnvironment)!.configuration.configFingerprint;
    expect(readResearchPolicyConfiguration({
      ...remoteEnvironment,
      ...bridgeEnvironment,
    })?.configuration.configFingerprint).toBe(base);
    expect(readResearchPolicyConfiguration({
      ...remoteEnvironment,
      ...bridgeEnvironment,
      BETTER_AUTH_URL: "https://rotated-arc.example/",
      ARC_AI_RESEARCH_EXECUTOR_URL: "https://rotated-executor.example",
    })?.configuration.configFingerprint).toBe(base);
    expect(readResearchPolicyConfiguration({
      ...remoteEnvironment,
      ...bridgeEnvironment,
      ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID: "rotated-site-key",
      ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX: "03".repeat(32),
      ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID: "rotated-executor-key",
      ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX: "04".repeat(32),
    })?.configuration.configFingerprint).toBe(base);
    expect(readResearchPolicyConfiguration({
      ...remoteEnvironment,
      ARC_AI_USER_DAILY_QUOTA: "4",
    })?.configuration.configFingerprint).not.toBe(base);
  });

  it("rejects remote policy variants outside the fixed Kimi contract", () => {
    for (const changes of [
      { ARC_AI_RESEARCH_PROFILE: undefined },
      { ARC_AI_RESEARCH_PROFILE: "legacy-profile" },
      { ARC_AI_MODEL_RESEARCH: "test/research-fixed" },
      { ARC_AI_RESEARCH_TIMEOUT_MS: "1199999" },
      { ARC_AI_RESEARCH_TIMEOUT_MS: "1200001" },
      { ARC_AI_REPAIR_MAX_COST_MICROS: "1" },
      { ARC_AI_RESEARCH_MAX_COST_MICROS: "0" },
      { ARC_AI_RESEARCH_MAX_COST_MICROS: "5000001" },
    ]) {
      expect(readResearchPolicyConfiguration({ ...remoteEnvironment, ...changes })).toBeNull();
    }
  });

  it("reads the selector before common fields and never reads provider credentials", () => {
    const invalidSelector = propertyWithThrowingGetter({
      ...remoteEnvironment,
      ARC_AI_RESEARCH_EXECUTOR: "bad-selector",
    }, "BETTER_AUTH_URL");
    expect(readResearchPolicyConfiguration(invalidSelector)).toBeNull();

    for (const environment of [legacyEnvironment, remoteEnvironment]) {
      expect(readResearchPolicyConfiguration(
        propertyWithThrowingGetter(environment, "OPENROUTER_API_KEY"),
      )).not.toBeNull();
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("enables valid remote production selection without Provider, fetch, or key reads", () => {
    const database = createResearchD1();
    const getD1 = vi.fn(() => database as unknown as D1Database);
    const createProvider = vi.fn(() => { throw new Error("unexpected Provider construction"); });
    const keyRead = vi.fn(() => { throw new Error("unexpected Provider key read"); });
    const environment = Object.defineProperty({
      ...remoteEnvironment,
      ...bridgeEnvironment,
    }, "OPENROUTER_API_KEY", { get: keyRead });
    const factory = createResearchServiceFactory({ environment, getD1, createProvider });
    try {
    expect(readResearchBridgeConnection(environment)).not.toBeNull();
    expect(readResearchProductionConfiguration(environment)).toEqual(readResearchPolicyConfiguration(environment)!.configuration);
    expect(factory.createNewCallService()).not.toBeNull();
    expect(factory.rateLimitPerMinute()).toBe(2);
    expect(readResearchRuntimePolicy(environment)).toMatchObject({ enabled: true });
    expect(createResearchEligibilityDependencies({ environment, getD1 }).configured()).toBe(true);
    expect(keyRead).not.toHaveBeenCalled();
    expect(createProvider).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();

    const invalidSelector = propertyWithThrowingGetter({
      ...remoteEnvironment,
      ARC_AI_RESEARCH_EXECUTOR: "invalid",
    }, "OPENROUTER_API_KEY");
    expect(createResearchServiceFactory({ environment: invalidSelector, getD1, createProvider })
      .createNewCallService()).toBeNull();

    for (const base of [legacyEnvironment, remoteEnvironment]) {
      const bridgeUnused = propertyWithThrowingGetter(base, "ARC_AI_RESEARCH_EXECUTOR_URL");
      expect(readResearchPolicyConfiguration(bridgeUnused)).not.toBeNull();
    }
    } finally { database.close(); }
  });

  it("does not infer remote mode from Kimi, absent keys, or bridge settings", () => {
    expect(readResearchPolicyConfiguration(kimiEnvironment)?.executor).toBe("synchronous");
    const withoutProviderKey = { ...kimiEnvironment };
    delete withoutProviderKey.OPENROUTER_API_KEY;
    expect(readResearchPolicyConfiguration(withoutProviderKey)?.executor).toBe("synchronous");
    expect(readResearchPolicyConfiguration({
      ...kimiEnvironment,
      ...bridgeEnvironment,
    })?.executor).toBe("synchronous");
  });

  it("keeps synchronous origin compatibility", () => {
    expect(readConfiguredResearchOrigin({
      ...legacyEnvironment,
      ARC_ENVIRONMENT: "test",
      BETTER_AUTH_URL: "http://localhost:3000/path",
    })).toBe("http://localhost:3000");
    expect(readConfiguredResearchOrigin({
      ...legacyEnvironment,
      ARC_ENVIRONMENT: "production",
      BETTER_AUTH_URL: "http://localhost:3000",
    })).toBeNull();
  });

  it("keeps the pure policy credential-free while preserving salt validation", () => {
    const withoutKey = { ...legacyEnvironment };
    delete withoutKey.OPENROUTER_API_KEY;
    expect(readResearchPolicyConfiguration(withoutKey)).not.toBeNull();
    expect(readResearchProductionConfiguration(withoutKey)).toBeNull();

    for (const changes of [
      { ARC_AI_IP_HASH_SALT: undefined },
      { ARC_AI_IP_HASH_SALT: "short" },
      { ARC_AI_IP_HASH_SALT: " synthetic-test-salt-value" },
      { ARC_AI_IP_HASH_SALT: "synthetic-test-salt-value\n" },
    ]) {
      expect(readResearchPolicyConfiguration({ ...legacyEnvironment, ...changes })).toBeNull();
      expect(readResearchPolicyConfiguration({ ...remoteEnvironment, ...changes })).toBeNull();
    }
  });

  it("keeps recovery credential-free with switches disabled", async () => {
    const db = createResearchD1();
    try {
      const getD1 = vi.fn(() => db as unknown as D1Database);
      const createProvider = vi.fn();
      const factory = createResearchServiceFactory({
        environment: {
          ...remoteEnvironment,
          ARC_AI_ENABLED: "false",
          ARC_AI_RESEARCH_ENABLED: "false",
          OPENROUTER_API_KEY: undefined,
        },
        getD1,
        createProvider,
      });
      await expect(factory.createRecoveryService().get("owner-a", "missing-run"))
        .resolves.toBeNull();
      expect(createProvider).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });
});

describe("Research bridge connection configuration", () => {
  it("parses canonical HTTPS origins, fixed credentials, and private byte copies", () => {
    const connection = readResearchBridgeConnection(bridgeEnvironment);
    expect(connection).toMatchObject({
      siteOrigin: "https://arc.example",
      executorOrigin: "https://executor.example",
      siteToExecutor: { keyId: "site_key-1" },
      executorToSite: { keyId: "executor_key-1" },
    });
    expect(Object.isFrozen(connection)).toBe(true);
    expect(Object.isFrozen(connection?.siteToExecutor)).toBe(true);
    expect(Object.isFrozen(connection?.executorToSite)).toBe(true);
    expect(connection?.siteToExecutor.copyKeyBytes()).toEqual(
      new Uint8Array(Buffer.from("01".repeat(32), "hex")),
    );
    expect(connection?.executorToSite.copyKeyBytes()).toEqual(
      new Uint8Array(Buffer.from("02".repeat(32), "hex")),
    );

    const first = connection!.siteToExecutor.copyKeyBytes();
    first[0] = 255;
    expect(connection!.siteToExecutor.copyKeyBytes()[0]).toBe(1);
    expect(connection!.executorToSite.copyKeyBytes()[0]).toBe(2);
    const reparsed = readResearchBridgeConnection(bridgeEnvironment)!;
    expect(reparsed.siteToExecutor.copyKeyBytes()[0]).toBe(1);

    const serialized = JSON.stringify(connection);
    expect(serialized).toContain("site_key-1");
    expect(serialized).toContain("executor_key-1");
    expect(serialized).not.toContain("01".repeat(32));
    expect(serialized).not.toContain("02".repeat(32));
    expect(serialized).not.toMatch(/\[(?:\d+,){10}/u);
  });

  it("normalizes either allowed slash spelling for both origins", () => {
    const variants = [
      { BETTER_AUTH_URL: "https://arc.example", ARC_AI_RESEARCH_EXECUTOR_URL: "https://executor.example" },
      { BETTER_AUTH_URL: "https://arc.example/", ARC_AI_RESEARCH_EXECUTOR_URL: "https://executor.example" },
      { BETTER_AUTH_URL: "https://arc.example", ARC_AI_RESEARCH_EXECUTOR_URL: "https://executor.example/" },
      { BETTER_AUTH_URL: "https://arc.example/", ARC_AI_RESEARCH_EXECUTOR_URL: "https://executor.example/" },
    ];
    for (const origins of variants) {
      expect(readResearchBridgeConnection({ ...bridgeEnvironment, ...origins })).toMatchObject({
        siteOrigin: "https://arc.example",
        executorOrigin: "https://executor.example",
      });
    }
  });

  it("fails closed when any required connection field is missing", () => {
    for (const key of [
      "BETTER_AUTH_URL",
      "ARC_AI_RESEARCH_EXECUTOR_URL",
      "ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID",
      "ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX",
      "ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID",
      "ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX",
    ] satisfies Array<keyof ResearchBridgeEnvironment>) {
      const environment = { ...bridgeEnvironment };
      delete environment[key];
      expect(readResearchBridgeConnection(environment)).toBeNull();
    }
  });

  it.each([
    ["site http", { BETTER_AUTH_URL: "http://arc.example" }],
    ["executor http", { ARC_AI_RESEARCH_EXECUTOR_URL: "http://executor.example" }],
    ["site path", { BETTER_AUTH_URL: "https://arc.example/path" }],
    ["executor path", { ARC_AI_RESEARCH_EXECUTOR_URL: "https://executor.example/path" }],
    ["site auth", { BETTER_AUTH_URL: "https://user@arc.example" }],
    ["executor auth", { ARC_AI_RESEARCH_EXECUTOR_URL: "https://user@executor.example" }],
    ["site query", { BETTER_AUTH_URL: "https://arc.example/?x=1" }],
    ["executor query", { ARC_AI_RESEARCH_EXECUTOR_URL: "https://executor.example/?x=1" }],
    ["site fragment", { BETTER_AUTH_URL: "https://arc.example/#x" }],
    ["executor fragment", { ARC_AI_RESEARCH_EXECUTOR_URL: "https://executor.example/#x" }],
    ["same origin", { ARC_AI_RESEARCH_EXECUTOR_URL: "https://arc.example/" }],
    ["noncanonical case", { BETTER_AUTH_URL: "HTTPS://arc.example" }],
    ["noncanonical port", { BETTER_AUTH_URL: "https://arc.example:443" }],
    ["site leading whitespace", { BETTER_AUTH_URL: " https://arc.example" }],
    ["site trailing whitespace", { BETTER_AUTH_URL: "https://arc.example " }],
    ["executor leading whitespace", { ARC_AI_RESEARCH_EXECUTOR_URL: " https://executor.example" }],
    ["executor trailing whitespace", { ARC_AI_RESEARCH_EXECUTOR_URL: "https://executor.example " }],
    ["file", { BETTER_AUTH_URL: "file:///tmp/arc" }],
    ["data", { BETTER_AUTH_URL: "data:text/plain,arc" }],
    ["javascript", { BETTER_AUTH_URL: "javascript:alert(1)" }],
    ["too long", { BETTER_AUTH_URL: `https://${"a".repeat(250)}.example` }],
  ])("rejects %s bridge origins", (_name, changes) => {
    expect(readResearchBridgeConnection({ ...bridgeEnvironment, ...changes })).toBeNull();
  });

  it.each([
    ["empty", ""],
    ["too long", "a".repeat(33)],
    ["space", "bad key"],
    ["non-ASCII", "clé"],
    ["newline", "key\n"],
    ["non-string", 1],
  ])("rejects %s key IDs", (_name, value) => {
    expect(readResearchBridgeConnection({
      ...bridgeEnvironment,
      ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID: value as string,
    })).toBeNull();
  });

  it("accepts one and thirty-two character key IDs", () => {
    expect(readResearchBridgeConnection({
      ...bridgeEnvironment,
      ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID: "a",
      ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID: "z".repeat(32),
    })).not.toBeNull();
  });

  it.each([
    ["empty", ""],
    ["short", "01".repeat(31)],
    ["long", "01".repeat(33)],
    ["uppercase", "AB".repeat(32)],
    ["non-hex", "gg".repeat(32)],
    ["space", ` ${"01".repeat(32)}`],
    ["non-string", 1],
  ])("rejects %s bridge secrets", (_name, value) => {
    expect(readResearchBridgeConnection({
      ...bridgeEnvironment,
      ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX: value as string,
    })).toBeNull();
  });

  it("rejects equal directional bytes but permits equal IDs with different bytes", () => {
    expect(readResearchBridgeConnection({
      ...bridgeEnvironment,
      ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX: "01".repeat(32),
    })).toBeNull();
    expect(readResearchBridgeConnection({
      ...bridgeEnvironment,
      ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID: "site_key-1",
    })).not.toBeNull();
  });

  it("reads only connection fields and ignores switches, profiles, provider keys, and selectors", () => {
    expect(readResearchBridgeConnection({
      ...bridgeEnvironment,
      ARC_AI_ENABLED: "false",
      ARC_AI_RESEARCH_ENABLED: "false",
    } as ResearchBridgeEnvironment)).not.toBeNull();

    for (const key of ["ARC_AI_ENABLED", "ARC_AI_RESEARCH_ENABLED"]) {
      const throwingSwitch = Object.defineProperty({ ...bridgeEnvironment }, key, {
        enumerable: true,
        get() { throw new Error(`${key} read`); },
      });
      expect(readResearchBridgeConnection(throwingSwitch)).not.toBeNull();
    }

    const environment = Object.defineProperties({ ...bridgeEnvironment }, {
      OPENROUTER_API_KEY: { enumerable: true, get() { throw new Error("provider key read"); } },
      ARC_AI_RESEARCH_EXECUTOR: { enumerable: true, get() { throw new Error("selector read"); } },
      ARC_AI_RESEARCH_PROFILE: { enumerable: true, get() { throw new Error("profile read"); } },
    });
    expect(readResearchBridgeConnection(environment)).not.toBeNull();
  });

  it("returns null for thrown connection getters without leaking errors", () => {
    const environment = Object.defineProperty({ ...bridgeEnvironment }, "BETTER_AUTH_URL", {
      enumerable: true,
      get() { throw new Error("origin read"); },
    });
    expect(readResearchBridgeConnection(environment)).toBeNull();
  });
});

describe("Research executor environment documentation", () => {
  it("keeps remote executor opt-in commented and copied legacy defaults synchronous", () => {
    const example = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
    const activeExample = activeExampleEnvironment(example);
    expect(executorEnvironmentKeys.filter((key) => Object.hasOwn(activeExample, key))).toEqual([]);

    const copiedLegacyEnvironment = { ...activeExample, ...legacyEnvironment };
    expect(readResearchPolicyConfiguration(copiedLegacyEnvironment)).toEqual({
      executor: "synchronous",
      configuration: legacySnapshot,
    });
    const createProvider = vi.fn(() => ({ research: vi.fn(), repair: vi.fn() }));
    const service = createResearchServiceFactory({
      environment: copiedLegacyEnvironment,
      getD1: () => ({} as D1Database),
      createProvider,
    }).createNewCallService();
    expect(service).not.toBeNull();
    expect(createProvider).toHaveBeenCalledOnce();
  });

  it("declares every optional executor binding and documents fixed configuration", () => {
    const declarations = readFileSync(resolve(process.cwd(), "worker-configuration.d.ts"), "utf8");
    const example = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
    for (const key of executorEnvironmentKeys) {
      expect(declarations).toContain(`${key}?: string;`);
      expect(example).toMatch(new RegExp(`^# ${key}=`, "mu"));
    }
    expect(example).toMatch(/^# ARC_AI_RESEARCH_EXECUTOR=cloudflare-workflow-v1$/mu);
    expect(example).toMatch(/HTTPS/u);
    expect(example).toMatch(/64 lowercase hexadecimal/u);
    expect(example).toMatch(/only the executor.*OPENROUTER_API_KEY/iu);
  });
});
