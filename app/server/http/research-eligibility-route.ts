import { env } from "cloudflare:workers";
import { getD1 } from "../../../db/d1";
import { researchEligibilityViewSchema } from "../../contracts/research";
import { requireArcUser, UnauthenticatedError, type ArcUser } from "../auth/session";
import { D1FeatureCohort } from "../entitlements/d1-feature-cohort";
import { readResearchProductionConfiguration, type ResearchProductionEnvironment } from "../research/service-factory";
import { apiError, apiJson, applyResponseSafety, resolveRequestId } from "./api-response";
import { D1RateLimiter, type RateLimiter } from "./rate-limit";

type Dependencies = {
  requireUser(headers: Headers): Promise<ArcUser>;
  configured(): boolean;
  cohortEnabled(userId: string): Promise<boolean>;
  rateLimiter: RateLimiter;
  createRequestId?: () => string;
};

export function createResearchEligibilityHandler(deps: Dependencies) {
  return async (request: Request) => {
    let requestId = "request-unavailable";
    let response: Response;
    try {
      let candidate: string | undefined;
      try { candidate = deps.createRequestId?.(); } catch { /* Use a safe generated identifier. */ }
      requestId = resolveRequestId(candidate);
      const user = await deps.requireUser(request.headers);
      const rate = await deps.rateLimiter.reserve({ scope: "research:eligibility:account", subject: user.id, limit: 30, windowSeconds: 60 });
      if (typeof rate.allowed !== "boolean" || !Number.isInteger(rate.retryAfterSeconds)) throw new Error();
      if (!rate.allowed) {
        response = apiError("RATE_LIMITED", "Too many requests. Try again shortly.", 429, requestId,
          { "Retry-After": String(Math.min(3600, Math.max(1, rate.retryAfterSeconds))) }, "retry");
      } else {
        let eligible = false;
        try { eligible = deps.configured() && await deps.cohortEnabled(user.id) === true; }
        catch { /* A capability hint must fail closed without denial details. */ }
        response = apiJson(researchEligibilityViewSchema.parse({ eligible, requestId }), requestId);
      }
    } catch (error) {
      response = error instanceof UnauthenticatedError
        ? apiError("UNAUTHENTICATED", "Sign in to use Arc research.", 401, requestId, undefined, "sign-in")
        : apiError("UNAVAILABLE", "Research eligibility is temporarily unavailable.", 503, requestId, undefined, "retry");
    }
    return applyResponseSafety(response, requestId);
  };
}

// This read has no Research service, Provider or quota/budget capability.
export function createResearchEligibilityDependencies(runtime: {
  environment: ResearchProductionEnvironment;
  getD1(): D1Database;
} = { environment: env, getD1 }): Dependencies {
  return {
    requireUser: requireArcUser,
    configured: () => readResearchProductionConfiguration(runtime.environment) !== null,
    cohortEnabled: (userId) => new D1FeatureCohort(runtime.getD1()).allows("role-research-beta", userId),
    rateLimiter: { reserve: (input) => new D1RateLimiter(runtime.getD1()).reserve(input) },
  };
}
