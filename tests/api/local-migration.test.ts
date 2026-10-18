import { describe, expect, it, vi } from "vitest";
import { createDemoState } from "../../app/lib/demo-store";
import { createMigrationHandler } from "../../app/server/http/cloud-route-factories";
import { ResearchSetupConflictError } from "../../app/server/cloud/repository";
import {
  createRouteHarness,
  denyRateLimit,
  expectApiError,
  jsonRequest,
  makeAnonymous,
} from "./cloud-route-test-helpers";

const imported = {
  migrationId: "migration-1",
  status: "imported" as const,
  activeGoalId: "goal-owner",
  importedCompletionCount: 0,
  importedProofCount: 0,
  availableResolutions: [],
};

function migrationBody() {
  return {
    migrationId: "migration-1",
    consent: true,
    state: createDemoState(),
    conflictResolution: "reject",
  };
}

function setup() {
  return createRouteHarness({
    importLocalState: vi.fn().mockResolvedValue(imported),
  });
}

describe("POST /api/migrations/local-state", () => {
  it("preserves the explicit Research guard in the authenticated command", async () => {
    const harness = setup(); const body = { ...migrationBody(), intent: "research-setup" };
    const response = await createMigrationHandler(harness.deps)(jsonRequest("https://arc.example/api/migrations/local-state", "POST", body));
    expect(response.status).toBe(200); expect(harness.service.importLocalState).toHaveBeenCalledWith("user-owner", body);
  });
  it.each(["history", "proof", "replace", "archive", "unknown"])("rejects a Research activation with %s before the service", async (invalid) => {
    const harness = setup(); const body = { ...migrationBody(), intent: invalid === "unknown" ? "unknown" : "research-setup", conflictResolution: invalid === "replace" ? "activate-import" : "reject" };
    if (invalid === "history") body.state.completedUnitIds.push("unrelated-unit");
    if (invalid === "proof") body.state.proofs.push({ id: "unrelated-proof", title: "Device proof", kind: "note", skillIds: [], verified: false });
    if (invalid === "archive") body.conflictResolution = "archive-import";
    const response = await createMigrationHandler(harness.deps)(jsonRequest("https://arc.example/api/migrations/local-state", "POST", body));
    await expectApiError(response, 400, "INVALID_INPUT"); expect(harness.service.importLocalState).not.toHaveBeenCalled();
  });
  it("maps the atomic Research guard to a bounded stable conflict", async () => {
    const harness = setup(); harness.service.importLocalState.mockRejectedValue(new ResearchSetupConflictError());
    const response = await createMigrationHandler(harness.deps)(jsonRequest("https://arc.example/api/migrations/local-state", "POST", { ...migrationBody(), intent: "research-setup" }));
    await expectApiError(response, 409, "CONFLICT");
  });
  it("returns 401 for an anonymous import", async () => {
    const harness = setup();
    makeAnonymous(harness);
    const POST = createMigrationHandler(harness.deps);

    const response = await POST(jsonRequest("https://arc.example/api/migrations/local-state", "POST", migrationBody()));

    await expectApiError(response, 401, "UNAUTHENTICATED");
    expect(harness.service.importLocalState).not.toHaveBeenCalled();
  });

  it("requires explicit consent and strict input", async () => {
    const harness = setup();
    const POST = createMigrationHandler(harness.deps);

    const response = await POST(jsonRequest("https://arc.example/api/migrations/local-state", "POST", {
      ...migrationBody(),
      consent: false,
      userId: "attacker-selected-owner",
    }));

    await expectApiError(response, 400, "INVALID_INPUT");
    expect(harness.service.importLocalState).not.toHaveBeenCalled();
  });

  it("rejects oversized proof imports", async () => {
    const harness = setup();
    const POST = createMigrationHandler(harness.deps);
    const state = createDemoState();
    state.proofs = Array.from({ length: 201 }, (_, index) => ({
      id: `proof-${index}`,
      title: `Proof ${index}`,
      kind: "completion" as const,
      skillIds: [],
      verified: false,
    }));

    const response = await POST(jsonRequest("https://arc.example/api/migrations/local-state", "POST", {
      ...migrationBody(),
      state,
    }));

    await expectApiError(response, 400, "INVALID_INPUT");
    expect(harness.service.importLocalState).not.toHaveBeenCalled();
  });

  it("imports for the authenticated owner", async () => {
    const harness = setup();
    const POST = createMigrationHandler(harness.deps);
    const body = migrationBody();

    const response = await POST(jsonRequest("https://arc.example/api/migrations/local-state", "POST", body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: imported });
    expect(harness.service.importLocalState).toHaveBeenCalledWith("user-owner", body);
  });

  it("returns the service's idempotent replay result", async () => {
    const harness = setup();
    harness.service.importLocalState
      .mockResolvedValueOnce(imported)
      .mockResolvedValueOnce({ ...imported, status: "already-imported" });
    const POST = createMigrationHandler(harness.deps);
    const body = migrationBody();

    await POST(jsonRequest("https://arc.example/api/migrations/local-state", "POST", body));
    const replay = await POST(jsonRequest("https://arc.example/api/migrations/local-state", "POST", body));

    await expect(replay.json()).resolves.toMatchObject({ result: { status: "already-imported" } });
    expect(harness.service.importLocalState).toHaveBeenCalledTimes(2);
  });

  it("maps an active-goal conflict without replacing cloud state", async () => {
    const harness = setup();
    harness.service.importLocalState.mockResolvedValue({
      ...imported,
      status: "conflict",
      importedCompletionCount: 0,
      importedProofCount: 0,
      availableResolutions: ["archive-import", "activate-import"],
    });
    const POST = createMigrationHandler(harness.deps);

    const response = await POST(jsonRequest("https://arc.example/api/migrations/local-state", "POST", migrationBody()));

    await expectApiError(response, 409, "CONFLICT");
  });

  it("returns 429 before importing", async () => {
    const harness = setup();
    denyRateLimit(harness);
    const POST = createMigrationHandler(harness.deps);

    const response = await POST(jsonRequest("https://arc.example/api/migrations/local-state", "POST", migrationBody()));

    await expectApiError(response, 429, "RATE_LIMITED");
    expect(harness.service.importLocalState).not.toHaveBeenCalled();
  });

  it("does not expose request bodies or provider errors", async () => {
    const harness = setup();
    harness.service.importLocalState.mockRejectedValue(new Error("apiKey=private-key roleDescription=private-role"));
    const POST = createMigrationHandler(harness.deps);

    const response = await POST(jsonRequest("https://arc.example/api/migrations/local-state", "POST", migrationBody()));
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(serialized).not.toContain("private-key");
    expect(serialized).not.toContain("private-role");
  });
});
