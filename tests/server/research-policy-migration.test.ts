import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createResearchServiceFactory,
  readResearchProductionConfiguration,
  type ResearchProductionEnvironment,
  type ResearchServiceFactoryRuntime,
} from "../../app/server/research/service-factory";
import type { OpenRouterResearchConfig } from "../../app/server/research/openrouter-provider";
import { ResearchProviderError } from "../../app/server/research/provider";
import type { ResearchService } from "../../app/server/research/service";
import { createResearchD1, seedUser } from "../helpers/sqlite-d1";

async function inspectPersistedFactoryLease(environment: ResearchProductionEnvironment) {
  const db = createResearchD1(); seedUser(db, "owner-a");
  const now = Date.parse("2026-09-15T12:00:00.000Z");
  let enter!: () => void; let release!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const resumed = new Promise<void>((resolve) => { release = resolve; });
  const provider = {
    research: vi.fn(async () => { enter(); await resumed; throw new ResearchProviderError("unavailable", false, false); }),
    repair: vi.fn(async () => { throw new Error("Unexpected synthetic Repair"); }),
  };
  const createProvider = vi.fn<NonNullable<ResearchServiceFactoryRuntime["createProvider"]>>(() => provider);
  let pending: ReturnType<ResearchService["start"]> | undefined;
  try {
    const service = createResearchServiceFactory({ environment, getD1: () => db as unknown as D1Database,
      createProvider, now: () => now }).createNewCallService();
    expect(service).not.toBeNull();
    pending = service!.start("owner-a", { role: "Data Product Manager", locale: "en-US", mutationId: "lease-mutation-1" },
      { cohortEnabled: true, rateAllowed: true });
    await Promise.race([entered, pending.then(() => { throw new Error("Provider barrier was never reached"); })]);
    const row = db.database.prepare("SELECT state,active_expires_at FROM research_runs WHERE user_id=?").get("owner-a") as
      { state: string; active_expires_at: number };
    expect(row.state).toBe("researching");
    expect(provider.repair).not.toHaveBeenCalled();
    return { createProvider, activeTtlMs: row.active_expires_at - now };
  } finally {
    release();
    try { await pending; } finally { db.close(); }
  }
}

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

const newEnvironment: ResearchProductionEnvironment = {
  ...legacyEnvironment,
  ARC_AI_RESEARCH_PROFILE: "kimi-low-output32k-v3",
  ARC_AI_MODEL_RESEARCH: "moonshotai/kimi-k3",
  ARC_AI_RESEARCH_TIMEOUT_MS: "1200000",
  ARC_AI_RESEARCH_MAX_COST_MICROS: "5000000",
  ARC_AI_REPAIR_MAX_COST_MICROS: "0",
};

// Prompt v6 / quality v5 deliberately give future Research a new cache identity.
const capturedLegacySnapshot = {
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

const capturedLegacyVariantSnapshot = {
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

const capturedKimiSnapshot = {
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
  researchProfile: "kimi-low-output32k-v3",
  activeTtlMs: 1_260_000,
};

function malformedSelector(value: unknown): ResearchProductionEnvironment {
  const malformed: Omit<ResearchProductionEnvironment, "ARC_AI_RESEARCH_PROFILE"> & {
    ARC_AI_RESEARCH_PROFILE: unknown;
  } = { ...legacyEnvironment, ARC_AI_RESEARCH_PROFILE: value };
  return malformed as ResearchProductionEnvironment;
}

function expectUnavailableBeforeConstruction(environment: ResearchProductionEnvironment) {
  const getD1 = vi.fn<() => D1Database>();
  const createProvider = vi.fn<(config: OpenRouterResearchConfig) => never>();
  const factory = createResearchServiceFactory({ environment, getD1, createProvider });

  expect(readResearchProductionConfiguration(environment)).toBeNull();
  expect(factory.createNewCallService()).toBeNull();
  expect(createProvider).not.toHaveBeenCalled();
  expect(getD1).not.toHaveBeenCalled();
  expect(globalThis.fetch).not.toHaveBeenCalled();
}

describe("Research production policy migration", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected network access"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves all captured public snapshots and fingerprints as exact literals", () => {
    expect(readResearchProductionConfiguration(legacyEnvironment)).toEqual(capturedLegacySnapshot);
    expect(readResearchProductionConfiguration({
      ...legacyEnvironment,
      ARC_AI_RESEARCH_TIMEOUT_MS: "35000",
      ARC_AI_RESEARCH_MAX_COST_MICROS: "1300",
    })).toEqual(capturedLegacyVariantSnapshot);
    expect(readResearchProductionConfiguration(newEnvironment)).toEqual(capturedKimiSnapshot);
    expect(capturedLegacySnapshot.configFingerprint).not.toBe("p2-054fac04713cf4fe6beaa340b3d71dda"); // Prompt v5 / quality v4.
    expect(capturedKimiSnapshot.configFingerprint).not.toBe("p2-af6dcb56644ebdb499b5e6025619c5b0");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each(["1", "120000"])("accepts the legacy Research timeout bound %s", (timeout) => {
    expect(readResearchProductionConfiguration({
      ...legacyEnvironment,
      ARC_AI_RESEARCH_TIMEOUT_MS: timeout,
    })).toMatchObject({ researchTimeoutMs: Number(timeout), activeTtlMs: 60_000 });
  });

  it.each(["0", "120001"])("rejects the legacy Research timeout %s", (timeout) => {
    expect(readResearchProductionConfiguration({
      ...legacyEnvironment,
      ARC_AI_RESEARCH_TIMEOUT_MS: timeout,
    })).toBeNull();
  });

  it("selects the complete Kimi policy atomically", () => {
    const configuration = readResearchProductionConfiguration(newEnvironment);
    expect(configuration).toMatchObject({
      modelResearch: "moonshotai/kimi-k3",
      researchTimeoutMs: 1_200_000,
      researchProfile: "kimi-low-output32k-v3",
      activeTtlMs: 1_260_000,
    });
    expect(configuration?.configFingerprint)
      .not.toBe(readResearchProductionConfiguration(legacyEnvironment)?.configFingerprint);
  });

  it.each([
    ["blank", ""],
    ["whitespace", " "],
    ["unknown", "unknown-profile"],
    ["null", null],
    ["number", 3],
    ["object", { profileId: "kimi-low-output32k-v3" }],
  ])("rejects a %s selector instead of falling back to legacy", (_name, selector) => {
    expectUnavailableBeforeConstruction(malformedSelector(selector));
  });

  it.each([
    ["short timeout", { ARC_AI_RESEARCH_TIMEOUT_MS: "1199999" }],
    ["long timeout", { ARC_AI_RESEARCH_TIMEOUT_MS: "1200001" }],
    ["wrong model", { ARC_AI_MODEL_RESEARCH: "test/research-fixed" }],
    ["nonzero Repair reservation", { ARC_AI_REPAIR_MAX_COST_MICROS: "1" }],
    ["oversized Research reservation", { ARC_AI_RESEARCH_MAX_COST_MICROS: "5000001" }],
    ["zero Research reservation", { ARC_AI_RESEARCH_MAX_COST_MICROS: "0" }],
  ])("rejects the selected profile with %s", (_name, changes) => {
    expectUnavailableBeforeConstruction({ ...newEnvironment, ...changes });
  });

  it.each([
    ["missing key", "OPENROUTER_API_KEY"],
    ["missing salt", "ARC_AI_IP_HASH_SALT"],
    ["missing origin", "BETTER_AUTH_URL"],
    ["missing global switch", "ARC_AI_ENABLED"],
    ["missing Research switch", "ARC_AI_RESEARCH_ENABLED"],
    ["missing daily budget", "ARC_AI_SITE_DAILY_BUDGET_MICROS"],
    ["missing monthly budget", "ARC_AI_SITE_MONTHLY_BUDGET_MICROS"],
    ["missing Research reservation", "ARC_AI_RESEARCH_MAX_COST_MICROS"],
    ["missing Repair reservation", "ARC_AI_REPAIR_MAX_COST_MICROS"],
  ] satisfies Array<[string, keyof ResearchProductionEnvironment]>)(
    "fails closed before provider or D1 construction for %s",
    (_name, key) => {
      const environment = { ...newEnvironment };
      delete environment[key];
      expectUnavailableBeforeConstruction(environment);
    },
  );

  it("forwards the selected profile and lease through the production factory", async () => {
    const { createProvider, activeTtlMs } = await inspectPersistedFactoryLease(newEnvironment);
    expect(createProvider).toHaveBeenCalledWith({
      OPENROUTER_API_KEY: "synthetic-dummy-credential",
      ARC_AI_MODEL_RESEARCH: "moonshotai/kimi-k3",
      ARC_AI_MODEL_ECONOMY: "test/economy-fixed",
      researchTimeoutMs: 1_200_000,
      repairTimeoutMs: 10_000,
      researchProfile: "kimi-low-output32k-v3",
    });
    expect(activeTtlMs).toBe(1_260_000);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("omits the selector from the legacy provider configuration and keeps its lease", async () => {
    const { createProvider, activeTtlMs } = await inspectPersistedFactoryLease(legacyEnvironment);
    expect(createProvider).toHaveBeenCalledOnce();
    expect(createProvider.mock.calls[0]![0]).not.toHaveProperty("researchProfile");
    expect(activeTtlMs).toBe(60_000);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("keeps recovery construction and queries independent of invalid new-call configuration", async () => {
    const db = createResearchD1();
    try {
      const getD1 = vi.fn(() => db as unknown as D1Database);
      const createProvider = vi.fn(() => ({ research: vi.fn(), repair: vi.fn() }));
      const factory = createResearchServiceFactory({
        environment: { ...newEnvironment, ARC_AI_RESEARCH_PROFILE: "unknown-profile" },
        getD1,
        createProvider,
      });

      expect(factory.createNewCallService()).toBeNull();
      await expect(factory.createRecoveryService().get("owner-a", "missing-run")).resolves.toBeNull();
      expect(getD1).toHaveBeenCalledOnce();
      expect(createProvider).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });

  it("excludes rotated secrets while fingerprinting operational policy changes", () => {
    const base = readResearchProductionConfiguration(newEnvironment)!;
    for (const environment of [
      { ...newEnvironment, OPENROUTER_API_KEY: "synthetic-rotated-credential" },
      { ...newEnvironment, ARC_AI_IP_HASH_SALT: "synthetic-rotated-salt-value" },
    ]) {
      expect(readResearchProductionConfiguration(environment)?.configFingerprint)
        .toBe(base.configFingerprint);
    }
    for (const environment of [
      { ...newEnvironment, ARC_AI_USER_DAILY_QUOTA: "4" },
      { ...newEnvironment, ARC_AI_RATE_LIMIT_PER_MINUTE: "3" },
      { ...newEnvironment, ARC_AI_SITE_DAILY_BUDGET_MICROS: "20000001" },
      { ...newEnvironment, ARC_AI_SITE_MONTHLY_BUDGET_MICROS: "100000001" },
      { ...newEnvironment, ARC_AI_RESEARCH_MAX_COST_MICROS: "4999999" },
      { ...newEnvironment, ARC_AI_RESEARCH_CACHE_DAYS: "15" },
    ]) {
      expect(readResearchProductionConfiguration(environment)?.configFingerprint)
        .not.toBe(base.configFingerprint);
    }
    expect(JSON.stringify(base)).not.toMatch(/synthetic-(?:dummy-credential|test-salt-value)/u);
  });
});
