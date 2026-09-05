// @vitest-environment node
import { describe, it, vi } from "vitest";
import { createResearchD1 } from "../helpers/sqlite-d1";
import { verifyAtomicSetupGuards, verifyOfflineStorage } from "./storage-smoke";
vi.mock("../../app/server/auth/runtime", () => ({ getAuth: () => { throw new Error("Offline harness forbids OAuth"); } }));
describe("disposable SQLite smoke implementing D1", () => {
  it("covers actual fresh owner Research, activation, planning, replay and proof", async () => {
    const db = createResearchD1();
    try { await verifyOfflineStorage(db as unknown as D1Database); } finally { db.close(); }
  });
  it("rolls back five real atomic setup races without false receipts", async () => {
    const db = createResearchD1();
    try { await verifyAtomicSetupGuards(db as unknown as D1Database); } finally { db.close(); }
  });
});
