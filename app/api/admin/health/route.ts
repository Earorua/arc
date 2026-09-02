import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db/d1";
import { D1AdminRepository } from "../../../server/admin/d1-admin-repository";
import { readAdminPolicy, type AdminEnvironment } from "../../../server/admin/policy";
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
          enabled: health.ai.enabled && deps.environment.ARC_AI_ENABLED === "true",
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
      ARC_AI_ENABLED: env.ARC_AI_ENABLED,
    },
    repository: new D1AdminRepository(getD1()),
  };
}

export const dynamic = "force-dynamic";
export const GET = (request: Request) => createAdminHealthHandler(productionDependencies())(request);
