import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createResearchD1, seedUser } from "../helpers/sqlite-d1";
import { D1AgentRepository } from "../../app/server/agents/repository";

describe("agent run persistence", () => {
  function fixture() {
    const db = createResearchD1();
    seedUser(db, "alice"); seedUser(db, "bob");
    db.database.exec(readFileSync(resolve("drizzle/0013_learning_agents.sql"), "utf8"));
    return { db, repository: new D1AgentRepository(db as unknown as D1Database) };
  }
  const limits = { siteDailyMicros: 200, siteMonthlyMicros: 500, userDailyMicros: 100 };
  const run = (id: string, ownerId = "alice") => ({ id, ownerId, goalId: "goal-agent", kind: "planner" as const,
    message: "Plan my learning", context: "{}", baseVersionId: "plan-one", revision: 0, workspaceId: "workspace-agent",
    model: "gpt-6-astra", effort: "max", reservedMicros: 60, fingerprint: id, createdAt: Date.UTC(2026, 9, 14) });
  it("isolates owners and goals and prevents duplicate paid work", async () => {
    const { db, repository } = fixture();
    try {
      expect(await repository.reserve(run("run-a"), limits)).toBe(true);
      expect(await repository.reserve(run("run-a"), limits)).toBe(false);
      expect(await repository.find("bob", "goal-agent", "run-a")).toBeNull();
      expect(await repository.find("alice", "other-goal", "run-a")).toBeNull();
      expect((await repository.history("alice", "goal-agent")).length).toBe(1);
    } finally { db.close(); }
  });
  it("atomically enforces user budget across concurrent reservations", async () => {
    const { db, repository } = fixture();
    try {
      const values = await Promise.all([repository.reserve(run("run-a"), limits),
        repository.reserve({ ...run("run-b"), kind: "tutor" }, limits)]);
      expect(values.filter(Boolean)).toHaveLength(1);
    } finally { db.close(); }
  });
  it("keeps outstanding and latest planner runs discoverable beyond the chat window", async () => {
    const { db, repository } = fixture();
    const budget = { siteDailyMicros: 10000, siteMonthlyMicros: 10000, userDailyMicros: 10000 };
    try {
      await repository.reserve(run("old-planner"), budget);
      for (let index = 0; index < 31; index += 1) {
        const item = { ...run(`tutor-${index}`), kind: "tutor" as const, createdAt: run("").createdAt + index + 1 };
        await repository.reserve(item, budget);
        await repository.update((await repository.find("alice", item.goalId, item.id))!, { status: "complete", answer: "answer" });
      }
      expect((await repository.history("alice", "goal-agent")).some(item => item.id === "old-planner")).toBe(true);
      await repository.update((await repository.find("alice", "goal-agent", "old-planner"))!, { status: "complete" });
      expect((await repository.history("alice", "goal-agent")).some(item => item.id === "old-planner")).toBe(true);
    } finally { db.close(); }
  });
});
