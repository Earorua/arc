import { describe, expect, it, vi } from "vitest";
import { MAX_RESEARCH_PACKAGE_JSON_BYTES, type ResearchRunPublicView } from "../../app/contracts/research";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { ArcApiError } from "../../app/lib/cloud-client";
import { createResearchClient } from "../../app/lib/research-client";

const input = { role: "Data Product Manager", locale: "en-US" as const, mutationId: "mutation-start-1" };
const active: ResearchRunPublicView = { id: "research-run-1", role: input.role, locale: input.locale, state: "researching", retryable: false };
const needsReview: ResearchRunPublicView = { ...active, state: "needs-review", retryable: true, quality: { issueCodes: ["missing-unit"], skillCount: 3, sourceCount: 6, unitCount: 2 } };
const failed: ResearchRunPublicView = { ...active, state: "failed", retryable: true, failureCategory: "timeout" };
const ready: ResearchRunPublicView = {
  ...active, state: "ready", packageId: "research-package-1", summary: flagshipBlueprint.summary,
  skillCount: flagshipBlueprint.skills.length, sourceCount: flagshipBlueprint.resources.length,
  observedAt: "2026-09-05", quality: { passed: true, issueCodes: [] },
  planningData: { id: "research-package-1", blueprint: flagshipBlueprint, registry: flagshipUnitRegistry },
};
const signal = () => new AbortController().signal;
const wire = (value: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(value), { status, headers });
const success = (run: ResearchRunPublicView = active) => ({ run, requestId: "request-safe-1" });

describe("Research client public boundary", () => {
  it("submits only validated input with the caller signal and uncached credentials", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => wire(success()));
    const client = createResearchClient({ fetch: fetcher });
    const abortSignal = signal();
    await expect(client.startResearch(input, abortSignal)).resolves.toEqual({ ...success(), error: null });
    expect(fetcher).toHaveBeenCalledWith("/api/intelligence/research", expect.objectContaining({
      method: "POST", signal: abortSignal, credentials: "include", cache: "no-store", body: expect.any(String),
      headers: { "content-type": "application/json" },
    }));
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual(input);
  });

  it("GET restores Ready planning data by the requested run id", async () => {
    const fetcher = vi.fn(async () => wire(success(ready)));
    await expect(createResearchClient({ fetch: fetcher }).getResearch(active.id, signal())).resolves.toMatchObject({ run: ready, requestId: "request-safe-1", error: null });
    expect(fetcher).toHaveBeenCalledWith(`/api/intelligence/research/${active.id}`, expect.objectContaining({ method: "GET" }));
  });

  it("retry posts its explicit mutation id and accepts a new retry run identity", async () => {
    const next = { ...active, id: "research-run-2" };
    const fetcher = vi.fn(async () => wire(success(next)));
    await expect(createResearchClient({ fetch: fetcher }).retryResearch(active.id, { mutationId: "mutation-retry-1" }, signal())).resolves.toMatchObject({ run: next });
    expect(fetcher).toHaveBeenCalledWith(`/api/intelligence/research/${active.id}/retry`, expect.objectContaining({ method: "POST", body: JSON.stringify({ mutationId: "mutation-retry-1" }) }));
  });

  it("rejects a persisted error envelope on GET, whose terminal recovery contract is 200", async () => {
    const client = createResearchClient({ fetch: async () => wire({ run: failed, requestId: "request-1", error: {
      code: "RESEARCH_UNAVAILABLE", recovery: "retry-or-flagship", message: "Safe server message",
    } }, 503) });
    await expect(client.getResearch(active.id, signal())).rejects.toMatchObject({ code: "INTERNAL" });
  });

  it.each([
    [422, "RESEARCH_NEEDS_REVIEW", "retry-or-flagship", needsReview],
    [503, "RESEARCH_UNAVAILABLE", "retry-or-flagship", failed],
    [429, "RATE_LIMITED", "retry", { ...failed, failureCategory: "rate-limited" }],
    [429, "ALLOWANCE_REACHED", "use-flagship", { ...failed, failureCategory: "allowance-reached", retryable: false }],
  ] as const)("retains persisted terminal status %s with stable errors and Request ID", async (status, code, recovery, run) => {
    const fetcher = vi.fn(async () => wire({ run, requestId: "request-terminal", error: { code, recovery, message: "private upstream detail" } }, status));
    const result = await createResearchClient({ fetch: fetcher }).startResearch(input, signal());
    expect(result.run).toEqual(run);
    expect(result.error).toBeInstanceOf(ArcApiError);
    expect(result.error).toMatchObject({ status, code, recovery, requestId: "request-terminal" });
    expect(result.error?.message).not.toContain("private upstream detail");
  });

  it.each([
    [401, "UNAUTHENTICATED", "sign-in"], [400, "INVALID_INPUT", undefined],
    [404, "NOT_FOUND", undefined], [409, "CONFLICT", "refresh"],
    [429, "RATE_LIMITED", "retry"], [429, "ALLOWANCE_REACHED", "use-flagship"],
    [503, "RESEARCH_UNAVAILABLE", "retry-or-flagship"], [500, "INTERNAL", undefined],
  ] as const)("throws stable no-run admission error %s %s", async (status, code, recovery) => {
    const client = createResearchClient({ fetch: async () => wire({ error: { code, recovery, message: "private upstream detail" }, requestId: "request-admission" }, status) });
    await expect(client.startResearch(input, signal())).rejects.toMatchObject({ status, code, recovery, requestId: "request-admission" });
    await expect(client.startResearch(input, signal())).rejects.not.toHaveProperty("message", "private upstream detail");
  });

  it.each([
    [200, { error: { code: "INTERNAL", message: "raw" }, requestId: "request-1" }],
    [503, success(active)], [422, success(needsReview)], [201, success(active)],
    [200, { ...success(), extra: "private" }],
    [200, { ...success(), run: { ...active, retryable: true } }],
    [200, { ...success(), requestId: " bad-id " }],
    [200, { ...success(), requestId: "bad\u0001id" }],
    [422, { run: active, error: { code: "RESEARCH_NEEDS_REVIEW", message: "raw", recovery: "retry-or-flagship" }, requestId: "request-1" }],
    [503, { run: needsReview, error: { code: "RESEARCH_NEEDS_REVIEW", message: "raw", recovery: "retry-or-flagship" }, requestId: "request-1" }],
    [429, { error: { code: "RATE_LIMITED", message: "raw", recovery: "use-flagship" }, requestId: "request-1" }],
    [500, { error: { code: "UPSTREAM_SECRET", message: "raw" }, requestId: "request-1" }],
    [422, { error: { code: "RESEARCH_NEEDS_REVIEW", message: "raw", recovery: "retry-or-flagship" }, requestId: "request-1" }],
  ])("rejects malformed or contradictory envelope #%#", async (status, payload) => {
    const client = createResearchClient({ fetch: async () => wire(payload, status as number) });
    await expect(client.startResearch(input, signal())).rejects.toMatchObject({ code: "INTERNAL", message: "Arc returned an invalid research response." });
  });

  it("rejects a mismatched GET run id and a mismatched start role/locale", async () => {
    const client = createResearchClient({ fetch: async () => wire(success()) });
    await expect(client.getResearch("research-run-other", signal())).rejects.toMatchObject({ code: "INTERNAL" });
    await expect(client.startResearch({ ...input, role: "Unrelated role" }, signal())).rejects.toMatchObject({ code: "INTERNAL" });
    await expect(client.startResearch({ ...input, locale: "zh-CN" }, signal())).rejects.toMatchObject({ code: "INTERNAL" });
  });

  it("accepts server-normalized role identity", async () => {
    const client = createResearchClient({ fetch: async () => wire(success()) });
    await expect(client.startResearch({ ...input, role: " Ｄata   Product Manager " }, signal())).resolves.toMatchObject({ run: active });
  });

  it("rejects mismatched Ready package and registry identities", async () => {
    for (const run of [
      { ...ready, packageId: "other-package" },
      { ...ready, planningData: { ...ready.planningData, registry: { ...flagshipUnitRegistry, blueprintId: "other-blueprint" } } },
    ]) {
      await expect(createResearchClient({ fetch: async () => wire(success(run)) }).getResearch(active.id, signal())).rejects.toMatchObject({ code: "INTERNAL" });
    }
  });

  it("never fetches invalid request or path identities", async () => {
    const fetcher = vi.fn();
    const client = createResearchClient({ fetch: fetcher });
    await expect(client.startResearch({ ...input, role: "x" }, signal())).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(client.getResearch("../other", signal())).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(client.retryResearch(active.id, { mutationId: "short" }, signal())).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([undefined, "1", "false"])("bounds actual UTF-8 bytes with content-length %s and cancels the stream", async (contentLength) => {
    const cancel = vi.fn();
    const bytes = new TextEncoder().encode("界".repeat(Math.ceil((MAX_RESEARCH_PACKAGE_JSON_BYTES + 128_000) / 3)));
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); }, cancel });
    const response = new Response(body, { headers: contentLength ? { "content-length": contentLength } : {} });
    await expect(createResearchClient({ fetch: async () => response }).getResearch(active.id, signal())).rejects.toMatchObject({ code: "INTERNAL" });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels an over-limit declared body without reading it", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { headers: { "content-length": "999999999" } });
    await expect(createResearchClient({ fetch: async () => response }).getResearch(active.id, signal())).rejects.toMatchObject({ code: "INTERNAL" });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each([new Uint8Array([0xff]), new TextEncoder().encode("not json")])("rejects invalid UTF-8/JSON with safe diagnostic Request ID", async (bytes) => {
    const client = createResearchClient({ fetch: async () => new Response(bytes, { headers: { "x-request-id": "request-header" } }) });
    await expect(client.getResearch(active.id, signal())).rejects.toMatchObject({ code: "INTERNAL", requestId: "request-header" });
  });

  it("sanitizes fetch failures", async () => {
    const client = createResearchClient({ fetch: async () => { throw new Error("private fetch details"); } });
    await expect(client.getResearch(active.id, signal())).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE", message: "Research is temporarily unavailable.", requestId: "request-unavailable" });
  });

  it("aborts an actual pending stream read and releases its lock", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("{")); }, cancel });
    const response = new Response(body);
    const client = createResearchClient({ fetch: async () => response });
    const controller = new AbortController();
    const pending = client.getResearch(active.id, controller.signal);
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(body.locked).toBe(true));
    controller.abort();
    await rejection;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
  });

  it("does not fetch with an already aborted signal", async () => {
    const fetcher = vi.fn();
    const controller = new AbortController(); controller.abort();
    await expect(createResearchClient({ fetch: fetcher }).getResearch(active.id, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([1, 16_384])("bounds abort subscriptions independently of response chunk size %i", async (chunkSize) => {
    const bytes = new TextEncoder().encode(JSON.stringify(success()));
    let offset = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) {
      if (offset === bytes.length) { controller.close(); return; }
      controller.enqueue(bytes.subarray(offset, offset + chunkSize));
      offset = Math.min(bytes.length, offset + chunkSize);
    } });
    const race = vi.spyOn(Promise, "race");
    try {
      await expect(createResearchClient({ fetch: async () => new Response(body) }).getResearch(active.id, signal())).resolves.toMatchObject({ run: active });
      const subscriptions = new Map<unknown, number>();
      for (const [inputs] of race.mock.calls) for (const promise of inputs) subscriptions.set(promise, (subscriptions.get(promise) ?? 0) + 1);
      expect(Math.max(...subscriptions.values())).toBeLessThanOrEqual(2);
      expect(body.locked).toBe(false);
    } finally { race.mockRestore(); }
  });
});
