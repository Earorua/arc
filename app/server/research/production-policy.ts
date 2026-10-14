import { z } from "zod";
import { fingerprint } from "../../lib/planning/fingerprint";
import { parseResearchBudgetEnvironment, type ResearchBudgetLimits } from "./budget";
import { KIMI_RESEARCH_EXECUTION_POLICY, resolveResearchExecutionPolicy } from "./execution-policy";
import { BRIDGE_AUTH_PROTOCOL } from "./executor/auth";
import type { ResearchBridgeEnvironment } from "./executor/connection-config";
import { BRIDGE_EXECUTOR_MODE, BRIDGE_QUEUE_TTL_MS } from "./executor/job";
import {
  RESEARCH_PROVIDER_LIMITS,
  RESEARCH_PROVIDER_VERSIONS,
  RESEARCH_SEARCH_POLICY,
} from "./provider";

export type ResearchExecutorSelection = "synchronous" | "cloudflare-workflow-v1";

type ResearchPolicyEnvironment = {
  ARC_ENVIRONMENT?: string;
  ARC_AI_ENABLED?: string;
  ARC_AI_RESEARCH_ENABLED?: string;
  ARC_AI_RESEARCH_PROFILE?: string;
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
};

export type ResearchProductionEnvironment = ResearchPolicyEnvironment
  & ResearchBridgeEnvironment
  & {
    ARC_AI_RESEARCH_EXECUTOR?: string;
    OPENROUTER_API_KEY?: string;
  };

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
  researchProfile?: typeof KIMI_RESEARCH_EXECUTION_POLICY.profileId;
  activeTtlMs: number;
};

export type ResearchPolicySelection = Readonly<{
  executor: ResearchExecutorSelection;
  configuration: ResearchProductionConfiguration;
}>;

const decimal = (minimum: number, maximum: number) => z.string().regex(/^\d+$/u)
  .transform(Number).pipe(z.number().int().min(minimum).max(maximum));
const fixedModelSchema = z.string().min(3).max(128)
  .regex(/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?::free)?$/u)
  .refine((value) => ![
    "openrouter/auto", "openrouter/free", "openrouter/bodybuilder", "openrouter/pareto",
    "openrouter/pareto-code", "openrouter/fusion", "openrouter/fusion-flash",
  ].includes(value.replace(/:free$/u, "")));
const saltSchema = z.string().min(16).max(256)
  .refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f-\u009f]/u.test(value));

const policySchema = z.object({
  ARC_ENVIRONMENT: z.string().optional(),
  BETTER_AUTH_URL: z.string().min(1).max(2_048),
  ARC_AI_ENABLED: z.literal("true"),
  ARC_AI_RESEARCH_ENABLED: z.literal("true"),
  ARC_AI_RESEARCH_PROFILE: z.literal(KIMI_RESEARCH_EXECUTION_POLICY.profileId).optional(),
  ARC_AI_USER_DAILY_QUOTA: decimal(1, 100_000),
  ARC_AI_RATE_LIMIT_PER_MINUTE: decimal(1, 10_000),
  ARC_AI_MODEL_RESEARCH: fixedModelSchema,
  ARC_AI_MODEL_ECONOMY: fixedModelSchema,
  ARC_AI_RESEARCH_TIMEOUT_MS: decimal(1, 1_200_000),
  ARC_AI_REPAIR_TIMEOUT_MS: decimal(1, 120_000),
  ARC_AI_RESEARCH_CACHE_DAYS: decimal(1, 365),
  ARC_AI_SITE_DAILY_BUDGET_MICROS: z.string(),
  ARC_AI_SITE_MONTHLY_BUDGET_MICROS: z.string(),
  ARC_AI_RESEARCH_MAX_COST_MICROS: z.string(),
  ARC_AI_REPAIR_MAX_COST_MICROS: z.string(),
  ARC_AI_IP_HASH_SALT: saltSchema,
}).strict();

export const RESEARCH_CONFIGURATION_VERSIONS = Object.freeze({
  ...RESEARCH_PROVIDER_VERSIONS,
  blueprintVersion: "2026.09.1",
  registryVersion: "2026.09.1",
  templateVersion: "2026.09.1",
});

const POLICY = Object.freeze({
  provider: "openrouter-chat-completions-v1",
  tool: RESEARCH_SEARCH_POLICY.policyId,
  search: RESEARCH_SEARCH_POLICY,
  privacy: "deny-zdr-require-parameters-v1",
  researchMaxTokens: 12_000,
  repairMaxTokens: 8_000,
  requestBytes: RESEARCH_PROVIDER_LIMITS.requestBytes,
  responseBytes: RESEARCH_PROVIDER_LIMITS.responseBytes,
  contentBytes: RESEARCH_PROVIDER_LIMITS.contentBytes,
  activeTtlMs: 60_000,
});

export function resolveResearchExecutor(value: unknown): ResearchExecutorSelection | null {
  if (value === undefined) return "synchronous";
  return value === BRIDGE_EXECUTOR_MODE ? BRIDGE_EXECUTOR_MODE : null;
}

export function readConfiguredResearchOrigin(
  environment: ResearchProductionEnvironment,
): string | null {
  try {
    return readConfiguredOriginValues(environment.BETTER_AUTH_URL, environment.ARC_ENVIRONMENT);
  } catch {
    return null;
  }
}

function readConfiguredOriginValues(
  origin: string | undefined,
  arcEnvironment: string | undefined,
): string | null {
  try {
    const url = new URL(origin ?? "invalid:");
    if (
      url.username
      || url.password
      || url.search
      || url.hash
      || (arcEnvironment === "production" && url.protocol !== "https:")
    ) return null;
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function readPolicyInput(environment: ResearchProductionEnvironment) {
  return {
    ARC_ENVIRONMENT: environment.ARC_ENVIRONMENT,
    BETTER_AUTH_URL: environment.BETTER_AUTH_URL,
    ARC_AI_ENABLED: environment.ARC_AI_ENABLED,
    ARC_AI_RESEARCH_ENABLED: environment.ARC_AI_RESEARCH_ENABLED,
    ARC_AI_RESEARCH_PROFILE: environment.ARC_AI_RESEARCH_PROFILE,
    ARC_AI_USER_DAILY_QUOTA: environment.ARC_AI_USER_DAILY_QUOTA,
    ARC_AI_RATE_LIMIT_PER_MINUTE: environment.ARC_AI_RATE_LIMIT_PER_MINUTE,
    ARC_AI_MODEL_RESEARCH: environment.ARC_AI_MODEL_RESEARCH,
    ARC_AI_MODEL_ECONOMY: environment.ARC_AI_MODEL_ECONOMY,
    ARC_AI_RESEARCH_TIMEOUT_MS: environment.ARC_AI_RESEARCH_TIMEOUT_MS,
    ARC_AI_REPAIR_TIMEOUT_MS: environment.ARC_AI_REPAIR_TIMEOUT_MS,
    ARC_AI_RESEARCH_CACHE_DAYS: environment.ARC_AI_RESEARCH_CACHE_DAYS,
    ARC_AI_SITE_DAILY_BUDGET_MICROS: environment.ARC_AI_SITE_DAILY_BUDGET_MICROS,
    ARC_AI_SITE_MONTHLY_BUDGET_MICROS: environment.ARC_AI_SITE_MONTHLY_BUDGET_MICROS,
    ARC_AI_RESEARCH_MAX_COST_MICROS: environment.ARC_AI_RESEARCH_MAX_COST_MICROS,
    ARC_AI_REPAIR_MAX_COST_MICROS: environment.ARC_AI_REPAIR_MAX_COST_MICROS,
    ARC_AI_IP_HASH_SALT: environment.ARC_AI_IP_HASH_SALT,
  };
}

export function readResearchPolicyConfiguration(
  environment: ResearchProductionEnvironment,
): ResearchPolicySelection | null {
  try {
    const executor = resolveResearchExecutor(environment.ARC_AI_RESEARCH_EXECUTOR);
    if (!executor) return null;
    const input = readPolicyInput(environment);
    const parsed = policySchema.safeParse(input);
    const configuredOrigin = readConfiguredOriginValues(input.BETTER_AUTH_URL, input.ARC_ENVIRONMENT);
    if (!parsed.success || !configuredOrigin) return null;
    const budget = parseResearchBudgetEnvironment(parsed.data);
    if (
      !budget
      || !budget.dailyBudgetMicros
      || !budget.monthlyBudgetMicros
      || !budget.researchMaximumMicros
    ) return null;
    const executionProfile = resolveResearchExecutionPolicy(parsed.data.ARC_AI_RESEARCH_PROFILE);
    if (executionProfile === null) return null;
    if (executor === BRIDGE_EXECUTOR_MODE && !executionProfile) return null;
    if (executionProfile) {
      if (
        parsed.data.ARC_AI_MODEL_RESEARCH !== executionProfile.model
        || parsed.data.ARC_AI_RESEARCH_TIMEOUT_MS !== executionProfile.researchTimeoutMs
        || budget.repairMaximumMicros !== 0
        || budget.researchMaximumMicros > 5_000_000
      ) return null;
    } else if (parsed.data.ARC_AI_RESEARCH_TIMEOUT_MS > 120_000) return null;
    const policy = executionProfile ? {
      ...POLICY,
      profileId: executionProfile.profileId,
      outputPolicyVersion: executionProfile.outputPolicyVersion,
      reasoningEffort: executionProfile.reasoningEffort,
      researchMaxTokens: executionProfile.maxOutputTokens,
      repairMaxTokens: 0,
      activeTtlMs: executionProfile.activeTtlMs,
    } : POLICY;
    const stablePolicy = {
      models: {
        research: parsed.data.ARC_AI_MODEL_RESEARCH,
        repair: parsed.data.ARC_AI_MODEL_ECONOMY,
      },
      timeouts: {
        research: parsed.data.ARC_AI_RESEARCH_TIMEOUT_MS,
        repair: parsed.data.ARC_AI_REPAIR_TIMEOUT_MS,
      },
      cacheDays: parsed.data.ARC_AI_RESEARCH_CACHE_DAYS,
      userDailyQuota: parsed.data.ARC_AI_USER_DAILY_QUOTA,
      rateLimitPerMinute: parsed.data.ARC_AI_RATE_LIMIT_PER_MINUTE,
      budget,
      versions: RESEARCH_CONFIGURATION_VERSIONS,
      policy,
      ...(executor === BRIDGE_EXECUTOR_MODE ? {
        executor: {
          kind: BRIDGE_EXECUTOR_MODE,
          protocol: BRIDGE_AUTH_PROTOCOL,
          queueTtlMs: BRIDGE_QUEUE_TTL_MS,
          lease: "begin-once-v1",
        },
      } : {}),
    };
    const configuration: ResearchProductionConfiguration = {
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
      ...(executionProfile ? { researchProfile: executionProfile.profileId } : {}),
      activeTtlMs: policy.activeTtlMs,
    };
    return Object.freeze({ executor, configuration });
  } catch {
    return null;
  }
}
