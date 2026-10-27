import { env } from "cloudflare:workers";
import { z } from "zod";
import { getD1 } from "../../../db/d1";
import { D1AiRunSink } from "../ai/d1-run-recorder";
import { D1EntitlementRepository } from "../entitlements/d1-entitlement-repository";
import { D1FeatureCohort } from "../entitlements/d1-feature-cohort";
import { EntitlementGate } from "../entitlements/policy";
import { D1ResearchBudgetRepository } from "./d1-budget-repository";
import { D1ResearchRepository } from "./d1-repository";
import { D1SiteExecutionRepository } from "./d1-site-execution-repository";
import { D1SiteBridgeRepository } from "./d1-site-bridge-repository";
import { readResearchBridgeConnection } from "./executor/connection-config";
import { D1BridgeNonceStore } from "./executor/d1-nonce-store";
import { ExecutorBridgeClient } from "./executor/executor-client";
import { BridgeTransport } from "./executor/http-transport";
import { resolveResearchBridgeFetch } from "./executor/service-binding-transport";
import { OpenRouterResearchProvider, type OpenRouterResearchConfig } from "./openrouter-provider";
import { ResearchOrchestrator, type ResearchOrchestratorConfig } from "./orchestrator";
import {
  readConfiguredResearchOrigin,
  readResearchPolicyConfiguration,
  RESEARCH_CONFIGURATION_VERSIONS,
  type ResearchProductionConfiguration,
  type ResearchProductionEnvironment,
} from "./production-policy";
import { ResearchProviderError, type ResearchProvider } from "./provider";
import { RemoteResearchReader } from "./remote-public-reader";
import { RemoteResearchService } from "./remote-public-service";
import { ResearchRepositoryError } from "./repository";
import type { ResearchService } from "./service";
import { createGuardedD1, createSiteBridgeOperations } from "./site-bridge-factory";

export {
  type ResearchProductionConfiguration,
  type ResearchProductionEnvironment,
} from "./production-policy";

const secretSchema = z.string().min(1).max(512).regex(/^[A-Za-z0-9._-]+$/u);
const saltSchema = z.string().min(16).max(256)
  .refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f-\u009f]/u.test(value));

type TrustedConfiguration = ResearchProductionConfiguration & {
  apiKey: string;
  ipHashSalt: string;
};

function trustedConfiguration(environment: ResearchProductionEnvironment): TrustedConfiguration | null {
  const selection = readResearchPolicyConfiguration(environment);
  if (!selection || selection.executor !== "synchronous") return null;
  try {
    const key = secretSchema.safeParse(environment.OPENROUTER_API_KEY);
    const salt = saltSchema.safeParse(environment.ARC_AI_IP_HASH_SALT);
    if (!key.success || !salt.success) return null;
    return { ...selection.configuration, apiKey: key.data, ipHashSalt: salt.data };
  } catch {
    return null;
  }
}

export function readResearchProductionConfiguration(
  environment: ResearchProductionEnvironment,
): ResearchProductionConfiguration | null {
  const selection = readResearchPolicyConfiguration(environment);
  if (!selection) return null;
  if (selection.executor === "cloudflare-workflow-v1") {
    const connection = readResearchBridgeConnection(environment);
    return connection && resolveResearchBridgeFetch(environment, connection, "executor") ? selection.configuration : null;
  }
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
    ...(trusted.researchProfile ? { researchProfile: trusted.researchProfile } : {}),
    activeTtlMs: trusted.activeTtlMs,
  };
}

export type ResearchServiceFactoryRuntime = {
  environment: ResearchProductionEnvironment;
  getD1: () => D1Database;
  createProvider?: (config: OpenRouterResearchConfig) => ResearchProvider;
  now?: () => number;
  createId?: () => string;
  fetch?: typeof fetch;
  monoNow?: () => number;
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
    versions: RESEARCH_CONFIGURATION_VERSIONS,
    activeTtlMs: configuration.activeTtlMs,
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
    const executions = new D1SiteExecutionRepository(db, repository);
    const budget = new D1ResearchBudgetRepository(db, options);
    const entitlements = new EntitlementGate(new D1EntitlementRepository(db, options), {
      ARC_AI_ENABLED: runtime.environment.ARC_AI_ENABLED,
      ARC_AI_USER_DAILY_QUOTA: runtime.environment.ARC_AI_USER_DAILY_QUOTA,
      ARC_AI_RATE_LIMIT_PER_MINUTE: runtime.environment.ARC_AI_RATE_LIMIT_PER_MINUTE,
    }, runtime.now ? { now: () => new Date(runtime.now!()) } : {});
    const audits = new D1AiRunSink(db, options);
    return { db, repository, executions, budget, entitlements, audits, options };
  };

  const recoveryDelegate = (dependencies: ReturnType<typeof repositoryDependencies>) => {
    const { repository, executions, budget, entitlements, audits } = dependencies;
    const provider: ResearchProvider = {
      research: async () => { throw new ResearchProviderError("unavailable", false, false); },
      repair: async () => { throw new ResearchProviderError("unavailable", false, false); },
    };
    return new ResearchOrchestrator({ repository, budget, entitlements, audits, provider,
      readRemoteExecution: (owner, run) => executions.read(owner, run),
      config: { configFingerprint: "recovery-only-v1", providerName: "openrouter",
        versions: RESEARCH_CONFIGURATION_VERSIONS, activeTtlMs: 1, cacheDays: 1,
        budget: { dailyBudgetMicros: 0, monthlyBudgetMicros: 0, maximumMicros: 0, researchMaximumMicros: 0, repairMaximumMicros: 0 } },
      now: runtime.now, createRequestId: runtime.createId });
  };

  const remoteComposition = (dependencies: ReturnType<typeof repositoryDependencies>) => {
    const { db, options } = dependencies;
    const wallNow = runtime.now ?? Date.now;
    const monoNow = runtime.monoNow ?? (() => performance.now());
    // Recovery parses connection only, independently of new-call switches, profile and credentials.
    const connection = readResearchBridgeConnection(runtime.environment);
    const bridgeFetch = connection && resolveResearchBridgeFetch(runtime.environment, connection, "executor", runtime.fetch);
    const createReadRepositories = (guard: () => void) => {
      const guarded = createGuardedD1(db, guard);
      const research = new D1ResearchRepository(guarded, options);
      const executions = new D1SiteExecutionRepository(guarded, research);
      return { research, executions, bridge: new D1SiteBridgeRepository(guarded, research, executions) };
    };
    const createOperations = (guard: () => void) => createSiteBridgeOperations(db, guard, wallNow);
    const createExecutor = (guard: () => void) => connection && bridgeFetch
      ? new ExecutorBridgeClient(new BridgeTransport({ connection,
        nonces: new D1BridgeNonceStore(createGuardedD1(db, guard)),
        fetch: bridgeFetch, wallNow, monoNow })) : null;
    const reader = new RemoteResearchReader({ createReadRepositories, createOperations, createExecutor,
      legacy: recoveryDelegate(dependencies), monoNow });
    return { reader, createReadRepositories, createOperations, createExecutor, monoNow };
  };

  return {
    createRecoveryService(): ResearchService {
      const { reader } = remoteComposition(repositoryDependencies());
      const unavailable = async () => { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); };
      return { start: unavailable, retry: unavailable,
        get: (owner, run) => reader.get(owner, run), recover: (owner, input) => reader.recover(owner, input) };
    },
    createNewCallService(): ResearchService | null {
      const selection = readResearchPolicyConfiguration(runtime.environment);
      if (!selection) return null;
      if (selection.executor === "cloudflare-workflow-v1") {
        const connection = readResearchBridgeConnection(runtime.environment);
        if (!connection || !resolveResearchBridgeFetch(runtime.environment, connection, "executor", runtime.fetch)) return null;
        const { reader, createReadRepositories, createOperations, createExecutor, monoNow } = remoteComposition(repositoryDependencies());
        return new RemoteResearchService({ reader, configuration: selection.configuration, createExecutor, monoNow,
          createRequestId: runtime.createId,
          newCallsAllowed: () => readResearchPolicyConfiguration(runtime.environment)?.executor === "cloudflare-workflow-v1",
          createWriteRepositories: (guard) => ({ ...createReadRepositories(guard), admission: createOperations(guard).admission }) });
      }
      const trusted = trustedConfiguration(runtime.environment);
      if (!trusted) return null;
      const dependencies = repositoryDependencies();
      const { repository, executions, budget, entitlements, audits } = dependencies;
      const providerConfig: OpenRouterResearchConfig = {
        OPENROUTER_API_KEY: trusted.apiKey,
        ARC_AI_MODEL_RESEARCH: trusted.modelResearch,
        ARC_AI_MODEL_ECONOMY: trusted.modelEconomy,
        researchTimeoutMs: trusted.researchTimeoutMs,
        repairTimeoutMs: trusted.repairTimeoutMs,
        ...(trusted.researchProfile ? { researchProfile: trusted.researchProfile } : {}),
      };
      const provider = (runtime.createProvider ?? ((config) => new OpenRouterResearchProvider(config)))(providerConfig);
      const legacy = new ResearchOrchestrator({
        repository, budget, entitlements, audits, provider,
        readRemoteExecution: (owner, run) => executions.read(owner, run),
        config: orchestratorConfig(trusted),
        now: runtime.now,
        createRequestId: runtime.createId,
      });
      const { reader } = remoteComposition(dependencies);
      return { start: (owner, input, gate) => legacy.start(owner, input, gate),
        retry: (owner, run, mutation, gate) => legacy.retry(owner, run, mutation, gate),
        get: (owner, run) => reader.get(owner, run), recover: (owner, input) => reader.recover(owner, input) };
    },
    cohortEnabled(userId: string) {
      return new D1FeatureCohort(runtime.getD1()).allows("role-research-beta", userId);
    },
    configuredOrigin() {
      return readConfiguredResearchOrigin(runtime.environment);
    },
    rateLimitPerMinute() {
      return readResearchProductionConfiguration(runtime.environment)?.rateLimitPerMinute ?? 0;
    },
    async deriveIpSubject(request: Request) {
      const salt = saltSchema.safeParse(runtime.environment.ARC_AI_IP_HASH_SALT);
      const ip = ipAddress(request.headers.get("cf-connecting-ip"));
      if (!salt.success || !ip) throw new ResearchProviderError("unavailable", false, false);
      return `ip:${await sha256(`${salt.data}\0research-ip\0${ip}`)}`;
    },
  };
}
