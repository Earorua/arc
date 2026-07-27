import { describe, expect, it, vi } from "vitest";
import {
  apiJson,
  applyResponseSafety,
  resolveRequestId,
} from "../../app/server/http/api-response";
import {
  createOperationalEvent,
  operationalEventSchema,
} from "../../app/server/observability/events";

const requestId = "00000000-0000-4000-8000-000000000001";

describe("response safety", () => {
  it("keeps a valid incoming request ID stable and replaces malformed values", () => {
    const createId = vi.fn().mockReturnValue("00000000-0000-4000-8000-000000000002");

    expect(resolveRequestId(requestId, createId)).toBe(requestId);
    expect(resolveRequestId("attacker-controlled\r\nheader", createId)).toBe(
      "00000000-0000-4000-8000-000000000002",
    );
    expect(createId).toHaveBeenCalledTimes(1);
  });

  it("adds conservative browser headers and a request ID only when absent", () => {
    const response = applyResponseSafety(new Response("ok"), requestId);

    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.has("content-security-policy")).toBe(false);
  });

  it("keeps API responses non-cacheable while allowing stricter private policy", () => {
    expect(apiJson({ ok: true }, requestId).headers.get("cache-control")).toBe("no-store");
    expect(apiJson({ ok: true }, requestId, {
      headers: { "Cache-Control": "private, no-store" },
    }).headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("operational redaction", () => {
  it("drops query strings and fragments from recorded routes", async () => {
    await expect(createOperationalEvent({
      requestId,
      route: "/api/workspace?token=private#secret",
      resultCode: "OK",
      latencyMs: 4,
      counters: { writes: 1 },
    })).resolves.toMatchObject({ route: "/api/workspace" });
  });

  it.each(["token", "secret", "password", "api_key", "email", "user_id", "proof_body"])(
    "rejects sensitive counter name %s",
    (field) => {
      expect(() => operationalEventSchema.parse({
        requestId,
        route: "/api/workspace",
        resultCode: "OK",
        latencyMs: 4,
        userSurrogate: null,
        counters: { [field]: 1 },
      })).toThrow();
    },
  );
});
