import type { RoleBlueprint } from "../../../contracts/intelligence";
import { BuiltinIntelligenceRepository } from "../../../server/intelligence/builtin-repository";
import { IntelligenceService } from "../../../server/intelligence/service";
import { apiError, apiJson } from "../../../server/http/api-response";

const flagshipSlug = "ai-native-full-stack-engineer";
const publicCacheControl = "public, max-age=300, stale-while-revalidate=3600";

export type FlagshipIntelligenceDependencies = {
  getBlueprint: () => Promise<RoleBlueprint | null>;
  createRequestId?: () => string;
};

export function createFlagshipIntelligenceHandler(
  deps: FlagshipIntelligenceDependencies,
) {
  return async function GET(): Promise<Response> {
    const requestId = (deps.createRequestId ?? (() => crypto.randomUUID()))();

    try {
      const blueprint = await deps.getBlueprint();
      if (blueprint === null) {
        return apiError(
          "NOT_FOUND",
          "Flagship role intelligence was not found.",
          404,
          requestId,
        );
      }

      return apiJson({ blueprint }, requestId, {
        headers: { "Cache-Control": publicCacheControl },
      });
    } catch {
      return apiError(
        "UNAVAILABLE",
        "Flagship role intelligence is temporarily unavailable.",
        503,
        requestId,
      );
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
