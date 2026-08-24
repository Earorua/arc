import { describe, expect, it, vi } from "vitest";
import { UnauthenticatedError } from "../../app/server/auth/session";
import {
  createProofCreateHandler,
  createProofReviseHandler,
  createProofVisibilityHandler,
  createProofWithdrawHandler,
  createProofWorkspaceHandler,
  type ProofRouteDependencies,
} from "../../app/server/http/proof-route-factories";
import { ProofServiceError } from "../../app/server/proof/service";
import { proofResultFixture } from "../fixtures/proof-ledger";

const requestId = "00000000-0000-4000-8000-000000000021";
const createBody = {
  mutationId: "mutation-1", baseRevision: 0, intent: "submit" as const, validatorKey: null,
  dailyUnitId: null, title: "Architecture map", kind: "document" as const,
  summary: "Trace the boundary.", artifactUrl: "https://example.com/proof", assetId: null,
  skillIds: ["testing"], completionCriteria: ["Trace is complete"], visibility: "private" as const,
};

function setup() {
  const result = proofResultFixture();
  const service = {
    getWorkspace: vi.fn().mockResolvedValue(result.workspace),
    create: vi.fn().mockResolvedValue(result),
    revise: vi.fn().mockResolvedValue(result),
    withdraw: vi.fn().mockResolvedValue({ ...result, outcome: "withdrawn" }),
    setVisibility: vi.fn().mockResolvedValue({ ...result, outcome: "updated" }),
  };
  const requireUser = vi.fn().mockResolvedValue({ id: "user-owner", name: "Learner", email: "private@example.com" });
  const reserve = vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  const recordEvent = vi.fn().mockResolvedValue(undefined);
  const deps: ProofRouteDependencies = {
    requireUser, createService: () => service, rateLimiter: { reserve }, recordEvent,
    createRequestId: () => requestId, now: () => 100,
  };
  return { deps, service, requireUser, reserve, recordEvent, result };
}

function post(path: string, body: unknown) {
  return new Request(`https://arc.example${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
async function json(response: Response) { return response.json() as Promise<unknown>; }

function expectSafety(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-request-id")).toBe(requestId);
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
}

describe("proof ledger routes", () => {
  it("returns the owner workspace and exact mutation envelopes", async () => {
    const h = setup();
    const workspace = await createProofWorkspaceHandler(h.deps)(new Request("https://arc.example/api/proofs/workspace"));
    const created = await createProofCreateHandler(h.deps)(post("/api/proofs", createBody));
    expect(await json(workspace)).toEqual({ workspace: h.result.workspace });
    expect(await json(created)).toEqual({ result: h.result });
    expect(h.service.getWorkspace).toHaveBeenCalledWith("user-owner");
    expect(h.service.create).toHaveBeenCalledWith("user-owner", createBody);
    expectSafety(workspace);
  });

  it("returns the same service replay without adding response fields", async () => {
    const h = setup();
    const handler = createProofCreateHandler(h.deps);
    const first = await handler(post("/api/proofs", createBody));
    const replay = await handler(post("/api/proofs", createBody));
    expect(await json(first)).toEqual({ result: h.result });
    expect(await json(replay)).toEqual({ result: h.result });
    expect(h.service.create).toHaveBeenCalledTimes(2);
  });

  it("authenticates before reading an invalid body", async () => {
    const h = setup();
    h.requireUser.mockRejectedValue(new UnauthenticatedError());
    const response = await createProofCreateHandler(h.deps)(new Request("https://arc.example/api/proofs", {
      method: "POST", body: "{private invalid body",
    }));
    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({ error: {
      code: "UNAUTHENTICATED", message: "Sign in to use Arc proof.", requestId, action: "sign-in",
    } });
    expect(h.service.create).not.toHaveBeenCalled();
  });

  it("rejects unknown fields and 1 MiB bodies before service calls", async () => {
    const h = setup();
    const unknown = await createProofCreateHandler(h.deps)(post("/api/proofs", { ...createBody, userId: "attacker" }));
    const cancel = vi.fn();
    const pull = vi.fn();
    const oversized = await createProofCreateHandler(h.deps)(new Request("https://arc.example/api/proofs", {
      method: "POST", headers: { "content-length": String(1024 * 1024 + 1) },
      body: new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 }), duplex: "half",
    } as RequestInit & { duplex: "half" }));
    expect(unknown.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
    expect(h.service.create).not.toHaveBeenCalled();
  });

  it("uses separate mutation rate scopes and passes validated path IDs", async () => {
    const h = setup();
    await createProofCreateHandler(h.deps)(post("/api/proofs", createBody));
    await createProofReviseHandler(h.deps, "proof-1")(post("/api/proofs/proof-1/versions", { ...createBody, baseRevision: 1 }));
    await createProofWithdrawHandler(h.deps, "proof-1")(post("/api/proofs/proof-1/withdraw", {
      mutationId: "mutation-withdraw", baseRevision: 1,
    }));
    await createProofVisibilityHandler(h.deps, "proof-1")(post("/api/proofs/proof-1/visibility", {
      mutationId: "mutation-public", baseRevision: 1, visibility: "public",
    }));
    expect(h.reserve.mock.calls.map(([input]) => input.scope)).toEqual([
      "proof:create", "proof:revise", "proof:withdraw", "proof:visibility",
    ]);
    expect(h.service.revise).toHaveBeenCalledWith("user-owner", "proof-1", { ...createBody, baseRevision: 1 });
  });

  it("uses the same 404 response for invalid and service-hidden proof IDs", async () => {
    const invalid = setup();
    const invalidResponse = await createProofWithdrawHandler(invalid.deps, "INVALID/ID")(post("/api/proofs/x/withdraw", {
      mutationId: "mutation-withdraw", baseRevision: 1,
    }));
    const hidden = setup();
    hidden.service.withdraw.mockRejectedValue(new ProofServiceError("NOT_FOUND"));
    const hiddenResponse = await createProofWithdrawHandler(hidden.deps, "proof-foreign")(post("/api/proofs/x/withdraw", {
      mutationId: "mutation-withdraw", baseRevision: 1,
    }));
    expect(invalidResponse.status).toBe(404);
    expect(await json(invalidResponse)).toEqual(await json(hiddenResponse));
    expect(invalid.service.withdraw).not.toHaveBeenCalled();
  });

  it("maps rate limits, conflicts, and unavailable failures without leaking details", async () => {
    const conflict = setup();
    conflict.service.create.mockRejectedValue(new ProofServiceError("CONFLICT"));
    const conflictResponse = await createProofCreateHandler(conflict.deps)(post("/api/proofs", createBody));
    expect(conflictResponse.status).toBe(409);
    expect(await json(conflictResponse)).toEqual({ error: {
      code: "CONFLICT", message: "Proof state changed. Refresh and try again.", requestId, action: "refresh",
    } });

    const unavailable = setup();
    unavailable.service.getWorkspace.mockRejectedValue(new ProofServiceError("UNAVAILABLE", ["private sql"]));
    const unavailableResponse = await createProofWorkspaceHandler(unavailable.deps)(new Request("https://arc.example/api/proofs/workspace"));
    expect(unavailableResponse.status).toBe(503);
    expect(await json(unavailableResponse)).toEqual({ error: {
      code: "UNAVAILABLE", message: "Proof is temporarily unavailable.", requestId, action: "retry",
    } });

    const limited = setup();
    limited.reserve.mockResolvedValue({ allowed: false, retryAfterSeconds: 9 });
    const limitedResponse = await createProofCreateHandler(limited.deps)(post("/api/proofs", createBody));
    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.headers.get("retry-after")).toBe("9");
    expect(limited.service.create).not.toHaveBeenCalled();
    expect(JSON.stringify(unavailable.recordEvent.mock.calls)).not.toMatch(/private sql|private@example/iu);
  });
});
