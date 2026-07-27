import { getD1 } from "../../../../../db/d1";
import { apiError } from "../../../../server/http/api-response";
import { D1ProofRepository } from "../../../../server/proof/d1-proof-repository";
import {
  hashShareToken,
  sanitizeStoredPublicProofView,
} from "../../../../server/proof/public-view";
import type { ProofRepository } from "../../../../server/proof/repository";

type RouteContext = { params: Promise<{ token: string }> };

export type PublicProofRouteDependencies = {
  repository: Pick<ProofRepository, "getActiveShareByTokenHash">;
  createRequestId?: () => string;
  hashToken?: (token: string) => Promise<string>;
};

const tokenPattern = /^[A-Za-z0-9_-]{43}$/u;

function notFound(requestId: string) {
  return apiError("NOT_FOUND", "Public proof was not found.", 404, requestId);
}

export function createPublicProofHandler(deps: PublicProofRouteDependencies) {
  return async function GET(_request: Request, context: RouteContext): Promise<Response> {
    const requestId = (deps.createRequestId ?? (() => crypto.randomUUID()))();
    try {
      const { token } = await context.params;
      if (!tokenPattern.test(token)) return notFound(requestId);
      const tokenHash = await (deps.hashToken ?? hashShareToken)(token);
      const share = await deps.repository.getActiveShareByTokenHash(tokenHash);
      if (!share) return notFound(requestId);
      const publicView = sanitizeStoredPublicProofView(share.publicView);
      if (!publicView) return notFound(requestId);

      return Response.json({ proof: publicView }, {
        headers: {
          "Cache-Control": "public, max-age=60",
          "X-Content-Type-Options": "nosniff",
          "X-Request-Id": requestId,
        },
      });
    } catch {
      return apiError("INTERNAL", "Arc could not retrieve the public proof.", 500, requestId);
    }
  };
}

function productionDependencies(): PublicProofRouteDependencies {
  return { repository: new D1ProofRepository(getD1()) };
}

export const dynamic = "force-dynamic";
export const GET = (request: Request, context: RouteContext) => (
  createPublicProofHandler(productionDependencies())(request, context)
);
