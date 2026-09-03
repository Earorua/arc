import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Bindings = unknown[];
const D1_VALUE_MAX = 2_000_000;
const valueBytes = (value: unknown): number => typeof value === "string" ? new TextEncoder().encode(value).byteLength : value instanceof Uint8Array ? value.byteLength : value === null ? 0 : 8;
function boundedRow<T>(row: T): T {
  if (row && typeof row === "object" && Object.values(row).reduce((total, value) => total + valueBytes(value), 0) > D1_VALUE_MAX) throw new Error("D1 row too large");
  return row;
}

class SqliteStatement {
  private bindings: Bindings = [];
  constructor(private readonly database: SqliteD1, readonly sql: string) {}
  bind(...values: unknown[]) {
    if (values.length > 100) throw new Error("D1 parameter limit");
    if (values.some((value) => valueBytes(value) > D1_VALUE_MAX)) throw new Error("D1 value too large");
    const bound = new SqliteStatement(this.database, this.sql);
    bound.bindings = values.map((value) => value instanceof Uint8Array ? value.slice() : value);
    return bound as unknown as D1PreparedStatement;
  }
  async first<T = Record<string, unknown>>() {
    const row = this.database.execute(this.sql, this.bindings, "get") as T | undefined;
    return row ?? null;
  }
  async all<T = Record<string, unknown>>() {
    return { success: true, results: this.database.execute(this.sql, this.bindings, "all") as T[], meta: {} };
  }
  async run() {
    const result = this.runSync();
    return { success: true, meta: { changes: result.changes ?? 0 } };
  }
  runSync() { return this.database.execute(this.sql, this.bindings, "run") as { changes?: number }; }
}

/** Minimal, real-SQLite D1 adapter for repository tests. */
export class SqliteD1 {
  readonly database = new DatabaseSync(":memory:");
  readonly batches: string[][] = [];
  readonly preparedSql: string[] = [];
  failAtBatchStatement: number | null = null;
  prepare(sql: string): D1PreparedStatement {
    if (new TextEncoder().encode(sql).byteLength > 100_000) throw new Error("D1 SQL too large");
    this.preparedSql.push(sql);
    return new SqliteStatement(this, sql) as unknown as D1PreparedStatement;
  }
  async batch(statements: D1PreparedStatement[]) {
    this.batches.push(statements.map((statement) => (statement as unknown as SqliteStatement).sql));
    this.database.exec("BEGIN");
    try {
      const results: unknown[] = [];
      for (let index = 0; index < statements.length; index++) {
        if (this.failAtBatchStatement === index) throw new Error("injected batch failure");
        const result = (statements[index] as unknown as SqliteStatement).runSync();
        results.push({ success: true, meta: { changes: result.changes ?? 0 } });
      }
      this.database.exec("COMMIT");
      return results as D1Result<unknown>[];
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
  execute(sql: string, values: Bindings, mode: "get" | "all" | "run"): unknown {
    if (values.length > 100) throw new Error("D1 parameter limit");
    const statement = this.database.prepare(sql);
    if (mode === "get") return boundedRow(statement.get(...values as never[]));
    if (mode === "all") return statement.all(...values as never[]).map(boundedRow);
    return statement.run(...values as never[]) as { changes?: number };
  }
  close() { this.database.close(); }
}

export function createResearchD1(): SqliteD1 {
  const db = new SqliteD1();
  db.database.exec("PRAGMA foreign_keys = ON");
  for (const file of ["0000_beta_foundation.sql", "0001_secure_account_linking.sql", "0002_product_intelligence.sql", "0003_adaptive_planning.sql", "0004_proof_backed_stack.sql", "0005_openrouter_research_beta.sql", "0006_research_health_indexes.sql"]) {
    const sql = readFileSync(resolve(process.cwd(), "drizzle", file), "utf8").replaceAll("--> statement-breakpoint", ";");
    db.database.exec(sql);
  }
  return db;
}

export function seedUser(db: SqliteD1, id: string) {
  db.database.prepare("INSERT INTO users (id,name,email,email_verified) VALUES (?1,?2,?3,0)").run(id, id, `${id}@example.test`);
}
