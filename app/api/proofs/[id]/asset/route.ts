import { env } from "cloudflare:workers";
import { getD1 } from "../../../../../db/d1";
import { requireArcUser, UnauthenticatedError, type ArcUser } from "../../../../server/auth/session";
import { apiError } from "../../../../server/http/api-response";
import { D1ProofRepository } from "../../../../server/proof/d1-proof-repository";
import type { ProofRepository } from "../../../../server/proof/repository";
import { R2ProofStorage, type ProofStorage } from "../../../../server/proof/storage";

type RouteContext = { params: Promise<{ id: string }> };

export type ProofAssetRouteDependencies = {
  requireUser: (headers: Headers) => Promise<ArcUser>;
  repository: Pick<ProofRepository, "getOwnedAsset">;
  storage: Pick<ProofStorage, "get">;
  createRequestId?: () => string;
};

function safeAttachmentName(filename: string): string {
  const sanitized = filename.replace(/["\\\r\n]/g, "_").slice(0, 255);
  return sanitized || "arc-proof";
}

function notFound(requestId: string) {
  return apiError("NOT_FOUND", "Proof asset was not found.", 404, requestId);
}

export function createProofAssetHandler(deps: ProofAssetRouteDependencies) {
  return async function GET(request: Request, context: RouteContext): Promise<Response> {
    const requestId = (deps.createRequestId ?? (() => crypto.randomUUID()))();
    try {
      const user = await deps.requireUser(request.headers);
      const { id: proofId } = await context.params;
      if (!proofId || proofId.length > 200) return notFound(requestId);
      const metadata = await deps.repository.getOwnedAsset(user.id, proofId);
      if (!metadata) return notFound(requestId);
      const object = await deps.storage.get(metadata.objectKey);
      if (!object) return notFound(requestId);

      return new Response(object.body, {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition": `attachment; filename="${safeAttachmentName(metadata.filename)}"`,
          "Content-Length": String(metadata.sizeBytes),
          "Content-Type": metadata.contentType,
          "X-Content-Type-Options": "nosniff",
          "X-Request-Id": requestId,
        },
      });
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        return apiError("UNAUTHENTICATED", "Sign in to access proof assets.", 401, requestId);
      }
      return apiError("INTERNAL", "Arc could not retrieve the proof asset.", 500, requestId);
    }
  };
}

function productionDependencies(): ProofAssetRouteDependencies {
  const db = getD1();
  return {
    requireUser: (headers) => requireArcUser(headers),
    repository: new D1ProofRepository(db),
    storage: new R2ProofStorage(env.PROOF_ASSETS),
  };
}

export const dynamic = "force-dynamic";
export const GET = (request: Request, context: RouteContext) => (
  createProofAssetHandler(productionDependencies())(request, context)
);
