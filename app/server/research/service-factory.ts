import { env } from "cloudflare:workers";
import { z } from "zod";
import { getD1 } from "../../../db/d1";
import { fingerprint } from "../../lib/planning/fingerprint";
import { D1AiRunSink } from "../ai/d1-run-recorder";
import { D1EntitlementRepository } from "../entitlements/d1-entitlement-repository";
import { D1FeatureCohort } from "../entitlements/d1-feature-cohort";
import { EntitlementGate } from "../entitlements/policy";
import { parseResearchBudgetEnvironment, type ResearchBudgetLimits } from "./budget";
import { D1ResearchBudgetRepository } from "./d1-budget-repository";
import { D1ResearchRepository } from "./d1-repository";
import { OpenRouterResearchProvider, type OpenRouterResearchConfig } from "./openrouter-provider";
import { ResearchOrchestrator, type ResearchOrchestratorConfig } from "./orchestrator";
import { RESEARCH_PROVIDER_LIMITS, RESEARCH_PROVIDER_VERSIONS, ResearchProviderError, type ResearchProvider } from "./provider";

export type ResearchProductionEnvironment = {
  ARC_ENVIRONMENT?: string;
  BETTER_AUTH_URL?: string;
  ARC_AI_ENABLED?: string;
  ARC_AI_RESEARCH_ENABLED?: string;
  ARC_AI_USER_DAILY_QUOTA?: string;
  ARC_AI_RATE_LIMIT_PER_MINUTE?: string;
  ARC_AI_MODEL_RESEARCH?: string;
  ARC_AI_MODEL_ECONOMY?: string;
  ARC_AI_RESEARCH_TIMEOUT_MS?: string;
  ARC_AI_REPAIR_TIMEOUT_MS?: string;
  ARC_AI_RESEARCH_CACHE_DAYS?: string;
  ARC_AI_SITE_DAILY_BUDGET_MICROS?: string;
  ARC_AI_SITE_MONTHLY_BUDGET_MICROS?: string;
  ARC_AI_RESEARCH_MAX_COST_MICROS?: string;
  ARC_AI_REPAIR_MAX_COST_MICROS?: string;
  ARC_AI_IP_HASH_SALT?: string;
  OPENROUTER_API_KEY?: string;
};

const decimal = (minimum: number, maximum: number) => z.string().regex(/^\d+$/u)
  .transform(Number).pipe(z.number().int().min(minimum).max(maximum));
const fixedModelSchema = z.string().min(3).max(128)
  .regex(/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?::free)?$/u)
  .refine((value) => ![
    "openrouter/auto", "openrouter/free", "openrouter/bodybuilder", "openrouter/pareto",
    "openrouter/pareto-code", "openrouter/fusion", "openrouter/fusion-flash",
  ].includes(value.replace(/:free$/u, "")));
const secretSchema = z.string().min(1).max(512).regex(/^[A-Za-z0-9._-]+$/u);
const saltSchema = z.string().min(16).max(256)
  .refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f-\u009f]/u.test(value));

const environmentSchema = z.object({
  ARC_ENVIRONMENT: z.string().optional(),
  BETTER_AUTH_URL: z.string().min(1).max(2_048),
  ARC_AI_ENABLED: z.literal("true"),
  ARC_AI_RESEARCH_ENABLED: z.literal("true"),
  ARC_AI_USER_DAILY_QUOTA: decimal(1, 100_000),
  ARC_AI_RATE_LIMIT_PER_MINUTE: decimal(1, 10_000),
  ARC_AI_MODEL_RESEARCH: fixedModelSchema,
  ARC_AI_MODEL_ECONOMY: fixedModelSchema,
  ARC_AI_RESEARCH_TIMEOUT_MS: decimal(1, 120_000),
  ARC_AI_REPAIR_TIMEOUT_MS: decimal(1, 120_000),
  ARC_AI_RESEARCH_CACHE_DAYS: decimal(1, 365),
  ARC_AI_SITE_DAILY_BUDGET_MICROS: z.string(),
  ARC_AI_SITE_MONTHLY_BUDGET_MICROS: z.string(),
  ARC_AI_RESEARCH_MAX_COST_MICROS: z.string(),
  ARC_AI_REPAIR_MAX_COST_MICROS: z.string(),
  ARC_AI_IP_HASH_SALT: saltSchema,
  OPENROUTER_API_KEY: secretSchema,
}).strict();

const VERSIONS = Object.freeze({
  ...RESEARCH_PROVIDER_VERSIONS,
  blueprintVersion: "2026.09.1",
  registryVersion: "2026.09.1",
  templateVersion: "2026.09.1",
});
const POLICY = Object.freeze({
  provider: "openrouter-chat-completions-v1",
  tool: "openrouter-web-search-exa-fast-v1",
  privacy: "deny-zdr-require-parameters-v1",
  researchMaxTokens: 12_000,
  repairMaxTokens: 8_000,
  requestBytes: RESEARCH_PROVIDER_LIMITS.requestBytes,
  responseBytes: RESEARCH_PROVIDER_LIMITS.responseBytes,
  contentBytes: RESEARCH_PROVIDER_LIMITS.contentBytes,
  activeTtlMs: 60_000,
});

export type ResearchProductionConfiguration = {
  configuredOrigin: string;
  configFingerprint: string;
  modelResearch: string;
  modelEconomy: string;
  researchTimeoutMs: number;
  repairTimeoutMs: number;
  cacheDays: number;
  userDailyQuota: number;
  rateLimitPerMinute: number;
  budget: ResearchBudgetLimits;
};

type TrustedConfiguration = ResearchProductionConfiguration & {
  apiKey: string;
  ipHashSalt: string;
};

function readConfiguredOrigin(environment: ResearchProductionEnvironment): string | null {
  try {
    const url = new URL(environment.BETTER_AUTH_URL ?? "invalid:");
    if (url.username || url.password || url.search || url.hash || (environment.ARC_ENVIRONMENT === "production" && url.protocol !== "https:")) return null;
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch { return null; }
}

function trustedConfiguration(environment: ResearchProductionEnvironment): TrustedConfiguration | null {
  const input = Object.fromEntries(Object.keys(environmentSchema.shape).map((key) => [key, environment[key as keyof ResearchProductionEnvironment]]));
  const parsed = environmentSchema.safeParse(input);
  const configuredOrigin = readConfiguredOrigin(environment);
  if (!parsed.success || !configuredOrigin) return null;
  const budget = parseResearchBudgetEnvironment(parsed.data);
  if (!budget || !budget.dailyBudgetMicros || !budget.monthlyBudgetMicros || !budget.researchMaximumMicros) return null;
  const stablePolicy = {
    models: { research: parsed.data.ARC_AI_MODEL_RESEARCH, repair: parsed.data.ARC_AI_MODEL_ECONOMY },
    timeouts: { research: parsed.data.ARC_AI_RESEARCH_TIMEOUT_MS, repair: parsed.data.ARC_AI_REPAIR_TIMEOUT_MS },
    cacheDays: parsed.data.ARC_AI_RESEARCH_CACHE_DAYS,
    userDailyQuota: parsed.data.ARC_AI_USER_DAILY_QUOTA,
    rateLimitPerMinute: parsed.data.ARC_AI_RATE_LIMIT_PER_MINUTE,
    budget,
    versions: VERSIONS,
    policy: POLICY,
  };
  return {
    configuredOrigin,
    configFingerprint: fingerprint(stablePolicy),
    modelResearch: parsed.data.ARC_AI_MODEL_RESEARCH,
    modelEconomy: parsed.data.ARC_AI_MODEL_ECONOMY,
    researchTimeoutMs: parsed.data.ARC_AI_RESEARCH_TIMEOUT_MS,
    repairTimeoutMs: parsed.data.ARC_AI_REPAIR_TIMEOUT_MS,
    cacheDays: parsed.data.ARC_AI_RESEARCH_CACHE_DAYS,
    userDailyQuota: parsed.data.ARC_AI_USER_DAILY_QUOTA,
    rateLimitPerMinute: parsed.data.ARC_AI_RATE_LIMIT_PER_MINUTE,
    budget,
    apiKey: parsed.data.OPENROUTER_API_KEY,
    ipHashSalt: parsed.data.ARC_AI_IP_HASH_SALT,
  };
}

export function readResearchProductionConfiguration(
  environment: ResearchProductionEnvironment,
): ResearchProductionConfiguration | null {
  const trusted = trustedConfiguration(environment);
  if (!trusted) return null;
  return {
    configuredOrigin: trusted.configuredOrigin,
    configFingerprint: trusted.configFingerprint,
    modelResearch: trusted.modelResearch,
    modelEconomy: trusted.modelEconomy,
    researchTimeoutMs: trusted.researchTimeoutMs,
    repairTimeoutMs: trusted.repairTimeoutMs,
    cacheDays: trusted.cacheDays,
    userDailyQuota: trusted.userDailyQuota,
    rateLimitPerMinute: trusted.rateLimitPerMinute,
    budget: trusted.budget,
  };
}

export type ResearchServiceFactoryRuntime = {
  environment: ResearchProductionEnvironment;
  getD1: () => D1Database;
  createProvider?: (config: OpenRouterResearchConfig) => ResearchProvider;
  now?: () => number;
  createId?: () => string;
};

const defaultRuntime: ResearchServiceFactoryRuntime = {
  environment: env,
  getD1,
};

function ipAddress(value: string | null): string | null {
  if (!value || value !== value.trim() || value.length > 45 || /[\s,\u0000-\u001f\u007f-\u009f]/u.test(value)) return null;
  if (/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/u.test(value)) {
    return value.split(".").every((part) => Number(part) <= 255) ? value : null;
  }
  if (!value.includes(":") || !/^[0-9a-f:.]+$/iu.test(value)) return null;
  try {
    const url = new URL(`http://[${value}]/`);
    return url.hostname.slice(1, -1).toLowerCase();
  } catch { return null; }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function orchestratorConfig(configuration: ResearchProductionConfiguration): ResearchOrchestratorConfig {
  return {
    configFingerprint: configuration.configFingerprint,
    providerName: "openrouter",
    versions: VERSIONS,
    activeTtlMs: POLICY.activeTtlMs,
    cacheDays: configuration.cacheDays,
    budget: configuration.budget,
  };
}

export function createResearchServiceFactory(runtime: ResearchServiceFactoryRuntime = defaultRuntime) {
  const repositoryDependencies = () => {
    const db = runtime.getD1();
    const options = {
      ...(runtime.now ? { now: runtime.now } : {}),
      ...(runtime.createId ? { createId: runtime.createId } : {}),
    };
    const repository = new D1ResearchRepository(db, options);
    const budget = new D1ResearchBudgetRepository(db, options);
    const entitlements = new EntitlementGate(new D1EntitlementRepository(db, options), {
      ARC_AI_ENABLED: runtime.environment.ARC_AI_ENABLED,
      ARC_AI_USER_DAILY_QUOTA: runtime.environment.ARC_AI_USER_DAILY_QUOTA,
      ARC_AI_RATE_LIMIT_PER_MINUTE: runtime.environment.ARC_AI_RATE_LIMIT_PER_MINUTE,
    }, runtime.now ? { now: () => new Date(runtime.now!()) } : {});
    const audits = new D1AiRunSink(db, options);
    return { db, repository, budget, entitlements, audits, options };
  };

  return {
    createRecoveryService(): ResearchOrchestrator {
      const { repository, budget, entitlements, audits } = repositoryDependencies();
      const provider: ResearchProvider = {
        research: async () => { throw new ResearchProviderError("unavailable", false, false); },
        repair: async () => { throw new ResearchProviderError("unavailable", false, false); },
      };
      return new ResearchOrchestrator({
        repository, budget, entitlements, audits, provider,
        config: {
          configFingerprint: "recovery-only-v1",
          providerName: "openrouter",
          versions: VERSIONS,
          activeTtlMs: 1,
          cacheDays: 1,
          budget: { dailyBudgetMicros: 0, monthlyBudgetMicros: 0, maximumMicros: 0, researchMaximumMicros: 0, repairMaximumMicros: 0 },
        },
        now: runtime.now,
        createRequestId: runtime.createId,
      });
    },
    createNewCallService(): ResearchOrchestrator | null {
      const trusted = trustedConfiguration(runtime.environment);
      if (!trusted) return null;
      const { repository, budget, entitlements, audits } = repositoryDependencies();
      const providerConfig: OpenRouterResearchConfig = {
        OPENROUTER_API_KEY: trusted.apiKey,
        ARC_AI_MODEL_RESEARCH: trusted.modelResearch,
        ARC_AI_MODEL_ECONOMY: trusted.modelEconomy,
        researchTimeoutMs: trusted.researchTimeoutMs,
        repairTimeoutMs: trusted.repairTimeoutMs,
      };
      const provider = (runtime.createProvider ?? ((config) => new OpenRouterResearchProvider(config)))(providerConfig);
      return new ResearchOrchestrator({
        repository, budget, entitlements, audits, provider,
        config: orchestratorConfig(trusted),
        now: runtime.now,
        createRequestId: runtime.createId,
      });
    },
    cohortEnabled(userId: string) {
      return new D1FeatureCohort(runtime.getD1()).allows("role-research-beta", userId);
    },
    configuredOrigin() {
      return readConfiguredOrigin(runtime.environment);
    },
    rateLimitPerMinute() {
      return trustedConfiguration(runtime.environment)?.rateLimitPerMinute ?? 0;
    },
    async deriveIpSubject(request: Request) {
      const salt = saltSchema.safeParse(runtime.environment.ARC_AI_IP_HASH_SALT);
      const ip = ipAddress(request.headers.get("cf-connecting-ip"));
      if (!salt.success || !ip) throw new ResearchProviderError("unavailable", false, false);
      return `ip:${await sha256(`${salt.data}\0research-ip\0${ip}`)}`;
    },
  };
}
