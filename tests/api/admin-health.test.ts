import { describe, expect, it, vi } from "vitest";
import { UnauthenticatedError } from "../../app/server/auth/session";
import {
  createAdminHealthHandler,
  type AdminHealthRouteDependencies,
} from "../../app/api/admin/health/route";
import { expectApiError, requestId } from "./cloud-route-test-helpers";

const snapshot = {
  service: "ok" as const,
  ai: { enabled: false, callsToday: 0, acceptedToday: 0, budgetUnitsToday: 0 },
  migrations: { pending: 0, failed24h: 0, completed24h: 3 },
  failures: [],
};

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
});
