// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAccountRecoveryHandler } from "../../app/server/account-recovery/http";
const now = Date.parse("2026-10-14T04:00:00Z");
const token = "a".repeat(64);
const config = { operationId: "repair", sourceUserId: "retired", targetUserId: "primary", sourceAccountId: "github-row", targetAccountId: "google-row", sourceProvider: "github", targetProvider: "google", primaryPathId: "path", tokenHash: createHash("sha256").update(token).digest("hex"), issuedAt: now, expiresAt: now + 300_000 };
function fixture(configuration: unknown = config) {
  const inspect = vi.fn().mockResolvedValue({ status: "ready" });
  const apply = vi.fn().mockResolvedValue({ status: "completed" });
  const handler = createAccountRecoveryHandler({ configuration: configuration === undefined ? undefined : JSON.stringify(configuration), now: () => now, inspect, apply });
  return { handler, inspect, apply };
}
function request(body: unknown = { operationId: "repair", action: "inspect" }, credential = token) {
  return new Request("https://arc.example/api/admin/account-recovery", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${credential}` }, body: JSON.stringify(body) });
}
describe("operator recovery authorization", () => {
  it.each([null, {}, { ...config, expiresAt: now }, { ...config, expiresAt: now + 3_600_001 }, { ...config, targetUserId: "retired" }])("is unavailable without a valid, bounded configuration", async (configuration) => {
    const f = fixture(configuration); expect((await f.handler(request())).status).toBe(404); expect(f.apply).not.toHaveBeenCalled(); expect(f.inspect).not.toHaveBeenCalled();
  });
  it.each(["", "b".repeat(64)])("denies the wrong bearer credential", async (credential) => {
    const f = fixture(); expect((await f.handler(request(undefined, credential))).status).toBe(404); expect(f.inspect).not.toHaveBeenCalled();
  });
  it("does not apply during inspection and requires the configured operation ID", async () => {
    const f = fixture(); expect((await f.handler(request())).status).toBe(200); expect(f.inspect).toHaveBeenCalledOnce(); expect(f.apply).not.toHaveBeenCalled();
    expect((await f.handler(request({ operationId: "other", action: "apply" }))).status).toBe(400); expect(f.apply).not.toHaveBeenCalled();
    expect((await f.handler(request({ operationId: "repair", action: "apply" }))).status).toBe(200); expect(f.apply).toHaveBeenCalledOnce();
  });
  it("rejects oversized and unexpected input", async () => {
    const f = fixture(); expect((await f.handler(request({ operationId: "x".repeat(1025), action: "apply" }))).status).toBe(400);
    expect((await f.handler(request({ operationId: "repair", action: "apply", sourceUserId: "victim" }))).status).toBe(400); expect(f.apply).not.toHaveBeenCalled();
  });
  it("never exposes database errors or configuration secrets", async () => {
    const f = fixture(); f.apply.mockRejectedValue(new Error("private database detail"));
    const response = await f.handler(request({ operationId: "repair", action: "apply" }));
    expect(response.status).toBe(409); expect(await response.text()).not.toMatch(/private database|tokenHash|retired|primary/);
  });
});
