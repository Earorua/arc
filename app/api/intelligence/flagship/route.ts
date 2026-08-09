import type { RoleBlueprint } from "../../../contracts/intelligence";
import { BuiltinIntelligenceRepository } from "../../../server/intelligence/builtin-repository";
import { IntelligenceService } from "../../../server/intelligence/service";
import { apiError, applyResponseSafety } from "../../../server/http/api-response";

const flagshipSlug = "ai-native-full-stack-engineer";
const publicCacheControl = "public, max-age=300, stale-while-revalidate=3600";
const safetyHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function unavailable(requestId: string): Response {
  return applyResponseSafety(apiError(
    "UNAVAILABLE",
    "Flagship role intelligence is temporarily unavailable.",
    503,
    requestId,
  ), requestId);
}

export type FlagshipIntelligenceDependencies = {
  getBlueprint: () => Promise<RoleBlueprint | null>;
  createRequestId?: () => string;
};

export function createFlagshipIntelligenceHandler(
  deps: FlagshipIntelligenceDependencies,
) {
  return async function GET(): Promise<Response> {
    let requestId: string;
    try {
      requestId = (deps.createRequestId ?? (() => crypto.randomUUID()))();
    } catch {
      return unavailable(crypto.randomUUID());
    }

    try {
      const blueprint = await deps.getBlueprint();
      if (blueprint === null) {
        return applyResponseSafety(apiError(
          "NOT_FOUND",
          "Flagship role intelligence was not found.",
          404,
          requestId,
        ), requestId);
      }

      return Response.json({ blueprint }, {
        headers: {
          "Cache-Control": publicCacheControl,
          ...safetyHeaders,
        },
      });
    } catch {
      return unavailable(requestId);
    }
  };
}

const intelligenceService = new IntelligenceService(
  new BuiltinIntelligenceRepository(),
);

export const dynamic = "force-dynamic";
export const GET = createFlagshipIntelligenceHandler({
  getBlueprint: () => intelligenceService.getPublished(flagshipSlug),
});
