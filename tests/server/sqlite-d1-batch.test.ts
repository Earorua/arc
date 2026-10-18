// @vitest-environment node

import { describe, expect, it } from "vitest";
import { SqliteD1 } from "../helpers/sqlite-d1";

describe("SQLite D1 read batch results", () => {
  it("returns actual rows for each SELECT alongside write results in one transaction", async () => {
    const db = new SqliteD1();
    try {
      db.database.exec("CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
      const results = await db.batch([
        db.prepare("INSERT INTO sample (id,value) VALUES (?1,?2)").bind(1, "first"),
        db.prepare("SELECT id,value FROM sample WHERE id=?1").bind(1),
        db.prepare("SELECT id,value FROM sample WHERE id=?1").bind(2),
      ]);
      expect(results).toMatchObject([
        { success: true, results: [], meta: { changes: 1 } },
        { success: true, results: [{ id: 1, value: "first" }], meta: { changes: 0 } },
        { success: true, results: [], meta: { changes: 0 } },
      ]);
    } finally { db.close(); }
  });

  it("rolls back a mixed batch if a later statement fails", async () => {
    const db = new SqliteD1();
    try {
      db.database.exec("CREATE TABLE sample (id INTEGER PRIMARY KEY)");
      db.failAtBatchStatement = 2;
      await expect(db.batch([
        db.prepare("INSERT INTO sample (id) VALUES (1)"),
        db.prepare("SELECT id FROM sample"),
        db.prepare("INSERT INTO sample (id) VALUES (2)"),
      ])).rejects.toThrow("injected batch failure");
      expect(db.database.prepare("SELECT id FROM sample").all()).toEqual([]);
    } finally { db.close(); }
  });
});
