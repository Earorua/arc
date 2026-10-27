import { env } from "cloudflare:workers";
import { z } from "zod";
import { getD1 } from "../../../db/d1";
import { requireArcUser, UnauthenticatedError, type ArcUser } from "../auth/session";
import { D1FeatureCohort } from "../entitlements/d1-feature-cohort";
import { BridgeBodyError, decodeBridgeJson, readBridgeBody } from "../research/executor/body";
import { CLOSED_PREFLIGHT_JOB_ID, CLOSED_PREFLIGHT_PATH, parseClosedPreflightReply,
  parseClosedPreflightRequest } from "../research/executor/closed-preflight";
import { readResearchBridgeConnection, type ResearchBridgeConnection } from "../research/executor/connection-config";
import { D1BridgeNonceStore } from "../research/executor/d1-nonce-store";
import { BridgeTransport } from "../research/executor/http-transport";
import { resolveResearchBridgeFetch } from "../research/executor/service-binding-transport";
import type { ResearchProductionEnvironment } from "../research/production-policy";
import { apiJson, applyResponseSafety, resolveRequestId } from "./api-response";

type Dependencies = {
  requireUser(headers: Headers): Promise<ArcUser>;
  closed(): boolean;
  connection(): ResearchBridgeConnection | null;
  ownerAllowed(userId: string): Promise<boolean>;
  transport(connection: ResearchBridgeConnection): BridgeTransport | null;
};
const singleton = z.object({ userIds: z.tuple([z.string().min(1).max(160)]) }).strict();
class Denied extends Error { constructor(readonly status: 404 | 409 | 503) { super("Closed preflight unavailable"); } }

export function createResearchClosedPreflightHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const requestId = resolveRequestId(undefined);
    let response: Response;
    try {
      const user = await deps.requireUser(request.headers);
      if (!deps.closed()) throw new Denied(409);
      const connection = deps.connection();
      if (!connection) throw new Denied(503);
      const url = new URL(request.url);
      if (request.method !== "POST" || url.origin !== connection.siteOrigin || url.pathname !== CLOSED_PREFLIGHT_PATH
        || url.search || url.hash || request.headers.get("origin") !== connection.siteOrigin
        || request.headers.get("sec-fetch-site") !== "same-origin"
        || !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type") ?? "")) throw new Denied(404);
      parseClosedPreflightRequest(decodeBridgeJson(await readBridgeBody(request,
        { maxBytes: 256, timeoutMs: 1_000, signal: request.signal })));
      if (await deps.ownerAllowed(user.id) !== true) throw new Denied(404);
      const transport = deps.transport(connection);
      if (!transport) throw new Denied(503);
      const result = await transport.request({ target: "executor", operation: "closed-preflight", signal: request.signal,
        prepare: () => ({ jobId: CLOSED_PREFLIGHT_JOB_ID, body: new TextEncoder().encode("{}") }),
        decode: bytes => parseClosedPreflightReply(decodeBridgeJson(bytes)) });
      response = apiJson({ siteClosed: true, ownerAllowed: true, ...result }, requestId);
    } catch (error) {
      const status = error instanceof UnauthenticatedError ? 401 : error instanceof Denied ? error.status
        : error instanceof BridgeBodyError || error instanceof z.ZodError ? 404 : 503;
      response = apiJson({}, requestId, { status });
    }
    return applyResponseSafety(response, requestId);
  };
}

// Only authentication, cohort reads, and the fixed signed diagnostic are available here.
export function createResearchClosedPreflightDependencies(runtime: {
  environment: ResearchProductionEnvironment;
  getD1(): D1Database;
} = { environment: env, getD1 }): Dependencies {
  return {
    requireUser: requireArcUser,
    closed: () => runtime.environment.ARC_AI_ENABLED === "false" && runtime.environment.ARC_AI_RESEARCH_ENABLED === "false",
    connection: () => runtime.environment.ARC_AI_RESEARCH_BRIDGE_TRANSPORT === "service-binding-v1"
      ? readResearchBridgeConnection(runtime.environment) : null,
    ownerAllowed: async userId => {
      const db = runtime.getD1();
      const row = await db.prepare("SELECT enabled, cohort_json FROM feature_flags WHERE key = ?1 LIMIT 1")
        .bind("role-research-beta").first<{ enabled: number; cohort_json: string }>();
      if (row?.enabled !== 1) return false;
      let value: unknown;
      try { value = JSON.parse(row.cohort_json); } catch { return false; }
      const parsed = singleton.safeParse(value);
      if (!parsed.success || parsed.data.userIds[0] !== userId || !userId.trim()) return false;
      return new D1FeatureCohort(db).allows("role-research-beta", userId);
    },
    transport: connection => {
      if (runtime.environment.ARC_AI_RESEARCH_BRIDGE_TRANSPORT !== "service-binding-v1") return null;
      const fetch = resolveResearchBridgeFetch(runtime.environment, connection, "executor");
      return fetch ? new BridgeTransport({ connection, nonces: new D1BridgeNonceStore(runtime.getD1()), fetch,
        wallNow: Date.now, monoNow: () => performance.now() }) : null;
    },
  };
}
