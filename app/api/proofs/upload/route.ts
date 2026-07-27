import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db/d1";
import { requireArcUser, UnauthenticatedError, type ArcUser } from "../../../server/auth/session";
import { apiError, apiJson } from "../../../server/http/api-response";
import {
  D1RateLimiter,
  RateLimitUnavailableError,
  type RateLimiter,
} from "../../../server/http/rate-limit";
import { D1ProofRepository } from "../../../server/proof/d1-proof-repository";
import type { ProofRepository } from "../../../server/proof/repository";
import {
  ProofUploadValidationError,
  R2ProofStorage,
  proofObjectKey,
  validateProofUpload,
  type ProofStorage,
} from "../../../server/proof/storage";

export type ProofUploadRouteDependencies = {
  requireUser: (headers: Headers) => Promise<ArcUser>;
  rateLimiter: RateLimiter;
  repository: ProofRepository;
  storage: ProofStorage;
  createRequestId?: () => string;
  createId?: () => string;
  rateLimitPerMinute?: number;
  readFormData?: (request: Request) => Promise<Pick<FormData, "getAll">>;
};

class InvalidUploadInputError extends Error {}
class OwnedProofNotFoundError extends Error {}

function asUploadFile(value: FormDataEntryValue | null): File {
  if (!value || typeof value === "string"
    || typeof value.name !== "string"
    || typeof value.size !== "number"
    || typeof value.type !== "string") {
    throw new InvalidUploadInputError();
  }
  return value;
}

export function createProofUploadHandler(deps: ProofUploadRouteDependencies) {
  return async function POST(request: Request): Promise<Response> {
    const requestId = (deps.createRequestId ?? (() => crypto.randomUUID()))();
    try {
      const user = await deps.requireUser(request.headers);
      const rate = await deps.rateLimiter.reserve({
        scope: "proof:upload",
        subject: user.id,
        limit: deps.rateLimitPerMinute ?? 4,
        windowSeconds: 60,
      });
      if (!rate.allowed) {
        return apiError("RATE_LIMITED", "Proof uploads are receiving too many requests.", 429, requestId, {
          "Retry-After": String(rate.retryAfterSeconds),
        });
      }

      let form: Pick<FormData, "getAll">;
      try {
        form = await (deps.readFormData ?? ((input) => input.formData()))(request);
      } catch {
        throw new InvalidUploadInputError();
      }
      const proofIds = form.getAll("proofId");
      const files = form.getAll("file");
      if (proofIds.length !== 1 || files.length !== 1) throw new InvalidUploadInputError();
      const proofId = proofIds[0];
      if (typeof proofId !== "string" || proofId.trim().length < 1 || proofId.length > 200) {
        throw new InvalidUploadInputError();
      }
      const file = asUploadFile(files[0]);
      validateProofUpload({ contentType: file.type, sizeBytes: file.size });

      const ownedProof = await deps.repository.getOwnedProof(user.id, proofId);
      if (!ownedProof) throw new OwnedProofNotFoundError();

      const assetId = (deps.createId ?? (() => crypto.randomUUID()))();
      const objectKey = proofObjectKey(user.id, ownedProof.id, assetId);
      await deps.storage.put(objectKey, {
        body: file,
        contentType: file.type,
        sizeBytes: file.size,
      });
      try {
        await deps.repository.createAssetMetadata({
          id: assetId,
          userId: user.id,
          proofId: ownedProof.id,
          objectKey,
          filename: file.name.slice(0, 255),
          contentType: file.type,
          sizeBytes: file.size,
        });
      } catch (error) {
        await deps.storage.delete(objectKey).catch(() => undefined);
        throw error;
      }

      return apiJson({
        asset: {
          id: assetId,
          proofId: ownedProof.id,
          filename: file.name.slice(0, 255),
          contentType: file.type,
          sizeBytes: file.size,
        },
      }, requestId, { status: 201 });
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        return apiError("UNAUTHENTICATED", "Sign in to upload proof assets.", 401, requestId);
      }
      if (error instanceof ProofUploadValidationError || error instanceof InvalidUploadInputError) {
        return apiError("INVALID_INPUT", "Upload one supported file no larger than five MiB.", 400, requestId);
      }
      if (error instanceof OwnedProofNotFoundError) {
        return apiError("NOT_FOUND", "Proof was not found.", 404, requestId);
      }
      if (error instanceof RateLimitUnavailableError) {
        return apiError("UNAVAILABLE", "Proof uploads are temporarily unavailable.", 503, requestId);
      }
      return apiError("INTERNAL", "Arc could not store the proof asset.", 500, requestId);
    }
  };
}

function productionDependencies(): ProofUploadRouteDependencies {
  const db = getD1();
  return {
    requireUser: (headers) => requireArcUser(headers),
    rateLimiter: new D1RateLimiter(db),
    repository: new D1ProofRepository(db),
    storage: new R2ProofStorage(env.PROOF_ASSETS),
  };
}

export const dynamic = "force-dynamic";
export const POST = (request: Request) => createProofUploadHandler(productionDependencies())(request);
