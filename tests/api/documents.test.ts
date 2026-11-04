import { describe, expect, it, vi } from "vitest";
import { createDocumentRoute, type DocumentRouteDependencies } from "../../app/server/http/document-route-factories";

const receipt = { documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", revision: 0 };
const input = { kind: "resume", displayName: "Resume", text: "PRIVATE-MATERIAL-SENTINEL-7f91", mutationId: "save-a" };
function fixture() {
  const invoke = vi.fn(async (): Promise<unknown> => receipt);
  const deps: DocumentRouteDependencies = {
    requireUser: async () => ({ id: "owner-a" }), configuredOrigin: () => "https://arc.test",
    createService: async () => ({ invoke }), rateLimiter: { reserve: async () => ({ allowed: true, retryAfterSeconds: 0 }) },
  };
  return { invoke, deps, route: createDocumentRoute("createDocument", deps) };
}
function request(body: unknown = input, origin = "https://arc.test") {
  return new Request("https://arc.test/api/documents", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
describe("private material HTTP boundary", () => {
  it("authenticates separately, validates input/output and disables caching", async () => {
    const { route, invoke } = fixture(); const response = await route(request());
    expect(response.status).toBe(201); expect(await response.json()).toEqual(receipt);
    expect(invoke).toHaveBeenCalledWith("owner-a", "createDocument", input);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
  it("rejects cross-origin and missing-origin writes before service access", async () => {
    const { route, invoke } = fixture();
    expect((await route(request(input, "https://evil.test"))).status).toBe(403);
    const missing = request(); missing.headers.delete("origin");
    expect((await route(missing)).status).toBe(403); expect(invoke).not.toHaveBeenCalled();
  });
  it("rejects caller identity and unknown fields", async () => {
    const { route, invoke } = fixture();
    expect((await route(request({ ...input, ownerId: "owner-b" }))).status).toBe(400);
    expect(invoke).not.toHaveBeenCalled();
  });
  it("counts consumed stream bytes rather than trusting Content-Length", async () => {
    const { route, invoke } = fixture();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(270_000).fill(32)); }, cancel() { cancelled = true; } });
    const req = new Request("https://arc.test/api/documents", { method: "POST", headers: { origin: "https://arc.test", "content-type": "application/json", "content-length": "1" }, body: stream, duplex: "half" } as RequestInit);
    expect((await route(req)).status).toBe(413); expect(cancelled).toBe(true); expect(invoke).not.toHaveBeenCalled();
  });
  it("hides service details and invalid responses", async () => {
    const { route, invoke } = fixture();
    invoke.mockRejectedValueOnce(Object.assign(new Error(input.text), { code: "not-found" }));
    const missing = await route(request()); expect(missing.status).toBe(404); expect(await missing.text()).not.toContain(input.text);
    invoke.mockResolvedValueOnce({ ...receipt, rawText: input.text });
    const invalid = await route(request()); expect(invalid.status).toBe(503); expect(await invalid.text()).not.toContain(input.text);
  });
  it("does not let request JSON override path IDs", async () => {
    const { deps, invoke } = fixture();
    const route = createDocumentRoute("deleteDocument", deps);
    const req = new Request("https://arc.test/api/documents/doc-a", { method: "DELETE", headers: { origin: "https://arc.test", "content-type": "application/json" }, body: JSON.stringify({ documentId: "doc-b", expectedRevision: 0, mutationId: "delete-a" }) });
    expect((await route(req, { params: Promise.resolve({ documentId: "doc-a" }) })).status).toBe(400);
    expect(invoke).not.toHaveBeenCalled();
  });
  it("rejects duplicate query keys and rate limits reads", async () => {
    const { deps, invoke } = fixture(); const route = createDocumentRoute("listDocuments", deps);
    expect((await route(new Request("https://arc.test/api/documents?limit=1&limit=2"))).status).toBe(400);
    deps.rateLimiter.reserve = async () => ({ allowed: false, retryAfterSeconds: 10 });
    expect((await route(new Request("https://arc.test/api/documents"))).status).toBe(429);
    expect(invoke).not.toHaveBeenCalled();
  });
});
