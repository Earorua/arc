import { describe, expect, it, vi } from "vitest";
import { createPlanningClient } from "../../app/lib/planning-client";
import { ArcApiError } from "../../app/lib/cloud-client";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";

describe("adaptive planning browser client", () => {
  it("loads a strict nullable workspace with credentials and no caching", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ workspace: null }));
    const client = createPlanningClient({ fetch: fetcher });
    await expect(client.loadWorkspace()).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledWith("/api/planning/workspace", expect.objectContaining({
      method: "GET", credentials: "include", cache: "no-store",
    }));
  });

  it("uses exact JSON write routes and strict input schemas", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ invalid: true }));
    const client = createPlanningClient({ fetch: fetcher });
    const event = {
      mutationId: "mutation-event-1", baseVersionId: "plan-1",
      event: { kind: "skipped" as const, unitId: "unit-1", planningDate: "2026-08-17" },
    };
    await expect(client.appendEvent(event)).rejects.toThrow("invalid response");
    expect(fetcher).toHaveBeenCalledWith("/api/planning/events", expect.objectContaining({
      method: "POST", credentials: "include", cache: "no-store",
      headers: expect.objectContaining({ "content-type": "application/json" }),
      body: JSON.stringify(event),
    }));

    await expect(client.appendEvent({ ...event, ownerId: "attacker" } as never)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("sends strict generation input to its exact endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ invalid: true }));
    const client = createPlanningClient({ fetch: fetcher });
    const generation = {
      mutationId: "mutation-generate-1", roleId: "ai-native-full-stack-engineer" as const,
      planningDate: "2026-08-17",
      audit: {
        id: "audit-1", schemaVersion: "2026.08.1" as const, blueprintId: flagshipBlueprint.id,
        blueprintVersion: flagshipBlueprint.version,
        answers: [{ skillId: flagshipBlueprint.skills[0]!.id, level: "conceptual" as const, evidenceRefs: [] }],
        evidence: [], createdBy: "learner", inputFingerprint: "audit-fingerprint",
      },
      availability: {
        id: "availability-1", schemaVersion: "2026.08.1" as const, timeZone: "Asia/Shanghai",
        weekdays: { monday: 60, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 0 },
        exceptions: [], weeklyMinutes: 60, inputFingerprint: "availability-fingerprint",
      },
      target: { id: "target-1", schemaVersion: "2026.08.1" as const, targetWeeks: 18, inputFingerprint: "target-fingerprint" },
      selectedScope: "full-scope" as const,
    };
    await expect(client.generate(generation)).rejects.toThrow("invalid response");
    expect(fetcher.mock.calls[0]![0]).toBe("/api/planning/generate");
    expect(JSON.parse(String((fetcher.mock.calls[0]![1] as RequestInit).body))).toEqual(generation);
  });

  it.each([
    ["acceptReplan", "/api/planning/replans/accept"],
    ["discardReplan", "/api/planning/replans/discard"],
  ] as const)("sends %s to its exact endpoint", async (method, path) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ invalid: true }));
    const client = createPlanningClient({ fetch: fetcher });
    const decision = { mutationId: "mutation-decision-1", baseVersionId: "plan-1", candidatePlanVersionId: "plan-2" };
    await expect(client[method](decision)).rejects.toThrow("invalid response");
    expect(fetcher.mock.calls[0]![0]).toBe(path);
  });

  it("retains a strict safe recovery action on Arc API errors", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: {
      code: "CONFLICT", message: "Planning state changed.",
      requestId: "00000000-0000-4000-8000-000000000001", action: "refresh",
    } }, { status: 409 }));
    const client = createPlanningClient({ fetch: fetcher });
    const error = await client.acceptReplan({ mutationId: "mutation-decision-1", baseVersionId: "plan-1", candidatePlanVersionId: "plan-2" })
      .catch((caught) => caught as ArcApiError);
    expect(error).toMatchObject({ status: 409, code: "CONFLICT", action: "refresh" });
  });

  it("rejects unknown success/error fields and oversized responses", async () => {
    const unknownSuccess = vi.fn().mockResolvedValue(Response.json({ workspace: null, debug: true }));
    const unknownError = vi.fn().mockResolvedValue(Response.json({ error: {
      code: "CONFLICT", message: "safe", requestId: "request-1", action: "refresh", debug: "private",
    } }, { status: 409 }));
    const oversized = vi.fn().mockResolvedValue(new Response(" ".repeat(4 * 1024 * 1024 + 1)));
    await expect(createPlanningClient({ fetch: unknownSuccess }).loadWorkspace()).rejects.toThrow("invalid response");
    await expect(createPlanningClient({ fetch: unknownError }).loadWorkspace()).rejects.toThrow("invalid response");
    await expect(createPlanningClient({ fetch: oversized }).loadWorkspace()).rejects.toThrow("invalid response");
  });
});
