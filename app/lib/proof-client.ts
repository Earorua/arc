import { z } from "zod";
import {
  createProofRequestSchema,
  reviseProofRequestSchema,
  setProofVisibilityRequestSchema,
  withdrawProofRequestSchema,
  type CreateProofRequest,
  type ProofLedgerMutationResult,
  type ProofLedgerWorkspace,
  type ReviseProofRequest,
  type SetProofVisibilityRequest,
  type WithdrawProofRequest,
} from "../contracts/proof-ledger";
import { proofMutationResponseSchema, proofWorkspaceResponseSchema } from "../contracts/proof-api";
import { ArcApiError } from "./cloud-client";

const MAX_PROOF_REQUEST_BYTES = 1024 * 1024;
const MAX_PROOF_RESPONSE_BYTES = 4 * 1024 * 1024;
const invalidResponseId = "request-unavailable";
const errorSchema = z.object({ error: z.object({
  code: z.string().min(1).max(64), message: z.string().min(1).max(240),
  requestId: z.string().min(1).max(128),
  action: z.enum(["refresh", "retry", "sign-in", "rebuild"]).optional(),
}).strict() }).strict();
type ArcFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ProofClient {
  loadWorkspace(): Promise<ProofLedgerWorkspace | null>;
  createProof(input: CreateProofRequest): Promise<ProofLedgerMutationResult>;
  reviseProof(proofId: string, input: ReviseProofRequest): Promise<ProofLedgerMutationResult>;
  withdrawProof(proofId: string, input: WithdrawProofRequest): Promise<ProofLedgerMutationResult>;
  setVisibility(proofId: string, input: SetProofVisibilityRequest): Promise<ProofLedgerMutationResult>;
}

export function createProofClient(options: { fetch?: ArcFetch } = {}): ProofClient {
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init));

  async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit) {
    const response = await fetcher(path, {
      ...init, cache: "no-store", credentials: "include",
      headers: init.body ? { "content-type": "application/json", ...init.headers } : init.headers,
    });
    const raw = await readBoundedResponse(response);
    let payload: unknown;
    try { payload = JSON.parse(raw) as unknown; }
    catch { throw invalidResponse(); }
    if (!response.ok) {
      const parsed = errorSchema.safeParse(payload);
      if (!parsed.success) throw invalidResponse();
      throw new ArcApiError(response.status, parsed.data.error.code, parsed.data.error.message,
        parsed.data.error.requestId, parsed.data.error.action);
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw invalidResponse();
    return parsed.data;
  }

  async function mutation<T>(path: string, value: T, schema: z.ZodType<T>) {
    let parsed: T;
    try { parsed = schema.parse(value); }
    catch { throw new ArcApiError(400, "INVALID_INPUT", "Proof input is invalid.", invalidResponseId); }
    const body = JSON.stringify(parsed);
    if (new TextEncoder().encode(body).byteLength > MAX_PROOF_REQUEST_BYTES) {
      throw new ArcApiError(400, "INVALID_INPUT", "Proof input is invalid.", invalidResponseId);
    }
    return (await request(path, proofMutationResponseSchema, { method: "POST", body })).result;
  }

  return {
    async loadWorkspace() {
      return (await request("/api/proofs/workspace", proofWorkspaceResponseSchema, { method: "GET" })).workspace;
    },
    createProof: (input) => mutation("/api/proofs", input, createProofRequestSchema),
    reviseProof: (proofId, input) => mutation(
      `/api/proofs/${encodeURIComponent(proofId)}/versions`, input, reviseProofRequestSchema,
    ),
    withdrawProof: (proofId, input) => mutation(
      `/api/proofs/${encodeURIComponent(proofId)}/withdraw`, input, withdrawProofRequestSchema,
    ),
    setVisibility: (proofId, input) => mutation(
      `/api/proofs/${encodeURIComponent(proofId)}/visibility`, input, setProofVisibilityRequestSchema,
    ),
  };
}

function invalidResponse() {
  return new ArcApiError(500, "INTERNAL", "Arc returned an invalid response.", invalidResponseId);
}

async function readBoundedResponse(response: Response) {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed > MAX_PROOF_RESPONSE_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      throw invalidResponse();
    }
  }
  if (!response.body) throw invalidResponse();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_PROOF_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw invalidResponse();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ArcApiError) throw error;
    await reader.cancel().catch(() => undefined);
    throw invalidResponse();
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(combined); }
  catch { throw invalidResponse(); }
}

export const proofClient = createProofClient();
