import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db/d1";
import { D1AdminRepository } from "../../../server/admin/d1-admin-repository";
import {
  readAdminPolicy,
  readResearchRuntimePolicy,
  type AdminEnvironment,
} from "../../../server/admin/policy";
import {
  adminHealthSnapshotSchema,
  type AdminRepository,
} from "../../../server/admin/repository";
import { requireArcUser, UnauthenticatedError, type ArcUser } from "../../../server/auth/session";
import { apiError, apiJson } from "../../../server/http/api-response";

export type AdminHealthRouteDependencies = {
  requireUser: (headers: Headers) => Promise<ArcUser>;
  environment: AdminEnvironment;
  repository: AdminRepository;
  createRequestId?: () => string;
};

export function createAdminHealthHandler(deps: AdminHealthRouteDependencies) {
  return async function GET(request: Request): Promise<Response> {
    const requestId = (deps.createRequestId ?? (() => crypto.randomUUID()))();
    try {
      const user = await deps.requireUser(request.headers);
      if (!readAdminPolicy(deps.environment).allows(user.email)) {
        return apiError("FORBIDDEN", "This Arc account cannot access operations.", 403, requestId);
      }
      const health = await deps.repository.getHealthSnapshot();
      const effectiveHealth = adminHealthSnapshotSchema.parse({
        ...health,
        ai: {
          ...health.ai,
          enabled: health.ai.enabled && readResearchRuntimePolicy(deps.environment).enabled,
        },
      });
      return apiJson({ health: effectiveHealth }, requestId, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        return apiError("UNAUTHENTICATED", "Sign in to access Arc operations.", 401, requestId);
      }
      return apiError("INTERNAL", "Arc operations are temporarily unavailable.", 500, requestId);
    }
  };
}

function productionDependencies(): AdminHealthRouteDependencies {
  return {
    requireUser: (headers) => requireArcUser(headers),
    environment: {
      ARC_ADMIN_EMAILS: env.ARC_ADMIN_EMAILS,
      ARC_ENVIRONMENT: env.ARC_ENVIRONMENT,
      BETTER_AUTH_URL: env.BETTER_AUTH_URL,
      ARC_AI_ENABLED: env.ARC_AI_ENABLED,
      ARC_AI_RESEARCH_ENABLED: env.ARC_AI_RESEARCH_ENABLED,
      ARC_AI_USER_DAILY_QUOTA: env.ARC_AI_USER_DAILY_QUOTA,
      ARC_AI_RATE_LIMIT_PER_MINUTE: env.ARC_AI_RATE_LIMIT_PER_MINUTE,
      ARC_AI_MODEL_RESEARCH: env.ARC_AI_MODEL_RESEARCH,
      ARC_AI_MODEL_ECONOMY: env.ARC_AI_MODEL_ECONOMY,
      ARC_AI_RESEARCH_TIMEOUT_MS: env.ARC_AI_RESEARCH_TIMEOUT_MS,
      ARC_AI_REPAIR_TIMEOUT_MS: env.ARC_AI_REPAIR_TIMEOUT_MS,
      ARC_AI_RESEARCH_CACHE_DAYS: env.ARC_AI_RESEARCH_CACHE_DAYS,
      ARC_AI_SITE_DAILY_BUDGET_MICROS: env.ARC_AI_SITE_DAILY_BUDGET_MICROS,
      ARC_AI_SITE_MONTHLY_BUDGET_MICROS: env.ARC_AI_SITE_MONTHLY_BUDGET_MICROS,
      ARC_AI_RESEARCH_MAX_COST_MICROS: env.ARC_AI_RESEARCH_MAX_COST_MICROS,
      ARC_AI_REPAIR_MAX_COST_MICROS: env.ARC_AI_REPAIR_MAX_COST_MICROS,
      ARC_AI_IP_HASH_SALT: env.ARC_AI_IP_HASH_SALT,
      OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
    },
    repository: new D1AdminRepository(getD1()),
  };
}

export const dynamic = "force-dynamic";
export const GET = (request: Request) => createAdminHealthHandler(productionDependencies())(request);
