import { describe, expect, it, vi } from "vitest";
import { UnauthenticatedError } from "../../app/server/auth/session";
import {
  createAdminHealthHandler,
  type AdminHealthRouteDependencies,
} from "../../app/api/admin/health/route";
import type { AdminEnvironment } from "../../app/server/admin/policy";
import { expectApiError, requestId } from "./cloud-route-test-helpers";

const snapshot = {
  service: "ok" as const,
  ai: { enabled: false, callsToday: 0, acceptedToday: 0, budgetUnitsToday: 0 },
  research: {
    queued: 0,
    researching: 0,
    validating: 0,
    ready: 0,
    needsReview: 0,
    failed: 0,
    reservedMicros: 0,
    settledMicros: 0,
    conservativeHoldMicros: 0,
  },
  migrations: { pending: 0, failed24h: 0, completed24h: 3 },
  failures: [],
};

const validResearchEnvironment: AdminEnvironment = {
  ARC_ADMIN_EMAILS: "owner@example.com",
  ARC_ENVIRONMENT: "test",
  BETTER_AUTH_URL: "https://arc.example",
  ARC_AI_ENABLED: "true",
  ARC_AI_RESEARCH_ENABLED: "true",
  ARC_AI_USER_DAILY_QUOTA: "3",
  ARC_AI_RATE_LIMIT_PER_MINUTE: "2",
  ARC_AI_MODEL_RESEARCH: "test/research-fixed",
  ARC_AI_MODEL_ECONOMY: "test/economy-fixed",
  ARC_AI_RESEARCH_TIMEOUT_MS: "20000",
  ARC_AI_REPAIR_TIMEOUT_MS: "10000",
  ARC_AI_RESEARCH_CACHE_DAYS: "14",
  ARC_AI_SITE_DAILY_BUDGET_MICROS: "10000",
  ARC_AI_SITE_MONTHLY_BUDGET_MICROS: "100000",
  ARC_AI_RESEARCH_MAX_COST_MICROS: "1200",
  ARC_AI_REPAIR_MAX_COST_MICROS: "300",
  ARC_AI_IP_HASH_SALT: "synthetic-test-salt-value",
  OPENROUTER_API_KEY: "synthetic-dummy-credential",
};

const requiredResearchKeys = [
  "BETTER_AUTH_URL",
  "ARC_AI_ENABLED",
  "ARC_AI_RESEARCH_ENABLED",
  "ARC_AI_USER_DAILY_QUOTA",
  "ARC_AI_RATE_LIMIT_PER_MINUTE",
  "ARC_AI_MODEL_RESEARCH",
  "ARC_AI_MODEL_ECONOMY",
  "ARC_AI_RESEARCH_TIMEOUT_MS",
  "ARC_AI_REPAIR_TIMEOUT_MS",
  "ARC_AI_RESEARCH_CACHE_DAYS",
  "ARC_AI_SITE_DAILY_BUDGET_MICROS",
  "ARC_AI_SITE_MONTHLY_BUDGET_MICROS",
  "ARC_AI_RESEARCH_MAX_COST_MICROS",
  "ARC_AI_REPAIR_MAX_COST_MICROS",
  "ARC_AI_IP_HASH_SALT",
  "OPENROUTER_API_KEY",
] as const satisfies ReadonlyArray<keyof AdminEnvironment>;

function setup() {
  const requireUser = vi.fn().mockResolvedValue({
    id: "private-user-id",
    name: "Owner",
    email: "owner@example.com",
  });
  const getHealthSnapshot = vi.fn().mockResolvedValue(snapshot);
  const deps = {
    requireUser,
    environment: { ARC_ADMIN_EMAILS: "owner@example.com" },
    repository: { getHealthSnapshot },
    createRequestId: () => requestId,
  } as unknown as AdminHealthRouteDependencies;
  return { deps, requireUser, getHealthSnapshot };
}

describe("GET /api/admin/health", () => {
  it("returns 401 without an Arc session", async () => {
    const harness = setup();
    harness.requireUser.mockRejectedValue(new UnauthenticatedError());

    const response = await createAdminHealthHandler(harness.deps)(
      new Request("https://arc.example/api/admin/health"),
    );

    await expectApiError(response, 401, "UNAUTHENTICATED");
    expect(harness.getHealthSnapshot).not.toHaveBeenCalled();
  });

  it("returns 403 for an authenticated non-admin exact email", async () => {
    const harness = setup();
    harness.requireUser.mockResolvedValue({
      id: "private-user-id",
      name: "Not owner",
      email: "owner@example.com.attacker.test",
    });

    const response = await createAdminHealthHandler(harness.deps)(
      new Request("https://arc.example/api/admin/health"),
    );

    await expectApiError(response, 403, "FORBIDDEN");
    expect(harness.getHealthSnapshot).not.toHaveBeenCalled();
  });

  it("returns only aggregate health to an allowlisted administrator", async () => {
    const harness = setup();

    const response = await createAdminHealthHandler(harness.deps)(
      new Request("https://arc.example/api/admin/health"),
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toEqual({ health: snapshot });
    expect(serialized).not.toMatch(/owner@example|private-user-id|role description|proof text|credential/i);
  });

  it("reports the effective AI switch as off when the global kill switch is off", async () => {
    const harness = setup();
    harness.deps.environment = {
      ARC_ADMIN_EMAILS: "owner@example.com",
      ARC_AI_ENABLED: "false",
    };
    harness.getHealthSnapshot.mockResolvedValue({
      ...snapshot,
      ai: { ...snapshot.ai, enabled: true },
    });

    const response = await createAdminHealthHandler(harness.deps)(
      new Request("https://arc.example/api/admin/health"),
    );

    await expect(response.json()).resolves.toMatchObject({
      health: { ai: { enabled: false } },
    });
  });

  it("reports Research disabled when any required runtime value is missing", async () => {
    for (const key of requiredResearchKeys) {
      const harness = setup();
      const environment: AdminEnvironment = { ...validResearchEnvironment };
      delete environment[key];
      harness.deps.environment = environment;
      harness.getHealthSnapshot.mockResolvedValue({
        ...snapshot,
        ai: { ...snapshot.ai, enabled: true },
      });

      const response = await createAdminHealthHandler(harness.deps)(
        new Request("https://arc.example/api/admin/health"),
      );

      expect(response.status, key).toBe(200);
      await expect(response.json(), key).resolves.toMatchObject({
        health: { ai: { enabled: false } },
      });
    }
  });

  it.each([
    ["global switch", { ARC_AI_ENABLED: "false" }],
    ["Research switch", { ARC_AI_RESEARCH_ENABLED: "TRUE" }],
    ["origin", { BETTER_AUTH_URL: "https://user:pass@arc.example" }],
    ["production origin", { ARC_ENVIRONMENT: "production", BETTER_AUTH_URL: "http://arc.example" }],
    ["quota", { ARC_AI_USER_DAILY_QUOTA: "0" }],
    ["rate", { ARC_AI_RATE_LIMIT_PER_MINUTE: "1.5" }],
    ["Research model", { ARC_AI_MODEL_RESEARCH: "openrouter/auto" }],
    ["Economy model", { ARC_AI_MODEL_ECONOMY: "" }],
    ["Research timeout", { ARC_AI_RESEARCH_TIMEOUT_MS: "0" }],
    ["Repair timeout", { ARC_AI_REPAIR_TIMEOUT_MS: "120001" }],
    ["cache", { ARC_AI_RESEARCH_CACHE_DAYS: "0" }],
    ["daily budget", { ARC_AI_SITE_DAILY_BUDGET_MICROS: "0" }],
    ["monthly budget", { ARC_AI_SITE_MONTHLY_BUDGET_MICROS: "invalid" }],
    ["Research budget", { ARC_AI_RESEARCH_MAX_COST_MICROS: "0" }],
    ["Repair budget", { ARC_AI_REPAIR_MAX_COST_MICROS: "-1" }],
    ["salt", { ARC_AI_IP_HASH_SALT: "short" }],
    ["credential", { OPENROUTER_API_KEY: "" }],
  ] satisfies Array<[string, AdminEnvironment]>) (
    "reports Research disabled for invalid %s configuration",
    async (_name, override) => {
      const harness = setup();
      harness.deps.environment = { ...validResearchEnvironment, ...override };
      harness.getHealthSnapshot.mockResolvedValue({
        ...snapshot,
        ai: { ...snapshot.ai, enabled: true },
      });

      const response = await createAdminHealthHandler(harness.deps)(
        new Request("https://arc.example/api/admin/health"),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        health: { ai: { enabled: false } },
      });
    },
  );

  it("publishes effective Research enablement without exposing runtime configuration", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const harness = setup();
    harness.deps.environment = validResearchEnvironment;
    harness.getHealthSnapshot.mockResolvedValue({
      ...snapshot,
      ai: { ...snapshot.ai, enabled: true },
    });

    const response = await createAdminHealthHandler(harness.deps)(
      new Request("https://arc.example/api/admin/health"),
    );
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(serialized).toContain('"enabled":true');
    expect(serialized).not.toMatch(/research-fixed|economy-fixed|dummy-credential|test-salt|model|api.?key|salt|config/iu);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});
