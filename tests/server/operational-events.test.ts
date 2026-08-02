import { describe, expect, it, vi } from "vitest";
import {
  createOperationalEvent,
  operationalEventSchema,
} from "../../app/server/observability/events";
import { D1OperationalEventSink } from "../../app/server/observability/d1-events";

const hashedOwner = "a".repeat(64);

const baseEvent = {
  requestId: "00000000-0000-4000-8000-000000000001",
  route: "/api/workspace",
  resultCode: "OK",
  latencyMs: 12,
  userSurrogate: hashedOwner,
  counters: { writes: 1 },
};

describe("operational events", () => {
  it("hashes the owner and emits only the strict allowlist", async () => {
    const hash = vi.fn().mockResolvedValue(hashedOwner);

    const event = await createOperationalEvent({
      requestId: baseEvent.requestId,
      route: baseEvent.route,
      resultCode: "OK",
      latencyMs: 12,
      userId: "user-owner",
      counters: { writes: 1 },
    }, { hash });

    expect(hash).toHaveBeenCalledWith("user-owner");
    expect(event.userSurrogate).toBe(hashedOwner);
    expect(JSON.stringify(event)).not.toContain("user-owner");
    expect(Object.keys(event).sort()).toEqual([
      "counters",
      "latencyMs",
      "requestId",
      "resultCode",
      "route",
      "userSurrogate",
    ]);
  });

  it.each(["password", "token", "secret", "apiKey", "roleDescription", "fileBody"])(
    "rejects a forbidden %s property",
    (field) => {
      expect(() => operationalEventSchema.parse({ ...baseEvent, [field]: "private" })).toThrow();
    },
  );

  it.each([
    "link_intent_created",
    "link_source_verified",
    "link_grant_consumed",
    "link_completed",
    "link_conflict",
    "link_expired",
    "link_replay_denied",
    "link_bypass_denied",
  ])("accepts the stable account-link outcome %s without identity data", (resultCode) => {
    expect(operationalEventSchema.parse({
      ...baseEvent,
      resultCode,
      counters: { attempt: 1 },
    })).toMatchObject({ resultCode, counters: { attempt: 1 } });
  });

  it.each([
    "token",
    "secret",
    "password",
    "api_key",
    "apikey",
    "authorization",
    "cookie",
    "email",
    "user_id",
    "userid",
    "role",
    "proof",
    "content",
    "body",
    "account",
    "provider",
    "callback",
    "intent",
  ])("rejects the sensitive counter fragment %s", (fragment) => {
    expect(() => operationalEventSchema.parse({
      ...baseEvent,
      counters: { [`${fragment}_count`]: 1 },
    })).toThrow("Sensitive counter names are forbidden.");
  });

  it("persists only the already-sanitized event", async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            calls.push({ sql, values });
            return { run: vi.fn().mockResolvedValue({ success: true }) };
          },
        };
      },
    } as unknown as D1Database;
    const sink = new D1OperationalEventSink(db, {
      createId: () => "event-1",
      now: () => 1_785_196_800_000,
    });

    await sink.record(operationalEventSchema.parse(baseEvent));

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("INSERT INTO operational_events");
    expect(calls[0].values).toContain(hashedOwner);
    expect(JSON.stringify(calls)).not.toMatch(/password|token|secret|apiKey|roleDescription|fileBody/);
  });
});
