import { describe, expect, it, vi } from "vitest";
import { createResearchEligibilityHandler, createResearchEligibilityDependencies } from "../../app/server/http/research-eligibility-route";
import { UnauthenticatedError } from "../../app/server/auth/session";

const environment = { BETTER_AUTH_URL: "https://arc.example", ARC_AI_ENABLED: "true", ARC_AI_RESEARCH_ENABLED: "true", ARC_AI_USER_DAILY_QUOTA: "2", ARC_AI_RATE_LIMIT_PER_MINUTE: "10", ARC_AI_MODEL_RESEARCH: "fixture/research", ARC_AI_MODEL_ECONOMY: "fixture/economy", ARC_AI_RESEARCH_TIMEOUT_MS: "1000", ARC_AI_REPAIR_TIMEOUT_MS: "1000", ARC_AI_RESEARCH_CACHE_DAYS: "7", ARC_AI_SITE_DAILY_BUDGET_MICROS: "10000", ARC_AI_SITE_MONTHLY_BUDGET_MICROS: "100000", ARC_AI_RESEARCH_MAX_COST_MICROS: "100", ARC_AI_REPAIR_MAX_COST_MICROS: "10", ARC_AI_IP_HASH_SALT: "synthetic-test-salt-only", OPENROUTER_API_KEY: "synthetic-test-only" };
const requireUser = vi.fn(async () => ({ id: "owner-a", name: "A", email: "a@example.test" }));
const request = () => new Request("https://arc.example/api/intelligence/research/eligibility");
function db(row: unknown, throws = false) { return { prepare: vi.fn(() => ({ bind: vi.fn(() => ({ first: async () => { if (throws) throw new Error("private storage detail"); return row; } })) })) } as unknown as D1Database; }
function dependencies() { return { requireUser, configured: () => true, cohortEnabled: vi.fn(async () => true), rateLimiter: { reserve: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 60 })) }, createRequestId: () => "12345678-1234-4234-8234-123456789abc" }; }
describe("Research eligibility route", () => {
  it("is authenticated, bounded, no-store, and returns only the strict capability view", async () => {
    const deps = dependencies(); const reply = await createResearchEligibilityHandler(deps)(request());
    expect(await reply.json()).toEqual({ eligible: true, requestId: deps.createRequestId() });
    expect(reply.headers.get("cache-control")).toBe("no-store"); expect(reply.headers.get("x-content-type-options")).toBe("nosniff");
    expect(deps.rateLimiter.reserve).toHaveBeenCalledWith({ scope: "research:eligibility:account", subject: "owner-a", limit: 30, windowSeconds: 60 });
  });
  it("denies anonymous requests before storage", async () => {
    const deps = dependencies(); deps.requireUser = vi.fn(async () => { throw new UnauthenticatedError(); });
    const reply = await createResearchEligibilityHandler(deps)(request()); expect(reply.status).toBe(401); expect(deps.rateLimiter.reserve).not.toHaveBeenCalled();
  });
  it.each([{}, { ...environment, ARC_AI_REPAIR_MAX_COST_MICROS: "bad" }, { ...environment, ARC_AI_ENABLED: "false" }])("fails closed on incomplete full configuration", async (configuration) => {
    const database = db({ enabled: 1, cohort_json: '{}' });
    const deps = createResearchEligibilityDependencies({ environment: configuration, getD1: () => database });
    const response = await createResearchEligibilityHandler({ ...deps, requireUser, rateLimiter: dependencies().rateLimiter })(request());
    expect(await response.json()).toMatchObject({ eligible: false }); expect(database.prepare).not.toHaveBeenCalled();
  });
  it.each([[{ enabled: 1, cohort_json: '{"userIds":["owner-a"]}' }, true], [{ enabled: 1, cohort_json: '{"userIds":["owner-b"]}' }, false], [{ enabled: 1, cohort_json: 'bad' }, false], [null, false]])("uses only the existing cohort read for synthetic valid configuration", async (row, eligible) => {
    const database = db(row); const deps = createResearchEligibilityDependencies({ environment, getD1: () => database });
    const reply = await createResearchEligibilityHandler({ ...deps, requireUser, rateLimiter: dependencies().rateLimiter })(request());
    expect(await reply.json()).toMatchObject({ eligible }); expect(database.prepare).toHaveBeenCalledTimes(1);
    expect(vi.mocked(database.prepare).mock.calls[0]![0]).toMatch(/SELECT enabled, cohort_json/); // No Provider, run, quota or budget operation.
  });
  it("fails closed for unavailable storage without exposing its error", async () => {
    const deps = createResearchEligibilityDependencies({ environment, getD1: () => db(null, true) });
    const reply = await createResearchEligibilityHandler({ ...deps, requireUser, rateLimiter: dependencies().rateLimiter })(request());
    expect(await reply.json()).toMatchObject({ eligible: false });
  });
  it("bounds Retry-After and fails closed for malformed rate responses", async () => {
    const deps = dependencies(); deps.rateLimiter.reserve.mockResolvedValue({ allowed: false, retryAfterSeconds: 999999 });
    const reply = await createResearchEligibilityHandler(deps)(request()); expect(reply.status).toBe(429); expect(reply.headers.get("retry-after")).toBe("3600"); expect(deps.cohortEnabled).not.toHaveBeenCalled();
    deps.rateLimiter.reserve.mockResolvedValue({ allowed: true, retryAfterSeconds: NaN });
    expect((await createResearchEligibilityHandler(deps)(request())).status).toBe(503);
  });
});
