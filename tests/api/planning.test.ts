import { describe, expect, it, vi } from "vitest";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import type { PlanningMutationResult } from "../../app/contracts/planning";
import { MAX_PLANNING_WORKSPACE_BYTES } from "../../app/contracts/planning";
import {
  PLANNING_RESPONSE_WRAPPER_MAX_BYTES,
} from "../../app/contracts/planning-api";
import { MAX_RESEARCH_PACKAGE_JSON_BYTES } from "../../app/contracts/research";
import { UnauthenticatedError } from "../../app/server/auth/session";
import {
  assertPlanningResponseWireSize,
  createPlanningEventHandler,
  createPlanningGenerateHandler,
  createPlanningReplanHandler,
  createPlanningWorkspaceHandler,
  MAX_PLANNING_RESPONSE_BYTES,
  type PlanningRouteDependencies,
} from "../../app/server/http/planning-route-factories";
import {
  PlanningConflictError,
  PlanningNotFoundError,
  PlanningService,
  PlanningUnavailableError,
} from "../../app/server/planning/service";
import { RateLimitUnavailableError } from "../../app/server/http/rate-limit";
import { PlanningInputError } from "../../app/lib/planning/path-builder";

const requestId = "00000000-0000-4000-8000-000000000001";

async function resultFixture(): Promise<PlanningMutationResult> {
  return new PlanningService({
    repository: {
      findActiveGoal: async () => ({ ownerId: "user-owner", goalId: "goal-1" }),
      load: async () => null,
      findMutation: async () => null,
      saveGeneration: async (command) => ({ ...command, payload: command.result }),
      saveEvent: async (command) => ({ ...command, payload: command.result }),
    },
    intelligence: { getPublished: async () => flagshipBlueprint },
    registry: flagshipUnitRegistry,
    createId: () => "workspace-1",
  }).generate("user-owner", generateRequest());
}

function generateRequest() {
  return {
    mutationId: "mutation-generate-1",
    roleId: "ai-native-full-stack-engineer" as const,
    planningDate: "2026-08-17",
    audit: {
      id: "audit-1", schemaVersion: "2026.08.1" as const,
      blueprintId: flagshipBlueprint.id, blueprintVersion: flagshipBlueprint.version,
      answers: flagshipBlueprint.skills.map(({ id: skillId }) => ({ skillId, level: "conceptual" as const, evidenceRefs: [] })),
      evidence: [], createdBy: "learner", inputFingerprint: "audit-fingerprint",
    },
    availability: {
      id: "availability-1", schemaVersion: "2026.08.1" as const, timeZone: "Asia/Shanghai",
      weekdays: { monday: 60, tuesday: 60, wednesday: 60, thursday: 60, friday: 60, saturday: 60, sunday: 60 },
      exceptions: [], weeklyMinutes: 420, inputFingerprint: "availability-fingerprint",
    },
    target: { id: "target-1", schemaVersion: "2026.08.1" as const, targetWeeks: 18, inputFingerprint: "target-fingerprint" },
    selectedScope: "full-scope" as const,
  };
}

function setup(result: PlanningMutationResult) {
  const sourceContext = {
    reference: { source: "flagship" as const, roleId: "ai-native-full-stack-engineer" as const },
    blueprint: flagshipBlueprint,
    registry: flagshipUnitRegistry,
  };
  const service = {
    getWorkspaceResponse: vi.fn().mockResolvedValue({ workspace: result.workspace, sourceContext }),
    generateResponse: vi.fn().mockResolvedValue({ result, sourceContext }),
    appendEventResponse: vi.fn().mockResolvedValue({ result, sourceContext }),
    acceptReplanResponse: vi.fn().mockResolvedValue({ result, sourceContext }),
    discardReplanResponse: vi.fn().mockResolvedValue({ result, sourceContext }),
  };
  const requireUser = vi.fn().mockResolvedValue({ id: "user-owner", name: "Learner", email: "learner@example.com" });
  const reserve = vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  const recordEvent = vi.fn().mockResolvedValue(undefined);
  const deps: PlanningRouteDependencies = {
    requireUser,
    createService: () => service,
    rateLimiter: { reserve },
    recordEvent,
    createRequestId: () => requestId,
    now: () => 100,
  };
  return { deps, service, sourceContext, requireUser, reserve, recordEvent };
}

function post(path: string, body: unknown): Request {
  return new Request(`https://arc.example${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

async function body(response: Response) { return response.json() as Promise<unknown>; }

function expectSafety(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-request-id")).toBe(requestId);
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
}

describe("authenticated adaptive planning routes", () => {
  it("enforces the shared response wire limit by UTF-8 bytes", () => {
    expect(PLANNING_RESPONSE_WRAPPER_MAX_BYTES).toBe(64 * 1024);
    expect(MAX_PLANNING_RESPONSE_BYTES).toBe(
      MAX_PLANNING_WORKSPACE_BYTES + MAX_RESEARCH_PACKAGE_JSON_BYTES + PLANNING_RESPONSE_WRAPPER_MAX_BYTES,
    );
    const prefixBytes = new TextEncoder().encode('{"value":""}').byteLength;
    const exactEmojiCount = Math.floor((MAX_PLANNING_RESPONSE_BYTES - prefixBytes) / 4);
    const exact = { value: "😀".repeat(exactEmojiCount) };
    const exactBytes = new TextEncoder().encode(JSON.stringify(exact)).byteLength;
    const over = { value: `${exact.value}${"x".repeat(MAX_PLANNING_RESPONSE_BYTES - exactBytes + 1)}` };

    expect(exactBytes).toBeLessThanOrEqual(MAX_PLANNING_RESPONSE_BYTES);
    expect(() => assertPlanningResponseWireSize(exact)).not.toThrow();
    expect(new TextEncoder().encode(JSON.stringify(over)).byteLength).toBe(MAX_PLANNING_RESPONSE_BYTES + 1);
    try {
      assertPlanningResponseWireSize(over);
      throw new Error("Expected an oversized planning response to fail closed");
    } catch (error) {
      expect(error).toMatchObject({ code: "PLANNING_UNAVAILABLE", reason: "response-too-large" });
    }
  });

  it("maps an oversized response failure to one private-safe 500", async () => {
    const result = await resultFixture();
    const harness = setup(result);
    harness.service.getWorkspaceResponse.mockRejectedValue(
      new PlanningUnavailableError(["private response body"], "response-too-large"),
    );

    const response = await createPlanningWorkspaceHandler(harness.deps)(
      new Request("https://arc.example/api/planning/workspace"),
    );

    expect(response.status).toBe(500);
    expect(await body(response)).toEqual({ error: {
      code: "PLANNING_UNAVAILABLE", message: "Planning is temporarily unavailable.", requestId, action: "retry",
    } });
    expect(JSON.stringify(harness.recordEvent.mock.calls)).not.toContain("private response body");
    expectSafety(response);
  });

  it("returns a strict owner-scoped workspace", async () => {
    const result = await resultFixture();
    const harness = setup(result);
    const response = await createPlanningWorkspaceHandler(harness.deps)(new Request("https://arc.example/api/planning/workspace"));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ workspace: result.workspace, sourceContext: harness.sourceContext });
    expect(harness.service.getWorkspaceResponse).toHaveBeenCalledWith("user-owner");
    expectSafety(response);
  });

  it("generates and mutates with exact request bodies and safe counters", async () => {
    const result = await resultFixture();
    const harness = setup(result);
    const generate = generateRequest();
    const generated = await createPlanningGenerateHandler(harness.deps)(post("/api/planning/generate", generate));
    expect(generated.status).toBe(200);
    expect(await body(generated)).toEqual({ result, sourceContext: harness.sourceContext });
    expect(harness.service.generateResponse).toHaveBeenCalledWith("user-owner", generate);

    const event = { mutationId: "mutation-event-1", baseVersionId: result.workspace.activePlanVersionId,
      event: { kind: "skipped" as const, unitId: result.workspace.dailyUnits[0]!.id, planningDate: "2026-08-17" } };
    await createPlanningEventHandler(harness.deps)(post("/api/planning/events", event));
    expect(harness.service.appendEventResponse).toHaveBeenCalledWith("user-owner", event);
    const recorded = JSON.stringify(harness.recordEvent.mock.calls);
    expect(recorded).not.toContain("learner@example.com");
    expect(recorded).not.toContain("audit-fingerprint");
    expect(recorded).not.toContain(result.workspace.dailyUnits[0]!.buildTask);
  });

  it("accepts and discards exact replan decisions", async () => {
    const result = await resultFixture();
    const harness = setup(result);
    const decision = { mutationId: "mutation-decision-1", baseVersionId: result.workspace.activePlanVersionId, candidatePlanVersionId: result.workspace.activePlanVersionId };
    await createPlanningReplanHandler(harness.deps, "accept")(post("/api/planning/replans/accept", decision));
    await createPlanningReplanHandler(harness.deps, "discard")(post("/api/planning/replans/discard", decision));
    expect(harness.service.acceptReplanResponse).toHaveBeenCalledWith("user-owner", decision);
    expect(harness.service.discardReplanResponse).toHaveBeenCalledWith("user-owner", decision);
  });

  it("rejects invalid JSON, unknown fields, and oversized bodies before service calls", async () => {
    const result = await resultFixture();
    const harness = setup(result);
    const handler = createPlanningGenerateHandler(harness.deps);
    const invalid = await handler(new Request("https://arc.example/api/planning/generate", { method: "POST", body: "{" }));
    const unknown = await handler(post("/api/planning/generate", { ...generateRequest(), ownerId: "attacker" }));
    const oversized = await handler(new Request("https://arc.example/api/planning/generate", {
      method: "POST", body: JSON.stringify({ ...generateRequest(), padding: "x".repeat(4 * 1024 * 1024) }),
    }));
    for (const response of [invalid, unknown, oversized]) {
      expect(response.status).toBe(400);
      expect(await body(response)).toEqual({ error: { code: "INVALID_INPUT", message: "Planning input is invalid.", requestId } });
      expectSafety(response);
    }
    expect(harness.service.generateResponse).not.toHaveBeenCalled();
  });

  it("maps authentication, not-found, conflict, rate, and unavailable failures exactly", async () => {
    const result = await resultFixture();
    const cases = [
      [401, "UNAUTHENTICATED", "sign-in", new UnauthenticatedError()],
      [404, "NOT_FOUND", undefined, new PlanningNotFoundError()],
      [409, "CONFLICT", "refresh", new PlanningConflictError()],
      [503, "PLANNING_UNAVAILABLE", "retry", new PlanningUnavailableError(["private SQL payload"])],
    ] as const;
    for (const [status, code, action, error] of cases) {
      const harness = setup(result);
      if (status === 401) harness.requireUser.mockRejectedValue(error);
      else harness.service.getWorkspaceResponse.mockRejectedValue(error);
      const response = await createPlanningWorkspaceHandler(harness.deps)(new Request("https://arc.example/api/planning/workspace"));
      expect(response.status).toBe(status);
      expect(await body(response)).toEqual({ error: {
        code, message: expect.not.stringContaining("private SQL payload"), requestId, ...(action ? { action } : {}),
      } });
      expectSafety(response);
    }

    const limited = setup(result);
    limited.reserve.mockResolvedValue({ allowed: false, retryAfterSeconds: 17 });
    const response = await createPlanningGenerateHandler(limited.deps)(post("/api/planning/generate", generateRequest()));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(await body(response)).toEqual({ error: { code: "RATE_LIMITED", message: "Too many planning requests. Try again shortly.", requestId, action: "retry" } });
    expect(limited.service.generateResponse).not.toHaveBeenCalled();

    const limiterFailure = setup(result);
    limiterFailure.reserve.mockRejectedValue(new RateLimitUnavailableError());
    const unavailable = await createPlanningWorkspaceHandler(limiterFailure.deps)(new Request("https://arc.example/api/planning/workspace"));
    expect(unavailable.status).toBe(503);
    expect(await body(unavailable)).toEqual({ error: {
      code: "PLANNING_UNAVAILABLE", message: "Planning is temporarily unavailable.", requestId, action: "retry",
    } });
    expect(limiterFailure.service.getWorkspaceResponse).not.toHaveBeenCalled();

    const schemaMismatch = setup(result);
    schemaMismatch.service.getWorkspaceResponse.mockRejectedValue(new PlanningUnavailableError([], "version-mismatch"));
    const rebuild = await createPlanningWorkspaceHandler(schemaMismatch.deps)(new Request("https://arc.example/api/planning/workspace"));
    expect(await body(rebuild)).toEqual({ error: {
      code: "PLANNING_UNAVAILABLE", message: "Planning is temporarily unavailable.", requestId, action: "rebuild",
    } });
  });

  it("contains dependency failures and always returns a safe request ID", async () => {
    const result = await resultFixture();
    const harness = setup(result);
    harness.deps.createRequestId = () => { throw new Error("private request id failure"); };
    harness.deps.recordEvent = vi.fn().mockRejectedValue(new Error("private telemetry failure"));
    const response = await createPlanningWorkspaceHandler(harness.deps)(new Request("https://arc.example/api/planning/workspace"));
    expect(response.status).toBe(200);
    const payload = JSON.stringify(await body(response));
    expect(payload).not.toMatch(/request id failure|telemetry failure/iu);
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/u);
    expect(harness.service.getWorkspaceResponse).toHaveBeenCalledTimes(1);

    const telemetry = setup(result);
    telemetry.deps.recordEvent = vi.fn().mockRejectedValue(new Error("private telemetry failure"));
    const successful = await createPlanningWorkspaceHandler(telemetry.deps)(new Request("https://arc.example/api/planning/workspace"));
    expect(successful.status).toBe(200);
    expect(JSON.stringify(await body(successful))).not.toContain("private telemetry failure");

    const serviceFailure = setup(result);
    serviceFailure.service.getWorkspaceResponse.mockRejectedValue(new Error("private repository SQL and payload"));
    const internal = await createPlanningWorkspaceHandler(serviceFailure.deps)(new Request("https://arc.example/api/planning/workspace"));
    expect(internal.status).toBe(500);
    expect(JSON.stringify(await body(internal))).not.toMatch(/private|repository|SQL|payload/iu);
  });

  it("strictly validates service output before responding", async () => {
    const result = await resultFixture();
    const harness = setup(result);
    harness.service.getWorkspaceResponse.mockResolvedValue({ workspace: { ...result.workspace, privateField: "private payload" }, sourceContext: harness.sourceContext });
    const response = await createPlanningWorkspaceHandler(harness.deps)(new Request("https://arc.example/api/planning/workspace"));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await body(response))).not.toContain("private payload");
  });

  it("uses a stable typed version mismatch reason for rebuild recovery", async () => {
    const result = await resultFixture();
    const harness = setup(result);
    harness.service.getWorkspaceResponse.mockRejectedValue(new PlanningUnavailableError([], "version-mismatch"));
    const response = await createPlanningWorkspaceHandler(harness.deps)(new Request("https://arc.example/api/planning/workspace"));
    expect(await body(response)).toEqual({ error: {
      code: "PLANNING_UNAVAILABLE", message: "Planning is temporarily unavailable.", requestId, action: "rebuild",
    } });
  });

  it("maps direct domain PlanningInputError to a private-safe 400", async () => {
    const result = await resultFixture();
    const harness = setup(result);
    harness.service.generateResponse.mockRejectedValue(new PlanningInputError([{
      code: "private-input-code", path: "audit.answers[0].private",
    }]));
    const response = await createPlanningGenerateHandler(harness.deps)(post("/api/planning/generate", generateRequest()));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: {
      code: "INVALID_INPUT", message: "Planning input is invalid.", requestId,
    } });
    expectSafety(response);
    const event = JSON.stringify(harness.recordEvent.mock.calls);
    expect(event).toContain("INVALID_INPUT");
    expect(event).not.toMatch(/private-input-code|audit\.answers/iu);
  });

  it("calls the request ID factory once and uses only its first valid result", async () => {
    const result = await resultFixture();
    const harness = setup(result);
    const first = "00000000-0000-4000-8000-000000000011";
    const createRequestId = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000012");
    harness.deps.createRequestId = createRequestId;
    const response = await createPlanningWorkspaceHandler(harness.deps)(new Request("https://arc.example/api/planning/workspace"));
    expect(createRequestId).toHaveBeenCalledTimes(1);
    expect(response.headers.get("x-request-id")).toBe(first);
    expect(JSON.stringify(harness.recordEvent.mock.calls)).toContain(first);
    expect(JSON.stringify(harness.recordEvent.mock.calls)).not.toContain("00000000-0000-4000-8000-000000000012");
  });

  it.each([
    ["invalid", (): string => "  attacker\r\nrequest-id  "],
    ["throwing", (): string => { throw new Error("private request ID generator"); }],
  ] as const)("falls back to one safe ID for a %s request ID factory", async (_label, factory) => {
    const result = await resultFixture();
    const harness = setup(result);
    const createRequestId = vi.fn(factory);
    harness.deps.createRequestId = createRequestId;
    const response = await createPlanningWorkspaceHandler(harness.deps)(new Request("https://arc.example/api/planning/workspace"));
    expect(createRequestId).toHaveBeenCalledTimes(1);
    const safeId = response.headers.get("x-request-id")!;
    expect(safeId).toMatch(/^[0-9a-f-]{36}$|^request-unavailable$/u);
    expect(JSON.stringify(await body(response))).not.toMatch(/attacker|private request ID/iu);
    expect(JSON.stringify(harness.recordEvent.mock.calls)).toContain(safeId);
  });

  it("rejects an oversized content length without pulling the body stream", async () => {
    const result = await resultFixture();
    const harness = setup(result);
    const pull = vi.fn();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
    const request = new Request("https://arc.example/api/planning/generate", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(4 * 1024 * 1024 + 1) },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const response = await createPlanningGenerateHandler(harness.deps)(request);
    expect(response.status).toBe(400);
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(harness.service.generateResponse).not.toHaveBeenCalled();
  });

  it("bounds and cancels an oversized streamed body despite a deceptive length", async () => {
    const result = await resultFixture();
    const harness = setup(result);
    const chunk = new Uint8Array(1024 * 1024).fill(120);
    let pulls = 0;
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls <= 6) controller.enqueue(chunk);
        else controller.close();
      },
      cancel,
    }, { highWaterMark: 0 });
    const request = new Request("https://arc.example/api/planning/generate", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "1" },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const response = await createPlanningGenerateHandler(harness.deps)(request);
    expect(response.status).toBe(400);
    expect(pulls).toBeLessThanOrEqual(5);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(harness.service.generateResponse).not.toHaveBeenCalled();
  });
});
