import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlanningClient } from "../../app/lib/planning-client";
import { ArcApiError } from "../../app/lib/cloud-client";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { createLocalPlanningRepository } from "../../app/lib/planning/local-repository";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

let locksDescriptor: PropertyDescriptor | undefined;
beforeEach(() => {
  locksDescriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: (_name: string, _options: unknown, action: () => unknown) => Promise.resolve().then(action) },
  });
});
afterEach(() => {
  if (locksDescriptor) Object.defineProperty(navigator, "locks", locksDescriptor);
  else Reflect.deleteProperty(navigator, "locks");
});

describe("adaptive planning browser client", () => {
  it("retains strict source context in memory and clears it on a later context-free reload", async () => {
    const repository = createLocalPlanningRepository({
      storage: new MemoryStorage(), createId: () => "planning-client-workspace",
      now: () => new Date("2026-08-17T00:00:00.000Z"),
    });
    const generated = await repository.generate({
      mutationId: "mutation-client-context", roleId: "ai-native-full-stack-engineer",
      planningDate: "2026-08-17",
      audit: {
        id: "audit-client", schemaVersion: "2026.08.1", blueprintId: flagshipBlueprint.id,
        blueprintVersion: flagshipBlueprint.version,
        answers: flagshipBlueprint.skills.map(({ id: skillId }) => ({ skillId, level: "conceptual", evidenceRefs: [] })),
        evidence: [], createdBy: "learner", inputFingerprint: "audit-client-fingerprint",
      },
      availability: {
        id: "availability-client", schemaVersion: "2026.08.1", timeZone: "Asia/Shanghai",
        weekdays: { monday: 60, tuesday: 60, wednesday: 60, thursday: 60, friday: 60, saturday: 60, sunday: 60 },
        exceptions: [], weeklyMinutes: 420, inputFingerprint: "availability-client-fingerprint",
      },
      target: { id: "target-client", schemaVersion: "2026.08.1", targetWeeks: 18, inputFingerprint: "target-client-fingerprint" },
      selectedScope: "full-scope",
    });
    const sourceContext = {
      reference: { source: "flagship" as const, roleId: "ai-native-full-stack-engineer" as const },
      blueprint: flagshipBlueprint,
      registry: flagshipUnitRegistry,
    };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ workspace: generated.workspace, sourceContext }))
      .mockResolvedValueOnce(Response.json({ workspace: null }));
    const client = createPlanningClient({ fetch: fetcher });
    await expect(client.loadWorkspace()).resolves.toEqual(generated.workspace);
    expect(client.getSourceContext?.()).toEqual(sourceContext);
    await expect(client.loadWorkspace()).resolves.toBeNull();
    expect(client.getSourceContext?.()).toBeNull();
  });

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

  it("rejects an oversized content length before pulling and cancels once", async () => {
    const pull = vi.fn();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
    const fetcher = vi.fn().mockResolvedValue(new Response(stream, {
      headers: { "content-length": String(4 * 1024 * 1024 + 1) },
    }));
    await expect(createPlanningClient({ fetch: fetcher }).loadWorkspace())
      .rejects.toMatchObject({ code: "INTERNAL" });
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("bounds and cancels deceptive streamed responses without response.text", async () => {
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
    const response = new Response(stream, { headers: { "content-length": "1" } });
    Object.defineProperty(response, "text", { value: vi.fn(() => { throw new Error("response.text forbidden"); }) });
    await expect(createPlanningClient({ fetch: vi.fn().mockResolvedValue(response) }).loadWorkspace())
      .rejects.toMatchObject({ code: "INTERNAL" });
    expect(pulls).toBeLessThanOrEqual(5);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(response.text).not.toHaveBeenCalled();
  });

  it("contains reader errors and rejects null bodies safely", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.error(new Error("private response stream")); },
    }, { highWaterMark: 0 });
    const streamed = createPlanningClient({ fetch: vi.fn().mockResolvedValue(new Response(stream)) });
    const streamError = await streamed.loadWorkspace().then(
      () => { throw new Error("expected rejection"); },
      (error) => error as ArcApiError,
    );
    expect(streamError).toMatchObject({ code: "INTERNAL" });
    expect(streamError.message).not.toContain("private response stream");

    const empty = createPlanningClient({ fetch: vi.fn().mockResolvedValue(new Response(null)) });
    await expect(empty.loadWorkspace()).rejects.toMatchObject({ code: "INTERNAL" });
  });

  it("counts Unicode response limits by raw UTF-8 bytes", async () => {
    const prefix = '{"workspace":null,"padding":"';
    const suffix = '"}';
    const budget = 4 * 1024 * 1024;
    const exactCount = Math.floor((budget - new TextEncoder().encode(prefix + suffix).byteLength) / 4);
    const exact = `${prefix}${"😀".repeat(exactCount)}${suffix}`;
    const over = `${prefix}${"😀".repeat(exactCount + 1)}${suffix}`;
    expect(new TextEncoder().encode(exact).byteLength).toBeLessThanOrEqual(budget);
    expect(new TextEncoder().encode(over).byteLength).toBeGreaterThan(budget);
    await expect(createPlanningClient({ fetch: vi.fn().mockResolvedValue(new Response(exact)) }).loadWorkspace())
      .rejects.toThrow("invalid response");
    await expect(createPlanningClient({ fetch: vi.fn().mockResolvedValue(new Response(over)) }).loadWorkspace())
      .rejects.toMatchObject({ code: "INTERNAL" });
  });
});
