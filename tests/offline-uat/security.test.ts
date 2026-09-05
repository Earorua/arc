// @vitest-environment node
import { describe, expect, it } from "vitest";
import { allowsApplicationFetch, allowsHarnessRequest } from "./security";

const origin = "http://127.0.0.1:4179";
const nonce = "synthetic-process-control-token";
function request(path = "/__uat/control", headers: Record<string, string> = {}) {
  return new Request(`${origin}${path}`, { method: "POST", headers: {
    host: "127.0.0.1:4179", origin, "sec-fetch-site": "same-origin",
    "content-type": "application/json", "x-arc-uat-control": nonce, ...headers,
  }, body: "{}" });
}
describe("isolated offline UAT request boundary", () => {
  it("accepts only explicit loopback same-origin control writes with the process token", () => {
    expect(allowsHarnessRequest(request(), origin, nonce)).toBe(true);
  });
  it.each([
    { host: "attacker.example:4179" }, { origin: "https://attacker.example" },
    { origin: "null" }, { "sec-fetch-site": "cross-site" },
    { "x-arc-uat-control": "wrong" }, { "content-type": "text/plain" },
  ] as Record<string, string>[])("rejects spoofed, cross-origin, or untyped writes: %j", (headers) => {
    expect(allowsHarnessRequest(request(undefined, headers), origin, nonce)).toBe(false);
  });
  it("requires the token for ordinary product mutations as well", () => {
    expect(allowsHarnessRequest(request("/api/workspace", { "x-arc-uat-control": "" }), origin, nonce)).toBe(false);
    expect(allowsHarnessRequest(request("/api/workspace"), origin, nonce)).toBe(true);
  });
  it("allows same-origin application fetches including browser-relative paths", () => {
    for (const input of ["/api/workspace", `${origin}/api/workspace`, new URL(`${origin}/api/workspace`), new Request(`${origin}/api/workspace`)]) {
      expect(allowsApplicationFetch(input, origin)).toBe(true);
    }
  });
  it.each(["https://example.com", "//example.com/api", "http://localhost:4179/api", "http://127.0.0.1:4180", "file:///tmp/test", "data:text/plain,no"])("blocks outbound application fetch: %s", (input) => {
    expect(allowsApplicationFetch(input, origin)).toBe(false);
  });
});
