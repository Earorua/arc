// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { createControlPoint, createSiteAdmissionFixture } from "../helpers/site-admission-fixture";

const NOW = Date.parse("2026-09-15T12:00:00.000Z");
const fixtureDBs: ReturnType<typeof createSiteAdmissionFixture>["db"][] = [];

afterEach(() => {
  for (const db of fixtureDBs.splice(0)) db.close();
});

function fixture() {
  const value = createSiteAdmissionFixture();
  fixtureDBs.push(value.db);
  return value;
}

describe("site admission test infrastructure", () => {
  it("keeps the SQL subsecond clock independent from the application clock", () => {
    const value = fixture();
    const initial = value.db.database.prepare("SELECT unixepoch('subsec') AS now").get() as { now: number };

    value.setAppNow(NOW + 1_000);
    expect(value.db.database.prepare("SELECT unixepoch('subsec') AS now").get()).toEqual(initial);
    expect(value.command().activeExpiresAt).toBe(NOW + 1_000 + 120_000);

    value.setSqlNow(NOW + 1_234);
    expect(value.db.database.prepare("SELECT unixepoch('subsec') AS now").get()).toEqual({ now: (NOW + 1_234) / 1_000 });
  });

  it("enforces owner isolation for ordinary research run creation and reads", async () => {
    const value = fixture();
    const created = await value.research.createOrReplay(value.command("owner-a"));

    await expect(value.research.getRun("owner-a", created.run.id)).resolves.toEqual(created.run);
    await expect(value.research.getRun("owner-b", created.run.id)).resolves.toBeNull();
  });

  it("provides deterministic remote commands, job identities, and execution counts", () => {
    const value = fixture() as ReturnType<typeof createSiteAdmissionFixture> & {
      remoteCommand?: (ownerId?: string) => unknown;
      readCounts: () => Record<string, number>;
    };
    expect(typeof value.remoteCommand).toBe("function");
    expect(value.remoteCommand?.("owner-b")).toMatchObject({
      ownerId: "owner-b",
      policy: { cacheDays: 30, userDailyQuota: 3, dailyBudgetMicros: 20_000_000, monthlyBudgetMicros: 100_000_000, maximumMicros: 5_000_000 },
    });
    expect(value.readCounts().siteExecutions).toBe(0);
  });

  it("pauses a real prepared SQLite update before resuming it", async () => {
    const value = fixture();
    const point = createControlPoint();
    const write = (async () => {
      await point.wait();
      await value.db.prepare("UPDATE users SET name=?1 WHERE id=?2").bind("resumed", "owner-a").run();
    })();

    await point.entered;
    expect(value.db.database.prepare("SELECT name FROM users WHERE id=?").get("owner-a")).toEqual({ name: "owner-a" });
    point.resume();
    await write;
    expect(value.db.database.prepare("SELECT name FROM users WHERE id=?").get("owner-a")).toEqual({ name: "resumed" });
  });
});
