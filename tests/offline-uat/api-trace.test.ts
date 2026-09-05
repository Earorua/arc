// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createOfflineApiTrace } from "./api-trace";

const origin = "http://127.0.0.1:4179";
const request = (path = "/api/planning/workspace", method = "GET") => new Request(`${origin}${path}`, { method });

describe("bounded offline API result diagnostics", () => {
  it("records only method, pathname without query, and status without touching contents", async () => {
    const trace = createOfflineApiTrace();
    const input = request("/api/planning/generate?fixture=synthetic-private-value", "POST");
    const response = new Response("synthetic-private-body", { status: 403 });
    const forbidden = () => { throw new Error("Diagnostic must not read request or response contents"); };
    for (const value of [input, response]) for (const key of ["body", "headers", "clone"]) Object.defineProperty(value, key, { get: forbidden });
    expect(await trace.observe(input, async () => response)).toBe(response);
    expect(trace.snapshot()).toEqual([{ method: "POST", pathname: "/api/planning/generate", status: 403 }]);
  });

  it("does not record controls, page, or lookalike paths", async () => {
    const trace = createOfflineApiTrace();
    for (const path of ["/__uat/state", "/__uat/control", "/setup", "/api-other/workspace"]) {
      const response = new Response(null, { status: 200 });
      expect(await trace.observe(request(path), async () => response)).toBe(response);
    }
    expect(trace.snapshot()).toEqual([]);
  });

  it.each([
    [new DOMException("synthetic-private-abort-message", "AbortError"), "abort"],
    [new Error("synthetic-private-transport-message"), "transport"],
    ["synthetic-private-thrown-value", "transport"],
  ] as const)("classifies failures without replacing or exposing the thrown value", async (failure, category) => {
    const trace = createOfflineApiTrace();
    await expect(trace.observe(request(), async () => { throw failure; })).rejects.toBe(failure);
    expect(trace.snapshot()).toEqual([{ method: "GET", pathname: "/api/planning/workspace", status: null, failure: category }]);
  });

  it("keeps at most twenty completed results and returns detached snapshots", async () => {
    const trace = createOfflineApiTrace();
    for (let i = 0; i < 24; i++) await trace.observe(request(`/api/test/${i}`), async () => new Response(null, { status: 204 }));
    const snapshot = trace.snapshot();
    expect(snapshot).toHaveLength(20);
    expect(snapshot[0].pathname).toBe("/api/test/4");
    expect(snapshot[19].pathname).toBe("/api/test/23");
    snapshot[0].pathname = "/modified";
    snapshot.pop();
    expect(trace.snapshot()).toHaveLength(20);
    expect(trace.snapshot()[0].pathname).toBe("/api/test/4");
  });
});
