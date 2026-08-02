import { describe, expect, it, vi } from "vitest";
import {
  D1RateLimiter,
  RateLimitUnavailableError,
} from "../../app/server/http/rate-limit";

class FakeRateStatement {
  values: unknown[] = [];

  constructor(private readonly db: FakeRateD1, readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    this.db.calls.push({ sql: this.sql, values });
    return this;
  }

  async first<T>() {
    if (this.db.error) throw this.db.error;
    const scope = String(this.values[1]);
    const subjectHash = String(this.values[2]);
    const windowStart = Number(this.values[3]);
    const key = `${scope}:${subjectHash}:${windowStart}`;
    const count = (this.db.counts.get(key) ?? 0) + 1;
    this.db.counts.set(key, count);
    return { count } as T;
  }
}

class FakeRateD1 {
  readonly calls: Array<{ sql: string; values: unknown[] }> = [];
  readonly counts = new Map<string, number>();
  error: Error | null = null;

  prepare(sql: string) {
    return new FakeRateStatement(this, sql);
  }
}

describe("D1RateLimiter", () => {
  it("uses an atomic scoped window and never persists the raw subject", async () => {
    const db = new FakeRateD1();
    const hash = vi.fn().mockResolvedValue("hashed-subject");
    const limiter = new D1RateLimiter(db as unknown as D1Database, {
      now: () => 1_785_196_805_000,
      createId: () => "bucket-1",
      hash,
    });
    const input = { scope: "workspace:write", subject: "user-owner", limit: 2, windowSeconds: 60 };

    await expect(limiter.reserve(input)).resolves.toMatchObject({ allowed: true });
    await expect(limiter.reserve(input)).resolves.toMatchObject({ allowed: true });
    await expect(limiter.reserve(input)).resolves.toMatchObject({ allowed: false, retryAfterSeconds: 55 });

    expect(hash).toHaveBeenCalledWith("workspace:write\0user-owner");
    expect(db.calls[0].sql).toContain("ON CONFLICT(scope, subject_hash, window_start) DO UPDATE");
    expect(db.calls[0].sql).toContain("RETURNING count");
    expect(JSON.stringify(db.calls)).not.toContain("user-owner");
  });

  it("separates scopes and starts a new bucket after expiry", async () => {
    const db = new FakeRateD1();
    let now = 1_785_196_805_000;
    const limiter = new D1RateLimiter(db as unknown as D1Database, {
      now: () => now,
      createId: () => crypto.randomUUID(),
      hash: async () => "hashed-subject",
    });

    const first = await limiter.reserve({ scope: "migration", subject: "owner", limit: 1, windowSeconds: 60 });
    const otherScope = await limiter.reserve({ scope: "completion", subject: "owner", limit: 1, windowSeconds: 60 });
    now += 61_000;
    const nextWindow = await limiter.reserve({ scope: "migration", subject: "owner", limit: 1, windowSeconds: 60 });

    expect(first.allowed).toBe(true);
    expect(otherScope.allowed).toBe(true);
    expect(nextWindow.allowed).toBe(true);
    expect(db.counts).toHaveLength(3);
    expect(Number(db.calls[0].values[5])).toBe(Number(db.calls[0].values[3]) + 60_000);
  });

  it("fails closed when D1 cannot reserve a bucket", async () => {
    const db = new FakeRateD1();
    db.error = new Error("D1 unavailable");
    const limiter = new D1RateLimiter(db as unknown as D1Database, {
      hash: async () => "hashed-subject",
    });

    await expect(limiter.reserve({
      scope: "migration",
      subject: "owner",
      limit: 1,
      windowSeconds: 60,
    })).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });
});
