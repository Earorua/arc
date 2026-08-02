import { env } from "cloudflare:workers";
import { z } from "zod";
import { getD1 } from "../../../../db/d1";
import { D1AiRunSink } from "../../../server/ai/d1-run-recorder";
import { AiGateway, type AiGatewayResult } from "../../../server/ai/gateway";
import { MockAiProvider } from "../../../server/ai/mock-provider";
import { requireArcUser, UnauthenticatedError, type ArcUser } from "../../../server/auth/session";
import { D1EntitlementRepository } from "../../../server/entitlements/d1-entitlement-repository";
import { D1FeatureCohort } from "../../../server/entitlements/d1-feature-cohort";
import { EntitlementGate } from "../../../server/entitlements/policy";
import { apiError, apiJson } from "../../../server/http/api-response";
import {
  D1RateLimiter,
  RateLimitUnavailableError,
  type RateLimiter,
} from "../../../server/http/rate-limit";

const previewInputSchema = z.object({
  role: z.string().trim().min(2).max(160),
  locale: z.enum(["zh-CN", "en-US"]).default("zh-CN"),
}).strict();

type PreviewGateway = {
  research(userId: string, input: unknown): Promise<AiGatewayResult>;
};

export type IntelligencePreviewDependencies = {
  requireUser: (headers: Headers) => Promise<ArcUser>;
  rateLimiter: RateLimiter;
  createGateway: () => PreviewGateway;
  createRequestId?: () => string;
  rateLimitPerMinute?: () => number;
};

class InvalidPreviewInputError extends Error {}

async function readInput(request: Request) {
  try {
    const parsed = previewInputSchema.safeParse(await request.json());
    if (!parsed.success) throw new InvalidPreviewInputError();
    return parsed.data;
  } catch (error) {
    if (error instanceof InvalidPreviewInputError) throw error;
    throw new InvalidPreviewInputError();
  }
}

export function createIntelligencePreviewHandler(deps: IntelligencePreviewDependencies) {
  return async function POST(request: Request): Promise<Response> {
    const requestId = (deps.createRequestId ?? (() => crypto.randomUUID()))();
    try {
      const user = await deps.requireUser(request.headers);
      const input = await readInput(request);
      const limit = (deps.rateLimitPerMinute ?? (() => 2))();
      const reservation = await deps.rateLimiter.reserve({
        scope: "intelligence:preview",
        subject: user.id,
        limit,
        windowSeconds: 60,
      });
      if (!reservation.allowed) {
        return apiError(
          "RATE_LIMITED",
          "The intelligence preview is receiving too many requests.",
          429,
          requestId,
          { "Retry-After": String(reservation.retryAfterSeconds) },
        );
      }

      const result = await deps.createGateway().research(user.id, {
        requestId,
        role: input.role,
        locale: input.locale,
      });
      if (!result.accepted) {
        const rateDenial = result.reason === "quota" || result.reason === "rate" || result.reason === "budget";
        return apiError(
          rateDenial ? "RATE_LIMITED" : "UNAVAILABLE",
          rateDenial
            ? "The current Arc intelligence allowance has been reached."
            : "The intelligence preview is not enabled for this account.",
          rateDenial ? 429 : 503,
          requestId,
        );
      }
      return apiJson({ preview: result.preview }, requestId);
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        return apiError("UNAUTHENTICATED", "Sign in to use Arc intelligence.", 401, requestId);
      }
      if (error instanceof InvalidPreviewInputError) {
        return apiError("INVALID_INPUT", "Enter a role between 2 and 160 characters.", 400, requestId);
      }
      if (error instanceof RateLimitUnavailableError) {
        return apiError("UNAVAILABLE", "The intelligence preview is temporarily unavailable.", 503, requestId);
      }
      return apiError("INTERNAL", "Arc could not create the intelligence preview.", 500, requestId);
    }
  };
}

const productionDependencies: IntelligencePreviewDependencies = {
  requireUser: (headers) => requireArcUser(headers),
  rateLimiter: {
    reserve: (request) => new D1RateLimiter(getD1()).reserve(request),
  },
  rateLimitPerMinute: () => Number(env.ARC_AI_RATE_LIMIT_PER_MINUTE),
  createGateway: () => {
    const db = getD1();
    const entitlements = new EntitlementGate(new D1EntitlementRepository(db), {
      ARC_AI_ENABLED: env.ARC_AI_ENABLED,
      ARC_AI_USER_DAILY_QUOTA: env.ARC_AI_USER_DAILY_QUOTA,
      ARC_AI_GLOBAL_DAILY_BUDGET_UNITS: env.ARC_AI_GLOBAL_DAILY_BUDGET_UNITS,
      ARC_AI_RATE_LIMIT_PER_MINUTE: env.ARC_AI_RATE_LIMIT_PER_MINUTE,
    });
    return new AiGateway({
      provider: new MockAiProvider(),
      entitlements,
      runs: new D1AiRunSink(db),
      cohortEnabled: (userId) => new D1FeatureCohort(db).allows("role-research-preview", userId),
    });
  },
};

export const dynamic = "force-dynamic";
export const POST = createIntelligencePreviewHandler(productionDependencies);
