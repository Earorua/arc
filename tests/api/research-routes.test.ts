import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { researchCandidateSchema, type ResearchRunPublicView } from "../../app/contracts/research";
import {
  createResearchGetHandler,
  createResearchRetryHandler,
  createResearchStartHandler,
  type ResearchRouteDependencies,
  type ResearchRouteService,
} from "../../app/server/http/research-route-factories";
import {
  createResearchServiceFactory,
  readResearchProductionConfiguration,
  type ResearchProductionEnvironment,
} from "../../app/server/research/service-factory";
import { ResearchRepositoryError } from "../../app/server/research/repository";
import { UnauthenticatedError } from "../../app/server/auth/session";
import { ResearchProviderError } from "../../app/server/research/provider";
import { createResearchD1, seedUser, type SqliteD1 } from "../helpers/sqlite-d1";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";

const requestId = "00000000-0000-4000-8000-000000000008";
const origin = "https://arc.example";
const readyRun: ResearchRunPublicView = {
  id: "research-run-1",
  state: "ready",
  role: "Data Product Manager",
  locale: "en-US",
  retryable: false,
  packageId: "research-package-1",
  summary: "Leads evidence-backed data products from discovery through measurable delivery.",
  skillCount: 3,
  sourceCount: 6,
  observedAt: "2026-09-02",
  quality: { passed: true, issueCodes: [] },
};
const needsReviewRun: ResearchRunPublicView = {
  id: "research-run-2",
  state: "needs-review",
  role: "Data Product Manager",
  locale: "en-US",
  retryable: true,
  quality: { issueCodes: ["missing-unit"], skillCount: 3, sourceCount: 6, unitCount: 2 },
};
const failedRun = (failureCategory: "timeout" | "rate-limited" | "allowance-reached" | "service-unavailable" = "timeout"): ResearchRunPublicView => ({
  id: "research-run-3",
  state: "failed",
  role: "Data Product Manager",
  locale: "en-US",
  retryable: true,
  failureCategory,
});

function service(overrides: Partial<ResearchRouteService> = {}): ResearchRouteService {
  return {
    start: vi.fn(async () => readyRun),
    get: vi.fn(async () => readyRun),
    retry: vi.fn(async () => readyRun),
    ...overrides,
  };
}

function harness(overrides: Partial<ResearchRouteDependencies> = {}) {
  const readService = service();
  const writeService = service();
  const rateLimiter = { reserve: vi.fn(async (
    input: Parameters<ResearchRouteDependencies["rateLimiter"]["reserve"]>[0],
  ) => {
    void input;
    return { allowed: true, retryAfterSeconds: 1 };
  }) };
  const deps: ResearchRouteDependencies = {
    requireUser: vi.fn(async () => ({ id: "owner-a", name: "Owner", email: "owner@example.test" })),
    createReadService: vi.fn(() => readService),
    createWriteService: vi.fn(() => writeService),
    rateLimiter,
    cohortEnabled: vi.fn(async () => true),
    deriveIpSubject: vi.fn(async () => "ip:hashed-subject"),
    configuredOrigin: vi.fn(() => origin),
    recordEvent: vi.fn(async () => undefined),
    createRequestId: () => requestId,
    now: () => 100,
    rateLimitPerMinute: () => 2,
    ...overrides,
  };
  return { deps, readService, writeService, rateLimiter };
}

function mutationRequest(path = "/api/intelligence/research", body: unknown = {
  mutationId: "mutation-research-00000001",
  role: "Data Product Manager",
  locale: "en-US",
}) {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      origin,
      "sec-fetch-site": "same-origin",
      "cf-connecting-ip": "203.0.113.7",
    },
    body: JSON.stringify(body),
  });
}

function openMutationRequest(path = "/api/intelligence/research", body: unknown = {
  mutationId: "mutation-research-00000001",
  role: "Data Product Manager",
  locale: "en-US",
}) {
  const cancelled = vi.fn();
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(bytes); },
    cancel: cancelled,
  });
  const request = new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      origin,
      "sec-fetch-site": "same-origin",
      "cf-connecting-ip": "203.0.113.7",
    },
    body: stream,
    duplex: "half",
  } as RequestInit);
  return { request, cancelled };
}

function internalZodError() {
  const result = z.object({ privateField: z.literal("expected-private-value") }).safeParse({
    privateField: "secret-invalid-value",
  });
  if (result.success) throw new Error("Expected an internal Zod failure");
  return result.error;
}

async function json(response: Response) {
  return await response.json() as Record<string, unknown>;
}

function expectSafety(response: Response) {
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  expect(response.headers.get("x-request-id")).toBe(requestId);
}

describe("Research HTTP routes", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the exact unauthenticated envelope before any admission or service work", async () => {
    const f = harness({ requireUser: async () => { throw new UnauthenticatedError(); } });
    const { request, cancelled } = openMutationRequest();
    const response = await createResearchStartHandler(f.deps)(request);

    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({
      error: { code: "UNAUTHENTICATED", message: "Sign in to use Arc research.", recovery: "sign-in" },
      requestId,
    });
    expect(f.rateLimiter.reserve).not.toHaveBeenCalled();
    expect(f.deps.createWriteService).not.toHaveBeenCalled();
    expect(cancelled).toHaveBeenCalledOnce();
    expect(request.body?.locked).toBe(false);
    expectSafety(response);
  });

  it("rejects malformed JSON and releases the consumed body stream", async () => {
    const f = harness();
    const request = mutationRequest();
    const replacement = new Request(request, { body: "{" });
    const response = await createResearchStartHandler(f.deps)(replacement);
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ error: { code: "INVALID_INPUT" }, requestId });
    expect(replacement.body?.locked).toBe(false);
    expect(f.rateLimiter.reserve).not.toHaveBeenCalled();
    expect(f.deps.createWriteService).not.toHaveBeenCalled();
    expect(f.writeService.start).not.toHaveBeenCalled();
  });

  it("cancels an unread non-JSON body before mutation work", async () => {
    const f = harness();
    const { request, cancelled } = openMutationRequest();
    request.headers.set("content-type", "text/plain");
    const response = await createResearchStartHandler(f.deps)(request);
    expect(response.status).toBe(400);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(request.body?.locked).toBe(false);
    expect(f.rateLimiter.reserve).not.toHaveBeenCalled();
    expect(f.deps.createWriteService).not.toHaveBeenCalled();
    expect(f.writeService.start).not.toHaveBeenCalled();
  });

  it("releases the body stream after a fatal UTF-8 decoding failure", async () => {
    const f = harness();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0xc3, 0x28]));
        controller.close();
      },
    });
    const request = new Request(`${origin}/api/intelligence/research`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, "sec-fetch-site": "same-origin" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    const response = await createResearchStartHandler(f.deps)(request);
    expect(response.status).toBe(400);
    expect(request.body?.locked).toBe(false);
    expect(f.rateLimiter.reserve).not.toHaveBeenCalled();
    expect(f.writeService.start).not.toHaveBeenCalled();
  });

  it("cancels an oversized body before all mutation-capable dependencies", async () => {
    const f = harness();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(20_000)); },
      cancel() { cancelled = true; },
    });
    const request = new Request(`${origin}/api/intelligence/research`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, "sec-fetch-site": "same-origin" },
      body,
      duplex: "half",
    } as RequestInit);
    const response = await createResearchStartHandler(f.deps)(request);
    expect(response.status).toBe(400);
    expect(cancelled).toBe(true);
    expect(request.body?.locked).toBe(false);
    expect(f.rateLimiter.reserve).not.toHaveBeenCalled();
    expect(f.writeService.start).not.toHaveBeenCalled();
  });

  it("rejects a mismatching Origin and cancels the unread body before any mutation", async () => {
    const f = harness();
    const { request, cancelled } = openMutationRequest();
    request.headers.set("origin", "https://attacker.example");
    const response = await createResearchStartHandler(f.deps)(request);
    expect(response.status).toBe(400);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(request.body?.locked).toBe(false);
    expect(f.rateLimiter.reserve).not.toHaveBeenCalled();
    expect(f.writeService.start).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["same-site", "same-site"],
    ["cross-site", "cross-site"],
  ])("rejects %s Fetch Metadata before any mutation", async (_label, fetchSite) => {
    const f = harness();
    const { request, cancelled } = openMutationRequest();
    if (fetchSite === null) request.headers.delete("sec-fetch-site");
    else request.headers.set("sec-fetch-site", fetchSite);
    const response = await createResearchStartHandler(f.deps)(request);
    expect(response.status).toBe(400);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(request.body?.locked).toBe(false);
    expect(f.rateLimiter.reserve).not.toHaveBeenCalled();
    expect(f.deps.createWriteService).not.toHaveBeenCalled();
    expect(f.writeService.start).not.toHaveBeenCalled();
  });

  it.each(["ownerId", "model", "package", "provider", "maxCost"])("rejects client control field %s", async (field) => {
    const f = harness();
    const response = await createResearchStartHandler(f.deps)(mutationRequest(undefined, {
      mutationId: "mutation-research-00000001", role: "Data Product Manager", locale: "en-US", [field]: "attacker",
    }));
    expect(response.status).toBe(400);
    expect(f.rateLimiter.reserve).not.toHaveBeenCalled();
    expect(f.writeService.start).not.toHaveBeenCalled();
  });

  it("applies account then salted-IP rate gates with a bounded Retry-After", async () => {
    const f = harness();
    f.rateLimiter.reserve
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 1 })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 99_999 });
    const response = await createResearchStartHandler(f.deps)(mutationRequest());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("3600");
    expect(await json(response)).toEqual({
      error: { code: "RATE_LIMITED", message: "Too many research requests. Try again shortly.", recovery: "retry" },
      requestId,
    });
    expect(f.rateLimiter.reserve.mock.calls.map(([input]) => input.subject)).toEqual(["owner-a", "ip:hashed-subject"]);
    expect(f.writeService.start).not.toHaveBeenCalled();
    expect(f.deps.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ resultCode: "RATE_LIMITED" }));
  });

  it("stops on the account rate gate before deriving or storing an IP subject", async () => {
    const f = harness();
    f.rateLimiter.reserve.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await createResearchStartHandler(f.deps)(mutationRequest());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("7");
    expect(f.rateLimiter.reserve).toHaveBeenCalledTimes(1);
    expect(f.deps.deriveIpSubject).not.toHaveBeenCalled();
    expect(f.writeService.start).not.toHaveBeenCalled();
    expect(f.deps.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ resultCode: "RATE_LIMITED" }));
  });

  it("denies disabled or incomplete new-call authority without constructing a provider service", async () => {
    const f = harness({ createWriteService: vi.fn(() => null) });
    const response = await createResearchStartHandler(f.deps)(mutationRequest());
    expect(response.status).toBe(503);
    expect(await json(response)).toEqual({
      error: { code: "RESEARCH_UNAVAILABLE", message: "Research is temporarily unavailable.", recovery: "retry-or-flagship" },
      requestId,
    });
    expect(f.rateLimiter.reserve).not.toHaveBeenCalled();
    expect(f.writeService.start).not.toHaveBeenCalled();
  });

  it.each([
    [needsReviewRun, 422, "RESEARCH_NEEDS_REVIEW", "retry-or-flagship"],
    [failedRun("timeout"), 503, "RESEARCH_UNAVAILABLE", "retry-or-flagship"],
    [failedRun("rate-limited"), 429, "RATE_LIMITED", "retry"],
    [failedRun("allowance-reached"), 429, "ALLOWANCE_REACHED", "use-flagship"],
  ] as const)("maps persisted terminal %s to its public envelope", async (run, status, code, recovery) => {
    const f = harness();
    vi.mocked(f.writeService.start).mockResolvedValue(run);
    const response = await createResearchStartHandler(f.deps)(mutationRequest());
    expect(response.status).toBe(status);
    expect(await json(response)).toMatchObject({ error: { code, recovery }, run, requestId });
    expect(f.deps.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ resultCode: code }));
    expectSafety(response);
  });

  it("denies a removed-cohort start without creating or returning a run", async () => {
    const f = harness({ cohortEnabled: vi.fn(async () => false) });
    const response = await createResearchStartHandler(f.deps)(mutationRequest());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await json(response)).toEqual({
      error: { code: "ALLOWANCE_REACHED", message: "The current Research allowance has been reached.", recovery: "use-flagship" },
      requestId,
    });
    expect(f.writeService.start).not.toHaveBeenCalled();
    expect(f.deps.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ resultCode: "ALLOWANCE_REACHED" }));
  });

  it("preflights retry ownership before cohort denial and never creates a retry", async () => {
    const cohortEnabled = vi.fn(async () => false);
    const f = harness({ cohortEnabled });
    vi.mocked(f.writeService.get).mockResolvedValue(failedRun("timeout"));
    const response = await createResearchRetryHandler(f.deps, "research-run-3")(mutationRequest(
      "/api/intelligence/research/research-run-3/retry",
      { mutationId: "mutation-retry-00000003" },
    ));
    expect(response.status).toBe(429);
    expect(await json(response)).toEqual({
      error: { code: "ALLOWANCE_REACHED", message: "The current Research allowance has been reached.", recovery: "use-flagship" },
      requestId,
    });
    expect(f.writeService.get).toHaveBeenCalledWith("owner-a", "research-run-3");
    expect(cohortEnabled).toHaveBeenCalledWith("owner-a");
    expect(f.writeService.retry).not.toHaveBeenCalled();
    expect(f.deps.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ resultCode: "ALLOWANCE_REACHED" }));
  });

  it("keeps a foreign retry hidden before evaluating the cohort", async () => {
    const cohortEnabled = vi.fn(async () => false);
    const f = harness({ cohortEnabled });
    vi.mocked(f.writeService.get).mockResolvedValue(null);
    const response = await createResearchRetryHandler(f.deps, "research-run-foreign")(mutationRequest(
      "/api/intelligence/research/research-run-foreign/retry",
      { mutationId: "mutation-retry-00000004" },
    ));
    expect(response.status).toBe(404);
    expect(await json(response)).toMatchObject({ error: { code: "NOT_FOUND" }, requestId });
    expect(cohortEnabled).not.toHaveBeenCalled();
    expect(f.writeService.retry).not.toHaveBeenCalled();
  });

  it("returns every owned persisted state from GET as a 200 success envelope", async () => {
    for (const run of [readyRun, needsReviewRun, failedRun()]) {
      const f = harness();
      vi.mocked(f.readService.get).mockResolvedValue(run);
      const response = await createResearchGetHandler(f.deps, run.id)(new Request(`${origin}/api/intelligence/research/${run.id}`));
      expect(response.status).toBe(200);
      expect(await json(response)).toEqual({ run, requestId });
      expectSafety(response);
    }
  });

  it("hides invalid and cross-owner GET/retry as NOT_FOUND", async () => {
    const getHarness = harness();
    vi.mocked(getHarness.readService.get).mockResolvedValue(null);
    const getResponse = await createResearchGetHandler(getHarness.deps, "research-run-foreign")(
      new Request(`${origin}/api/intelligence/research/research-run-foreign`),
    );
    expect(getResponse.status).toBe(404);
    expect(await json(getResponse)).toMatchObject({ error: { code: "NOT_FOUND" }, requestId });

    const retryHarness = harness();
    vi.mocked(retryHarness.writeService.retry).mockRejectedValue(new ResearchRepositoryError("NOT_FOUND"));
    const retryResponse = await createResearchRetryHandler(retryHarness.deps, "research-run-foreign")(
      mutationRequest("/api/intelligence/research/research-run-foreign/retry", { mutationId: "mutation-retry-00000001" }),
    );
    expect(retryResponse.status).toBe(404);
  });

  it("maps CAS conflict and unknown errors without leaking thrown details", async () => {
    const conflict = harness();
    vi.mocked(conflict.writeService.retry).mockRejectedValue(new ResearchRepositoryError("CONFLICT"));
    const conflictResponse = await createResearchRetryHandler(conflict.deps, readyRun.id)(
      mutationRequest(`/api/intelligence/research/${readyRun.id}/retry`, { mutationId: "mutation-retry-00000001" }),
    );
    expect(conflictResponse.status).toBe(409);
    expect(await json(conflictResponse)).toMatchObject({ error: { code: "CONFLICT", recovery: "refresh" } });

    const unknown = harness();
    vi.mocked(unknown.writeService.start).mockRejectedValue(new Error("provider=secret/model token=private"));
    const unknownResponse = await createResearchStartHandler(unknown.deps)(mutationRequest());
    const serialized = JSON.stringify(await json(unknownResponse));
    expect(unknownResponse.status).toBe(500);
    expect(serialized).toContain("Arc could not complete this research request.");
    expect(serialized).not.toMatch(/secret\/model|private/iu);
    expect(JSON.stringify(vi.mocked(unknown.deps.recordEvent).mock.calls)).not.toMatch(/secret\/model|private/iu);
  });

  it("treats an auth-layer Zod error as a sanitized internal failure and cancels the unread body", async () => {
    const f = harness({ requireUser: async () => { throw internalZodError(); } });
    const { request, cancelled } = openMutationRequest();
    const response = await createResearchStartHandler(f.deps)(request);
    const serialized = JSON.stringify(await json(response));
    expect(response.status).toBe(500);
    expect(serialized).toContain("Arc could not complete this research request.");
    expect(serialized).not.toMatch(/privateField|expected-private-value|secret-invalid-value/u);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(request.body?.locked).toBe(false);
    expect(f.rateLimiter.reserve).not.toHaveBeenCalled();
    expect(f.deps.createWriteService).not.toHaveBeenCalled();
    expect(f.deps.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ resultCode: "INTERNAL" }));
  });

  it("treats a service-layer Zod error as a sanitized internal failure and releases the body", async () => {
    const f = harness();
    vi.mocked(f.writeService.start).mockRejectedValue(internalZodError());
    const request = mutationRequest();
    const response = await createResearchStartHandler(f.deps)(request);
    const serialized = JSON.stringify(await json(response));
    expect(response.status).toBe(500);
    expect(serialized).toContain("Arc could not complete this research request.");
    expect(serialized).not.toMatch(/privateField|expected-private-value|secret-invalid-value/u);
    expect(request.body?.locked).toBe(false);
    expect(f.deps.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ resultCode: "INTERNAL" }));
  });

  it("releases the body stream after a successful start", async () => {
    const f = harness();
    const request = mutationRequest();
    const response = await createResearchStartHandler(f.deps)(request);
    expect(response.status).toBe(200);
    expect(request.body?.locked).toBe(false);
  });

  it("supports explicit retry after a refreshed Needs-review run", async () => {
    const f = harness();
    vi.mocked(f.writeService.start).mockResolvedValue(needsReviewRun);
    vi.mocked(f.readService.get).mockResolvedValue(needsReviewRun);
    vi.mocked(f.writeService.retry).mockResolvedValue(readyRun);
    const start = await createResearchStartHandler(f.deps)(mutationRequest());
    expect((await json(start))).toMatchObject({ run: { id: needsReviewRun.id } });
    const refresh = await createResearchGetHandler(f.deps, needsReviewRun.id)(new Request(`${origin}/api/intelligence/research/${needsReviewRun.id}`));
    expect(refresh.status).toBe(200);
    const retry = await createResearchRetryHandler(f.deps, needsReviewRun.id)(
      mutationRequest(`/api/intelligence/research/${needsReviewRun.id}/retry`, { mutationId: "mutation-retry-00000001" }),
    );
    expect(retry.status).toBe(200);
    expect(await json(retry)).toEqual({ run: readyRun, requestId });
    expect(f.writeService.retry).toHaveBeenCalledWith("owner-a", needsReviewRun.id, "mutation-retry-00000001", { cohortEnabled: true, rateAllowed: true });
  });
});

const validEnvironment: ResearchProductionEnvironment = {
  ARC_ENVIRONMENT: "production",
  BETTER_AUTH_URL: origin,
  ARC_AI_ENABLED: "true",
  ARC_AI_RESEARCH_ENABLED: "true",
  ARC_AI_USER_DAILY_QUOTA: "10",
  ARC_AI_RATE_LIMIT_PER_MINUTE: "2",
  ARC_AI_MODEL_RESEARCH: "test/research-fixed",
  ARC_AI_MODEL_ECONOMY: "test/repair-fixed",
  ARC_AI_RESEARCH_TIMEOUT_MS: "20000",
  ARC_AI_REPAIR_TIMEOUT_MS: "10000",
  ARC_AI_RESEARCH_CACHE_DAYS: "14",
  ARC_AI_SITE_DAILY_BUDGET_MICROS: "10000",
  ARC_AI_SITE_MONTHLY_BUDGET_MICROS: "100000",
  ARC_AI_RESEARCH_MAX_COST_MICROS: "1000",
  ARC_AI_REPAIR_MAX_COST_MICROS: "200",
  ARC_AI_IP_HASH_SALT: "synthetic-test-salt-0001",
  OPENROUTER_API_KEY: "synthetic-dummy-credential",
};

describe("Research production composition", () => {
  it("requires every trusted new-call setting and both feature flags before provider construction", () => {
    for (const key of Object.keys(validEnvironment) as Array<keyof ResearchProductionEnvironment>) {
      if (key === "ARC_ENVIRONMENT") continue;
      const environment = { ...validEnvironment };
      delete environment[key];
      expect(readResearchProductionConfiguration(environment)).toBeNull();
    }
    expect(readResearchProductionConfiguration({ ...validEnvironment, ARC_AI_ENABLED: "false" })).toBeNull();
    expect(readResearchProductionConfiguration({ ...validEnvironment, ARC_AI_RESEARCH_ENABLED: "false" })).toBeNull();
    expect(readResearchProductionConfiguration({ ...validEnvironment, ARC_AI_MODEL_RESEARCH: "openrouter/auto" })).toBeNull();

    const createProvider = vi.fn(() => ({ research: vi.fn(), repair: vi.fn() }));
    const factory = createResearchServiceFactory({
      environment: { ...validEnvironment, OPENROUTER_API_KEY: undefined },
      getD1: () => ({} as D1Database),
      createProvider,
    });
    expect(factory.createNewCallService()).toBeNull();
    expect(createProvider).not.toHaveBeenCalled();
  });

  it("fingerprints actual fixed models and policy versions but excludes the secret", () => {
    const base = readResearchProductionConfiguration(validEnvironment)!;
    const rotated = readResearchProductionConfiguration({ ...validEnvironment, OPENROUTER_API_KEY: "synthetic-rotated-credential" })!;
    const changedModel = readResearchProductionConfiguration({ ...validEnvironment, ARC_AI_MODEL_RESEARCH: "test/research-fixed-v2" })!;
    expect(rotated.configFingerprint).toBe(base.configFingerprint);
    expect(changedModel.configFingerprint).not.toBe(base.configFingerprint);
    expect(JSON.stringify(base)).not.toContain(validEnvironment.OPENROUTER_API_KEY);
  });

  it("uses only a valid Cloudflare edge IP and gives the limiter a scoped salted subject", async () => {
    const factory = createResearchServiceFactory({ environment: validEnvironment, getD1: () => ({} as D1Database) });
    const request = new Request(origin, { headers: {
      "cf-connecting-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.99",
    } });
    const subject = await factory.deriveIpSubject(request);
    expect(subject).toMatch(/^ip:[0-9a-f]{64}$/u);
    expect(subject).not.toContain("203.0.113.7");
    expect(subject).not.toContain("198.51.100.99");
    await expect(factory.deriveIpSubject(new Request(origin, { headers: { "x-forwarded-for": "198.51.100.99" } }))).rejects.toBeDefined();
    await expect(createResearchServiceFactory({
      environment: { ...validEnvironment, ARC_AI_IP_HASH_SALT: "" }, getD1: () => ({} as D1Database),
    }).deriveIpSubject(request)).rejects.toBeDefined();
  });

  it("fails closed on a missing edge IP before the provider is called", async () => {
    const db = createResearchD1();
    try {
      seedUser(db, "owner-a");
      const provider = { research: vi.fn(), repair: vi.fn() };
      const factory = createResearchServiceFactory({
        environment: validEnvironment,
        getD1: () => db as unknown as D1Database,
        createProvider: () => provider,
        now: () => Date.parse("2026-09-02T12:00:00Z"),
      });
      const deps = factoryDependencies(factory);
      const request = mutationRequest();
      request.headers.delete("cf-connecting-ip");
      const response = await createResearchStartHandler(deps)(request);
      expect(response.status).toBe(503);
      expect(provider.research).not.toHaveBeenCalled();
      expect(db.database.prepare("SELECT count(*) count FROM research_runs").get()).toEqual({ count: 0 });
    } finally { db.close(); }
  });

  it("maps a real atomic budget denial to ALLOWANCE_REACHED with zero provider execution", async () => {
    const db = createResearchD1();
    try {
      seedUser(db, "owner-a");
      const provider = { research: vi.fn(), repair: vi.fn() };
      const factory = createResearchServiceFactory({
        environment: { ...validEnvironment, ARC_AI_SITE_DAILY_BUDGET_MICROS: "1" },
        getD1: () => db as unknown as D1Database,
        createProvider: () => provider,
        now: () => Date.parse("2026-09-02T12:00:00Z"),
      });
      const response = await createResearchStartHandler(factoryDependencies(factory))(mutationRequest());
      expect(response.status).toBe(429);
      expect(await json(response)).toMatchObject({
        error: { code: "ALLOWANCE_REACHED", recovery: "use-flagship" },
        run: { state: "failed", failureCategory: "allowance-reached" },
      });
      expect(provider.research).not.toHaveBeenCalled();
    } finally { db.close(); }
  });

  it("denies removed-cohort start/cache attachment and retry before orchestration", async () => {
    const db = createResearchD1();
    try {
      seedUser(db, "owner-a");
      seedUser(db, "owner-b");
      const provider = {
        research: vi.fn(async () => ({
          content: JSON.stringify(validResearchCandidate),
          candidate: researchCandidateSchema.parse(validResearchCandidate),
          annotations: structuredClone(validAnnotations),
          actualModel: "test/research-fixed",
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, costMicros: 100, webSearchRequests: 1 },
        })),
        repair: vi.fn(async () => { throw new Error("repair must not run"); }),
      };
      const factory = createResearchServiceFactory({
        environment: validEnvironment,
        getD1: () => db as unknown as D1Database,
        createProvider: () => provider,
        now: () => Date.parse("2026-09-02T12:00:00Z"),
      });
      const ownerA = factoryDependencies(factory);
      const ready = await createResearchStartHandler(ownerA)(mutationRequest());
      const readyBody = await json(ready) as { run: ResearchRunPublicView };
      expect(ready.status).toBe(200);
      expect(readyBody.run.state).toBe("ready");
      expect(provider.research).toHaveBeenCalledTimes(1);

      const before = durableLedgerSnapshot(db);
      const ownerBRemoved = factoryDependencies(factory, { ownerId: "owner-b", cohortEnabled: false });
      const deniedStart = await createResearchStartHandler(ownerBRemoved)(mutationRequest(undefined, {
        mutationId: "mutation-cohort-cache-00000001",
        role: "Data Product Manager",
        locale: "en-US",
      }));
      expect(deniedStart.status).toBe(429);
      expect(await json(deniedStart)).not.toHaveProperty("run");
      expect(durableLedgerSnapshot(db)).toEqual(before);

      const ownerARemoved = factoryDependencies(factory, { cohortEnabled: false });
      const deniedRetry = await createResearchRetryHandler(ownerARemoved, readyBody.run.id)(mutationRequest(
        `/api/intelligence/research/${readyBody.run.id}/retry`,
        { mutationId: "mutation-cohort-retry-00000001" },
      ));
      expect(deniedRetry.status).toBe(429);
      expect(await json(deniedRetry)).not.toHaveProperty("run");
      expect(durableLedgerSnapshot(db)).toEqual(before);

      const foreignRetry = await createResearchRetryHandler(ownerBRemoved, readyBody.run.id)(mutationRequest(
        `/api/intelligence/research/${readyBody.run.id}/retry`,
        { mutationId: "mutation-cohort-retry-foreign-00000001" },
      ));
      expect(foreignRetry.status).toBe(404);
      expect(durableLedgerSnapshot(db)).toEqual(before);
      expect(provider.research).toHaveBeenCalledTimes(1);
      expect(provider.repair).not.toHaveBeenCalled();
    } finally { db.close(); }
  });

  it("recovers persisted Failed runs with original ledgers after flags and key are removed", async () => {
    const db = createResearchD1();
    try {
      seedUser(db, "owner-a");
      const provider = {
        research: vi.fn(async () => { throw new ResearchProviderError("timeout", true, false); }),
        repair: vi.fn(async () => { throw new Error("repair must not run"); }),
      };
      const enabledFactory = createResearchServiceFactory({
        environment: validEnvironment,
        getD1: () => db as unknown as D1Database,
        createProvider: () => provider,
        now: () => Date.parse("2026-09-02T12:00:00Z"),
      });
      const enabled = factoryDependencies(enabledFactory);
      const started = await createResearchStartHandler(enabled)(mutationRequest());
      const startedBody = await json(started) as { run: ResearchRunPublicView };
      expect(started.status).toBe(503);
      expect(startedBody.run.state).toBe("failed");

      const refreshed = await createResearchGetHandler(enabled, startedBody.run.id)(
        new Request(`${origin}/api/intelligence/research/${startedBody.run.id}`),
      );
      expect(refreshed.status).toBe(200);
      expect(await json(refreshed)).toEqual({ run: startedBody.run, requestId });

      const retried = await createResearchRetryHandler(enabled, startedBody.run.id)(mutationRequest(
        `/api/intelligence/research/${startedBody.run.id}/retry`,
        { mutationId: "mutation-retry-00000002" },
      ));
      const retriedBody = await json(retried) as { run: ResearchRunPublicView };
      expect(retried.status).toBe(503);
      expect(retriedBody.run.id).not.toBe(startedBody.run.id);
      expect(provider.research).toHaveBeenCalledTimes(2);

      const before = durableLedgerSnapshot(db);
      const createProvider = vi.fn(() => { throw new Error("provider must not be constructed for recovery"); });
      const disabledFactory = createResearchServiceFactory({
        environment: {
          ...validEnvironment,
          ARC_AI_ENABLED: "false",
          ARC_AI_RESEARCH_ENABLED: "false",
          OPENROUTER_API_KEY: undefined,
        },
        getD1: () => db as unknown as D1Database,
        createProvider,
        now: () => Date.parse("2026-09-02T12:00:00Z"),
      });
      const disabled = factoryDependencies(disabledFactory);
      const recovered = await createResearchGetHandler(disabled, retriedBody.run.id)(
        new Request(`${origin}/api/intelligence/research/${retriedBody.run.id}`),
      );
      expect(recovered.status).toBe(200);
      expect(await json(recovered)).toEqual({ run: retriedBody.run, requestId });
      expect(durableLedgerSnapshot(db)).toEqual(before);
      expect(createProvider).not.toHaveBeenCalled();
      expect(provider.research).toHaveBeenCalledTimes(2);

      const deniedStart = await createResearchStartHandler(disabled)(mutationRequest(undefined, {
        mutationId: "mutation-disabled-00000001", role: "Platform Engineer", locale: "en-US",
      }));
      const deniedRetry = await createResearchRetryHandler(disabled, retriedBody.run.id)(mutationRequest(
        `/api/intelligence/research/${retriedBody.run.id}/retry`,
        { mutationId: "mutation-disabled-retry-00000001" },
      ));
      expect(deniedStart.status).toBe(503);
      expect(deniedRetry.status).toBe(503);
      expect(durableLedgerSnapshot(db)).toEqual(before);
      expect(createProvider).not.toHaveBeenCalled();
    } finally { db.close(); }
  });
});

type ServiceFactory = ReturnType<typeof createResearchServiceFactory>;

function factoryDependencies(
  factory: ServiceFactory,
  options: { ownerId?: string; cohortEnabled?: boolean } = {},
): ResearchRouteDependencies {
  const ownerId = options.ownerId ?? "owner-a";
  return {
    requireUser: async () => ({ id: ownerId, name: "Owner", email: `${ownerId}@example.test` }),
    createReadService: () => factory.createRecoveryService(),
    createWriteService: () => factory.createNewCallService(),
    rateLimiter: { reserve: async () => ({ allowed: true, retryAfterSeconds: 1 }) },
    cohortEnabled: async () => options.cohortEnabled ?? true,
    deriveIpSubject: (request) => factory.deriveIpSubject(request),
    configuredOrigin: () => factory.configuredOrigin(),
    recordEvent: async () => undefined,
    createRequestId: () => requestId,
    now: () => 100,
    rateLimitPerMinute: () => 2,
  };
}

function durableLedgerSnapshot(db: SqliteD1) {
  return {
    runs: db.database.prepare("SELECT id,request_id,retry_of_run_id,state,state_version FROM research_runs ORDER BY created_at,id").all(),
    quotas: db.database.prepare("SELECT reservation_id,idempotency_key,entry_kind,units FROM quota_ledger ORDER BY created_at,id").all(),
    costs: db.database.prepare("SELECT id,request_id,run_id,status,settled_micros,day_bucket_id,month_bucket_id FROM ai_budget_reservations ORDER BY created_at,id").all(),
    audits: db.database.prepare("SELECT request_id,purpose,status,error_code FROM ai_runs ORDER BY created_at,id").all(),
  };
}
