import { z } from "zod";
import {
  DOCUMENT_API_ERROR_STATUS, MAX_DOCUMENT_CREATE_BODY_BYTES, documentEndpointContracts,
  type DocumentEndpoint, type DocumentEndpointRequest,
} from "../../contracts/documents-api";
import { UnauthenticatedError } from "../auth/session";

export interface DocumentRouteService {
  invoke<K extends DocumentEndpoint>(ownerId: string, endpoint: K, input: DocumentEndpointRequest<K>): Promise<unknown>;
}
export type DocumentRouteDependencies = {
  requireUser(headers: Headers): Promise<{ id: string }>;
  configuredOrigin(): string | null;
  createService(): DocumentRouteService | Promise<DocumentRouteService>;
  rateLimiter: { reserve(input: { scope: string; subject: string; limit: number; windowSeconds: number }): Promise<{ allowed: boolean; retryAfterSeconds?: number }> };
};
type RouteContext = { params: Record<string, string> | Promise<Record<string, string>> };
type ErrorCode = keyof typeof DOCUMENT_API_ERROR_STATUS;
export class DocumentHttpError extends Error {
  constructor(readonly code: ErrorCode) { super(code); }
}
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
function failure(code: ErrorCode): Response {
  return Response.json({ error: { code, status: DOCUMENT_API_ERROR_STATUS[code] } }, { status: DOCUMENT_API_ERROR_STATUS[code], headers });
}
function codeFor(error: unknown): ErrorCode {
  if (error instanceof UnauthenticatedError) return "unauthenticated";
  if (error instanceof z.ZodError) return "invalid-request";
  const planningCodes: Record<string, ErrorCode> = { NOT_FOUND: "not-found", CONFLICT: "conflict", INVALID_INPUT: "invalid-request", PLANNING_UNAVAILABLE: "unavailable" };
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string"
    && Object.hasOwn(planningCodes, error.code)) return planningCodes[error.code]!;
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string"
    && Object.hasOwn(DOCUMENT_API_ERROR_STATUS, error.code)) return error.code as ErrorCode;
  return "unavailable";
}
export async function readDocumentRequestBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new DocumentHttpError("invalid-request");
  if (!request.body) throw new DocumentHttpError("invalid-request");
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_DOCUMENT_CREATE_BODY_BYTES) {
    await request.body.cancel().catch(() => undefined); throw new DocumentHttpError("payload-too-large");
  }
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_DOCUMENT_CREATE_BODY_BYTES) { await reader.cancel().catch(() => undefined); throw new DocumentHttpError("payload-too-large"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new DocumentHttpError("invalid-request");
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof DocumentHttpError) throw error;
    await reader.cancel().catch(() => undefined); throw new DocumentHttpError("invalid-request");
  } finally { reader.releaseLock(); }
}
export function requireDocumentOrigin(request: Request, configured: string | null): void {
  let origin: string;
  try { if (!configured) throw new Error(); origin = new URL(configured).origin; } catch { throw new DocumentHttpError("unavailable"); }
  if (request.headers.get("origin") !== origin || new URL(request.url).origin !== origin
    || request.headers.get("sec-fetch-site") === "cross-site") throw new DocumentHttpError("forbidden");
}
export function createDocumentRoute<K extends DocumentEndpoint>(endpoint: K, deps: DocumentRouteDependencies) {
  const contract = documentEndpointContracts[endpoint];
  return async (request: Request, context?: RouteContext): Promise<Response> => {
    if (request.method !== contract.method) return new Response(null, { status: 405, headers: { ...headers, Allow: contract.method } });
    try {
      const user = await deps.requireUser(request.headers);
      if (contract.method !== "GET") requireDocumentOrigin(request, deps.configuredOrigin());
      const rate = await deps.rateLimiter.reserve({ scope: `documents:${endpoint}`, subject: user.id, limit: contract.method === "GET" ? 120 : 30, windowSeconds: 60 });
      if (!rate.allowed) return failure("quota-exceeded");
      const params = context ? await context.params : {};
      const query: Record<string, unknown> = {};
      for (const [key, value] of new URL(request.url).searchParams) {
        if (Object.hasOwn(query, key) || Object.hasOwn(params, key)) throw new DocumentHttpError("invalid-request");
        if (endpoint === "readAdoptedMaterials" && key === "checkDocumentIds") query[key] = value.split(",", 6);
        else query[key] = key === "limit" && /^\d+$/u.test(value) ? Number(value) : value;
      }
      const body = contract.method === "GET" ? {} : await readDocumentRequestBody(request);
      for (const key of Object.keys(body)) if (Object.hasOwn(params, key) || Object.hasOwn(query, key)) throw new DocumentHttpError("invalid-request");
      const input = contract.request.parse({ ...query, ...body, ...params }) as DocumentEndpointRequest<K>;
      const result = await (await deps.createService()).invoke(user.id, endpoint, input);
      const parsed = contract.response.safeParse(result);
      if (!parsed.success) throw new DocumentHttpError("unavailable");
      const status = endpoint === "createDocumentJob" ? 202 : ["createDocument", "createDocumentVersion"].includes(endpoint) ? 201 : 200;
      return Response.json(parsed.data, { status, headers });
    } catch (error) { return failure(codeFor(error)); }
  };
}
