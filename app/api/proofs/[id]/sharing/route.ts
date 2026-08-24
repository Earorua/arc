import { getD1 } from "../../../../../db/d1";
import { requireArcUser, UnauthenticatedError, type ArcUser } from "../../../../server/auth/session";
import { apiError, apiJson } from "../../../../server/http/api-response";
import {
  D1RateLimiter,
  RateLimitUnavailableError,
  type RateLimiter,
} from "../../../../server/http/rate-limit";
import { D1ProofRepository } from "../../../../server/proof/d1-proof-repository";
import { flagshipBlueprint } from "../../../../data/flagship-blueprint";
import { projectSkillEvidence } from "../../../../lib/proof/projection";
import {
  createLegacyPublicProofView,
  createPublicProofView,
  createShareToken,
  hashShareToken,
  publicProofFieldsSchema,
  type PublicProofView,
} from "../../../../server/proof/public-view";
import type { ProofRepository } from "../../../../server/proof/repository";

type RouteContext = { params: Promise<{ id: string }> };

export type ProofSharingRouteDependencies = {
  requireUser: (headers: Headers) => Promise<ArcUser>;
  rateLimiter: RateLimiter;
  repository: Pick<ProofRepository,
    "findActiveGoal" | "load" | "getOwnedProofSnapshot" | "upsertShare" | "revokeShare">;
  createRequestId?: () => string;
  createId?: () => string;
  createToken?: () => string;
  hashToken?: (token: string) => Promise<string>;
  rateLimitPerMinute?: number;
};

class InvalidSharingInputError extends Error {}

function notFound(requestId: string) {
  return apiError("NOT_FOUND", "Proof was not found.", 404, requestId);
}

async function reserveMutation(
  deps: ProofSharingRouteDependencies,
  userId: string,
  operation: "create" | "revoke",
) {
  return deps.rateLimiter.reserve({
    scope: `proof:sharing:${operation}`,
    subject: userId,
    limit: deps.rateLimitPerMinute ?? 6,
    windowSeconds: 60,
  });
}

export function createProofSharingHandlers(deps: ProofSharingRouteDependencies) {
  async function PUT(request: Request, context: RouteContext): Promise<Response> {
    const requestId = (deps.createRequestId ?? (() => crypto.randomUUID()))();
    try {
      const user = await deps.requireUser(request.headers);
      const rate = await reserveMutation(deps, user.id, "create");
      if (!rate.allowed) {
        return apiError("RATE_LIMITED", "Proof sharing is receiving too many requests.", 429, requestId, {
          "Retry-After": String(rate.retryAfterSeconds),
        });
      }
      const { id: proofId } = await context.params;
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        throw new InvalidSharingInputError();
      }
      const parsed = publicProofFieldsSchema.safeParse(
        typeof raw === "object" && raw !== null && !Array.isArray(raw)
          ? (raw as Record<string, unknown>).fields
          : undefined,
      );
      if (!parsed.success || !proofId || proofId.length > 200) {
        throw new InvalidSharingInputError();
      }
      const scope = await deps.repository.findActiveGoal(user.id);
      const workspace = scope ? await deps.repository.load(scope) : null;
      const versions = workspace?.versions.filter((version) => version.proofId === proofId)
        .sort((left, right) => right.versionNumber - left.versionNumber) ?? [];
      const version = versions[0];
      const skillNamesById = new Map(flagshipBlueprint.skills.map((skill) => [skill.id, skill.name]));
      let publicView: PublicProofView;
      if (version) {
        const versionReviews = workspace!.reviews.filter((review) => review.versionId === version.id);
        const publicProjection = projectSkillEvidence({
          skillIds: version.skillIds,
          completedSkillIds: new Set(),
          versions: [version],
          reviews: versionReviews,
          visibility: "public",
        });
        const status = publicProjection.some(({ status: value }) => value === "verified")
          ? "verified" as const
          : publicProjection.some(({ status: value }) => value === "demonstrated")
            ? "demonstrated" as const
            : null;
        const skillNames = version.skillIds.map((skillId) => skillNamesById.get(skillId));
        if (!status || skillNames.some((name) => !name)) return notFound(requestId);
        publicView = createPublicProofView({
          version, status, skillNames: skillNames as string[], fields: parsed.data,
        });
      } else {
        const snapshot = await deps.repository.getOwnedProofSnapshot(user.id, proofId);
        if (!snapshot || snapshot.source !== "legacy") return notFound(requestId);
        const includesSkillNames = parsed.data.includes("skillNames");
        const skillNames = includesSkillNames
          ? snapshot.proof.skillIds.map((skillId) => skillNamesById.get(skillId))
          : [];
        if (includesSkillNames && skillNames.some((name) => !name)) return notFound(requestId);
        const legacyView = createLegacyPublicProofView({
          proof: snapshot.proof, skillNames: skillNames as string[], fields: parsed.data,
        });
        if (!legacyView) return notFound(requestId);
        publicView = legacyView;
      }

      const token = (deps.createToken ?? createShareToken)();
      const tokenHash = await (deps.hashToken ?? hashShareToken)(token);
      await deps.repository.upsertShare({
        id: (deps.createId ?? (() => crypto.randomUUID()))(),
        userId: user.id,
        proofId,
        tokenHash,
        publishedFields: parsed.data,
        publicView,
      });
      return apiJson({
        share: {
          token,
          path: `/api/public/proofs/${token}`,
          fields: parsed.data,
        },
      }, requestId);
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        return apiError("UNAUTHENTICATED", "Sign in to share proof.", 401, requestId);
      }
      if (error instanceof InvalidSharingInputError) {
        return apiError("INVALID_INPUT", "Choose one or more distinct public proof fields.", 400, requestId);
      }
      if (error instanceof RateLimitUnavailableError) {
        return apiError("UNAVAILABLE", "Proof sharing is temporarily unavailable.", 503, requestId);
      }
      return apiError("INTERNAL", "Arc could not create the proof share.", 500, requestId);
    }
  }

  async function DELETE(request: Request, context: RouteContext): Promise<Response> {
    const requestId = (deps.createRequestId ?? (() => crypto.randomUUID()))();
    try {
      const user = await deps.requireUser(request.headers);
      const rate = await reserveMutation(deps, user.id, "revoke");
      if (!rate.allowed) {
        return apiError("RATE_LIMITED", "Proof sharing is receiving too many requests.", 429, requestId, {
          "Retry-After": String(rate.retryAfterSeconds),
        });
      }
      const { id: proofId } = await context.params;
      if (!proofId || proofId.length > 200) return notFound(requestId);
      const revoked = await deps.repository.revokeShare(user.id, proofId);
      if (!revoked) return notFound(requestId);
      return apiJson({ revoked: true }, requestId);
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        return apiError("UNAUTHENTICATED", "Sign in to revoke proof sharing.", 401, requestId);
      }
      if (error instanceof RateLimitUnavailableError) {
        return apiError("UNAVAILABLE", "Proof sharing is temporarily unavailable.", 503, requestId);
      }
      return apiError("INTERNAL", "Arc could not revoke the proof share.", 500, requestId);
    }
  }

  return { PUT, DELETE };
}

function productionDependencies(): ProofSharingRouteDependencies {
  const db = getD1();
  return {
    requireUser: (headers) => requireArcUser(headers),
    rateLimiter: new D1RateLimiter(db),
    repository: new D1ProofRepository(db),
  };
}

export const dynamic = "force-dynamic";
export const PUT = (request: Request, context: RouteContext) => (
  createProofSharingHandlers(productionDependencies()).PUT(request, context)
);
export const DELETE = (request: Request, context: RouteContext) => (
  createProofSharingHandlers(productionDependencies()).DELETE(request, context)
);
