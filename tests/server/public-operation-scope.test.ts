import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicOperationScope, PublicOperationTimeout } from "../../app/server/research/public-operation-scope";
import { createGuardedD1 } from "../../app/server/research/site-bridge-factory";
import { createD1OperationBarrier } from "../helpers/research-bridge-fixture";
import { createResearchD1 } from "../helpers/sqlite-d1";

afterEach(() => vi.useRealTimers());

describe("public operation scope", () => {
  it("ends a never-resolving operation at the original 4500ms wall timer even when mono time stalls", async () => {
    vi.useFakeTimers();
    const scope = new PublicOperationScope(() => 0);
    const pending = expect(scope.run(() => new Promise<never>(() => {}))).rejects.toBeInstanceOf(PublicOperationTimeout);
    await vi.advanceTimersByTimeAsync(4499);
    expect(scope.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(scope.signal.aborted).toBe(true);
    expect(() => scope.ensure()).toThrow(PublicOperationTimeout);
    scope.finish();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shares the remaining monotonic budget across awaits and fences before another operation", async () => {
    let now = 0;
    const scope = new PublicOperationScope(() => now);
    await scope.run(async () => { now = 4499; });
    const next = vi.fn(async () => { now = 4500; return "late"; });
    await expect(scope.run(next)).rejects.toBeInstanceOf(PublicOperationTimeout);
    const forbidden = vi.fn(async () => "never");
    await expect(scope.run(forbidden)).rejects.toBeInstanceOf(PublicOperationTimeout);
    expect(forbidden).not.toHaveBeenCalled();
    scope.finish();
  });

  it.each([NaN, Infinity, -1, Number.MAX_SAFE_INTEGER])("rejects unsafe initial clock %s", (now) => {
    expect(() => new PublicOperationScope(() => now)).toThrow();
  });

  it("rejects a backwards clock and stops already waiting work on explicit close", async () => {
    let now = 10;
    const scope = new PublicOperationScope(() => now);
    now = 9;
    expect(() => scope.ensure()).toThrow();
    scope.finish();
    const second = new PublicOperationScope(() => 0);
    const pending = expect(second.run(() => new Promise<never>(() => {}))).rejects.toBeInstanceOf(PublicOperationTimeout);
    second.finish();
    await pending;
  });

  it("bounds a separate 500ms read scope and leaves no timer or late continuation", async () => {
    vi.useFakeTimers();
    const scope = new PublicOperationScope(() => 0, 500);
    let release!: (value: string) => void;
    const after = vi.fn();
    const pending = expect(scope.run(async () => {
      await new Promise<string>((resolve) => { release = resolve; });
      scope.ensure();
      after();
    })).rejects.toBeInstanceOf(PublicOperationTimeout);
    await vi.advanceTimersByTimeAsync(500);
    await pending;
    release("late");
    await Promise.resolve();
    expect(after).not.toHaveBeenCalled();
    scope.finish();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows dispatched native SQL to commit but blocks all work after its delayed acknowledgement", async () => {
    vi.useFakeTimers();
    const db = createResearchD1();
    const barrier = createD1OperationBarrier(db as unknown as D1Database, () => false,
      (sql) => sql.includes("INSERT INTO research_bridge_nonces"));
    const scope = new PublicOperationScope(() => 0);
    const guarded = createGuardedD1(barrier.db, scope.ensure);
    // A native SQL write is used here; abort cannot undo an already dispatched statement.
    const pending = expect(scope.run(async () => {
      await guarded.prepare("INSERT INTO research_bridge_nonces(scope,nonce,expires_at,created_at) VALUES('site-to-executor:test','11111111111111111111111111111111',1000,0)").run();
      await guarded.prepare("DELETE FROM research_bridge_nonces").run();
    })).rejects.toBeInstanceOf(PublicOperationTimeout);
    await barrier.entered;
    await vi.advanceTimersByTimeAsync(4500);
    await pending;
    barrier.expire(); barrier.release();
    await Promise.resolve(); await Promise.resolve();
    expect(barrier.lateStarts()).toBe(0);
    expect(db.database.prepare("SELECT count(*) AS n FROM research_bridge_nonces").get()).toEqual({ n: 1 });
    scope.finish(); db.close();
  });
});
