// @vitest-environment node

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { D1BridgeNonceStore } from "../../app/server/research/executor/d1-nonce-store";
import {
  BridgeAuthError,
  type BridgeMessageContext,
  signBridgeMessage,
  verifyBridgeMessage,
} from "../../app/server/research/executor/auth";
import { createResearchD1, SqliteD1 } from "../helpers/sqlite-d1";

const NOW = 1_800_000_000_000;
const INPUT = {
  scope: "site-to-executor:synthetic-1",
  nonce: "12".repeat(16),
  now: NOW,
  expiresAt: NOW + 120_001,
};
const EXECUTOR_MIGRATION = resolve(
  process.cwd(),
  "worker/research-executor/migrations/0000_research_bridge_nonces.sql",
);
const SITE_MIGRATION = resolve(
  process.cwd(),
  "drizzle/0007_research_bridge_nonces.sql",
);
const PRIOR_MIGRATIONS = [
  "0000_beta_foundation.sql",
  "0001_secure_account_linking.sql",
  "0002_product_intelligence.sql",
  "0003_adaptive_planning.sql",
  "0004_proof_backed_stack.sql",
  "0005_openrouter_research_beta.sql",
  "0006_research_health_indexes.sql",
] as const;
const PRIOR_MIGRATION_HASHES: Record<(typeof PRIOR_MIGRATIONS)[number], string> = {
  "0000_beta_foundation.sql": "9b59e5e4f30cc70e0783abd2359b5821c3ea31eeeaef30e38dffa1d3d394dfa4",
  "0001_secure_account_linking.sql": "a26d95b165915b9bc88705299b6c7bd8cdeced54cd1e24b3c479594e60fb56a4",
  "0002_product_intelligence.sql": "f5449ea8d59e1869a480062ae5aaf40007795a2a1c725e0c3bfe7ca34b296c68",
  "0003_adaptive_planning.sql": "fce561140d8b2835f1518f08e3ea26a96d7fa4b298197ca55b9b72f39961c25d",
  "0004_proof_backed_stack.sql": "a01c4f719701ae683ed1f1b8769b724065bfbfd93def02614f89154df784b859",
  "0005_openrouter_research_beta.sql": "bbecea2119999103906e3c721d602467124a60f72ad9c672ae847212fe52ee35",
  "0006_research_health_indexes.sql": "24caea1c12c3ffa16b7b03c4f0a5a9c21736501b6dc2b2f2afbd149e6da78b73",
};
const EVIDENCE_ROOT = resolve(
  process.cwd(),
  "outputs/local-durable-executor-20260914",
);
const encoder = new TextEncoder();

function executorDdl(): string {
  return readFileSync(EXECUTOR_MIGRATION, "utf8")
    .replaceAll("--> statement-breakpoint", ";");
}

function readMigration(path: string): string {
  return readFileSync(path, "utf8").replaceAll("--> statement-breakpoint", ";");
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function createNonceDb(filename = ":memory:"): SqliteD1 {
  const db = new SqliteD1(filename);
  db.database.exec(executorDdl());
  return db;
}

function rowCount(db: SqliteD1): number {
  const row = db.database.prepare(
    "SELECT count(*) AS n FROM research_bridge_nonces",
  ).get() as { n: number };
  return row.n;
}

function requestContext(): BridgeMessageContext {
  return {
    direction: "site-to-executor",
    kind: "request",
    method: "POST",
    path: "/internal/research/jobs",
    audience: "https://executor.example",
    jobId: "11111111-1111-4111-8111-111111111111",
    status: null,
  };
}

function removeCreatedDatabase(directory: string, filename: string): void {
  const resolvedDirectory = resolve(directory);
  const resolvedFile = resolve(filename);
  if (
    !resolvedDirectory.startsWith(`${EVIDENCE_ROOT}${sep}`)
    || !resolvedFile.startsWith(`${resolvedDirectory}${sep}`)
  ) {
    throw new Error("Refusing to clean a database outside Task 3 evidence");
  }
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const target = `${resolvedFile}${suffix}`;
    if (existsSync(target)) rmSync(target);
  }
}

async function expectAuthError(work: Promise<unknown>, code: string) {
  const error = await work.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(BridgeAuthError);
  expect(error).toMatchObject({
    code,
    message: `Research bridge authentication failure: ${code}`,
    name: "BridgeAuthError",
  });
  return error as BridgeAuthError;
}

describe("D1 bridge nonce store behavioral contract", () => {
  it("accepts the first valid nonce claim", async () => {
    const db = createNonceDb();
    try {
      await expect(new D1BridgeNonceStore(db).claim(INPUT)).resolves.toBe(true);
    } finally {
      db.close();
    }
  });

  it("lets only one of concurrent service instances claim the same nonce", async () => {
    const db = createNonceDb();
    try {
      const first = new D1BridgeNonceStore(db);
      const second = new D1BridgeNonceStore(db);
      const results = await Promise.allSettled(Array.from(
        { length: 20 },
        (_, index) => (index % 2 === 0 ? first : second).claim(INPUT),
      ));

      expect(results.filter(
        (result) => result.status === "fulfilled" && result.value,
      )).toHaveLength(1);
      expect(results.filter(
        (result) => result.status === "fulfilled" && !result.value,
      )).toHaveLength(19);
      expect(rowCount(db)).toBe(1);
      await expect(new D1BridgeNonceStore(db).claim(INPUT)).resolves.toBe(false);
    } finally {
      db.close();
    }
  });

  it("rejects a replay through the complete signing and verification path", async () => {
    const db = createNonceDb();
    try {
      const context = requestContext();
      const body = encoder.encode('{"synthetic":true}');
      const keyBytes = new Uint8Array(32).fill(17);
      const headers = await signBridgeMessage({
        context,
        body,
        keyId: "synthetic-1",
        keyBytes,
        now: () => NOW,
      });
      const verify = () => verifyBridgeMessage({
        context,
        body,
        keyId: "synthetic-1",
        keyBytes,
        now: () => NOW,
        headers,
        nonces: new D1BridgeNonceStore(db),
      });

      await expect(verify()).resolves.toBeUndefined();
      await expectAuthError(verify(), "replay");
      expect(rowCount(db)).toBe(1);
    } finally {
      db.close();
    }
  });

  it("does not store a nonce for an altered signature", async () => {
    const db = createNonceDb();
    try {
      const context = requestContext();
      const body = encoder.encode('{"synthetic":true}');
      const keyBytes = new Uint8Array(32).fill(17);
      const headers = await signBridgeMessage({
        context,
        body,
        keyId: "synthetic-1",
        keyBytes,
        now: () => NOW,
      });
      const signature = headers.get("x-arc-bridge-signature")!;
      headers.set(
        "x-arc-bridge-signature",
        `${signature[0] === "0" ? "1" : "0"}${signature.slice(1)}`,
      );

      await expectAuthError(verifyBridgeMessage({
        context,
        body,
        keyId: "synthetic-1",
        keyBytes,
        now: () => NOW,
        headers,
        nonces: new D1BridgeNonceStore(db),
      }), "unauthorized");
      expect(rowCount(db)).toBe(0);
    } finally {
      db.close();
    }
  });

  it("retains a claim across close and reopen while keeping databases independent", async () => {
    mkdirSync(EVIDENCE_ROOT, { recursive: true });
    const directory = mkdtempSync(join(EVIDENCE_ROOT, "task3-nonce-db-"));
    const durableFile = join(directory, "durable.sqlite");
    const independentFile = join(directory, "independent.sqlite");
    let durable: SqliteD1 | undefined;
    let reopened: SqliteD1 | undefined;
    let independent: SqliteD1 | undefined;
    try {
      durable = createNonceDb(durableFile);
      await expect(new D1BridgeNonceStore(durable).claim(INPUT)).resolves.toBe(true);
      durable.close();
      durable = undefined;

      reopened = new SqliteD1(durableFile);
      await expect(new D1BridgeNonceStore(reopened).claim(INPUT)).resolves.toBe(false);

      independent = createNonceDb(independentFile);
      await expect(new D1BridgeNonceStore(independent).claim(INPUT)).resolves.toBe(true);
    } finally {
      durable?.close();
      reopened?.close();
      independent?.close();
      removeCreatedDatabase(directory, durableFile);
      removeCreatedDatabase(directory, independentFile);
      rmdirSync(directory);
    }
  });

  it("keeps scope and nonce identities independent", async () => {
    const db = createNonceDb();
    try {
      const store = new D1BridgeNonceStore(db);
      await expect(store.claim(INPUT)).resolves.toBe(true);
      await expect(store.claim({
        ...INPUT,
        scope: "executor-to-site:synthetic-1",
      })).resolves.toBe(true);
      await expect(store.claim({
        ...INPUT,
        scope: "site-to-executor:synthetic-2",
      })).resolves.toBe(true);
      await expect(store.claim({
        ...INPUT,
        nonce: "34".repeat(16),
      })).resolves.toBe(true);
      expect(rowCount(db)).toBe(4);
    } finally {
      db.close();
    }
  });

  it("copies claim values before caller mutation", async () => {
    const db = createNonceDb();
    try {
      const input = { ...INPUT };
      const mutateBeforeBind = {
        prepare(sql: string) {
          input.scope = "executor-to-site:mutated";
          input.nonce = "ab".repeat(16);
          input.now = 0;
          input.expiresAt = 1;
          return db.prepare(sql);
        },
      } as Pick<D1Database, "prepare">;

      await expect(new D1BridgeNonceStore(mutateBeforeBind).claim(input))
        .resolves.toBe(true);
      expect(db.database.prepare(`SELECT scope,nonce,expires_at,created_at
        FROM research_bridge_nonces`).get()).toEqual({
        scope: INPUT.scope,
        nonce: INPUT.nonce,
        expires_at: INPUT.expiresAt,
        created_at: INPUT.now,
      });
    } finally {
      db.close();
    }
  });

  it("retains a consumed nonce across expiry and a backward receiver clock", async () => {
    const db = createNonceDb();
    try {
      const store = new D1BridgeNonceStore(db);
      const original = {
        scope: "site-to-executor:retained",
        nonce: "67".repeat(16),
        now: 100,
        expiresAt: 101,
      };
      await expect(store.claim(original)).resolves.toBe(true);
      await expect(store.claim({
        ...original,
        now: 200,
        expiresAt: 201,
      })).resolves.toBe(false);
      await expect(store.claim({
        ...original,
        now: 0,
        expiresAt: 1,
      })).resolves.toBe(false);
      expect(db.database.prepare(`SELECT expires_at,created_at
        FROM research_bridge_nonces WHERE scope = ?1 AND nonce = ?2`)
        .get(original.scope, original.nonce)).toEqual({
        expires_at: original.expiresAt,
        created_at: original.now,
      });
    } finally {
      db.close();
    }
  });

  it("accepts the minimum and maximum valid retention boundaries", async () => {
    const db = createNonceDb();
    try {
      const store = new D1BridgeNonceStore(db);
      await expect(store.claim({
        scope: "site-to-executor:boundary-min",
        nonce: "00".repeat(16),
        now: 0,
        expiresAt: 1,
      })).resolves.toBe(true);
      await expect(store.claim({
        scope: "site-to-executor:boundary-max",
        nonce: "ff".repeat(16),
        now: Number.MAX_SAFE_INTEGER - 150_001,
        expiresAt: Number.MAX_SAFE_INTEGER,
      })).resolves.toBe(true);
      expect(rowCount(db)).toBe(2);
    } finally {
      db.close();
    }
  });

  it.each([
    ["invalid direction", { ...INPUT, scope: "other:synthetic-1" }],
    ["empty key id", { ...INPUT, scope: "site-to-executor:" }],
    ["oversized key id", { ...INPUT, scope: `site-to-executor:${"a".repeat(33)}` }],
    ["scope with trailing LF", { ...INPUT, scope: `${INPUT.scope}\n` }],
    ["scope with trailing CR", { ...INPUT, scope: `${INPUT.scope}\r` }],
    ["uppercase nonce", { ...INPUT, nonce: "AB".repeat(16) }],
    ["nonce with trailing LF", { ...INPUT, nonce: `${INPUT.nonce}\n` }],
    ["nonce with trailing CR", { ...INPUT, nonce: `${INPUT.nonce}\r` }],
    ["negative current time", { ...INPUT, now: -1 }],
    ["fractional current time", { ...INPUT, now: NOW + 0.5 }],
    ["unsafe current time", {
      ...INPUT,
      now: Number.MAX_SAFE_INTEGER - 150_000,
      expiresAt: Number.MAX_SAFE_INTEGER,
    }],
    ["unsafe expiry", { ...INPUT, expiresAt: Number.MAX_SAFE_INTEGER + 1 }],
    ["nonfuture expiry", { ...INPUT, expiresAt: NOW }],
    ["excessive retention", { ...INPUT, expiresAt: NOW + 150_002 }],
    ["extra key", { ...INPUT, extra: "rejected" }],
  ])("rejects invalid adapter input: %s", async (_label, value) => {
    const db = createNonceDb();
    try {
      await expectAuthError(
        new D1BridgeNonceStore(db).claim(value as typeof INPUT),
        "invalid-config",
      );
      expect(rowCount(db)).toBe(0);
    } finally {
      db.close();
    }
  });

  it("fails closed without leaking a database exception", async () => {
    const marker = "synthetic-private-database-detail";
    const db = {
      prepare() {
        throw new Error(marker);
      },
    } as unknown as Pick<D1Database, "prepare">;

    const error = await expectAuthError(
      new D1BridgeNonceStore(db).claim(INPUT),
      "unavailable",
    );
    expect(error.message).not.toContain(marker);
    expect(error.message).not.toContain("INSERT");
  });

  it.each([
    ["failed result", { success: false, meta: { changes: 1 } }],
    ["missing result status", { meta: { changes: 1 } }],
    ["missing mutation metadata", { success: true, meta: {} }],
    ["missing metadata", { success: true }],
    ["negative mutation count", { success: true, meta: { changes: -1 } }],
    ["oversized mutation count", { success: true, meta: { changes: 2 } }],
  ])("fails closed for abnormal D1 metadata: %s", async (_label, result) => {
    const db = {
      prepare: () => ({
        bind: () => ({ run: async () => result }),
      }),
    } as unknown as Pick<D1Database, "prepare">;

    await expectAuthError(
      new D1BridgeNonceStore(db).claim(INPUT),
      "unavailable",
    );
  });
});

describe("executor nonce migration behavioral contract", () => {
  it("enforces nonce shape inside SQL even if the adapter is bypassed", () => {
    const db = createNonceDb();
    try {
      expect(() => db.database.prepare(`INSERT INTO research_bridge_nonces
        (scope,nonce,expires_at,created_at) VALUES (?,?,?,?)`)
        .run(
          "site-to-executor:synthetic-1",
          "BAD",
          NOW + 120_001,
          NOW,
        )).toThrow();
    } finally {
      db.close();
    }
  });

  it.each([
    ["invalid direction", "other:synthetic-1", INPUT.nonce, INPUT.expiresAt, INPUT.now],
    ["empty key id", "site-to-executor:", INPUT.nonce, INPUT.expiresAt, INPUT.now],
    ["oversized key id", `site-to-executor:${"a".repeat(33)}`, INPUT.nonce, INPUT.expiresAt, INPUT.now],
    ["non-ASCII scope", "site-to-executor:é", INPUT.nonce, INPUT.expiresAt, INPUT.now],
    ["scope with trailing LF", `${INPUT.scope}\n`, INPUT.nonce, INPUT.expiresAt, INPUT.now],
    ["scope with trailing CR", `${INPUT.scope}\r`, INPUT.nonce, INPUT.expiresAt, INPUT.now],
    ["uppercase nonce", INPUT.scope, "AB".repeat(16), INPUT.expiresAt, INPUT.now],
    ["nonce with trailing LF", INPUT.scope, `${INPUT.nonce}\n`, INPUT.expiresAt, INPUT.now],
    ["nonce with trailing CR", INPUT.scope, `${INPUT.nonce}\r`, INPUT.expiresAt, INPUT.now],
    ["short nonce", INPUT.scope, "ab", INPUT.expiresAt, INPUT.now],
    ["negative creation", INPUT.scope, "01".repeat(16), 1, -1],
    ["fractional creation", INPUT.scope, "02".repeat(16), 1, 0.5],
    ["unsafe expiry", INPUT.scope, "03".repeat(16), Number.MAX_SAFE_INTEGER + 1, NOW],
    ["nonfuture expiry", INPUT.scope, "04".repeat(16), NOW, NOW],
    ["excessive retention", INPUT.scope, "05".repeat(16), NOW + 150_002, NOW],
  ])("rejects invalid SQL input: %s", (_label, scope, nonce, expiresAt, now) => {
    const db = createNonceDb();
    try {
      expect(() => db.database.prepare(`INSERT INTO research_bridge_nonces
        (scope,nonce,expires_at,created_at) VALUES (?1,?2,?3,?4)`)
        .run(scope, nonce, expiresAt, now)).toThrow();
      expect(rowCount(db)).toBe(0);
    } finally {
      db.close();
    }
  });

  it("keeps the generated Sites and executor migration bytes identical", async () => {
    const siteBytes = readFileSync(SITE_MIGRATION);
    const executorBytes = readFileSync(EXECUTOR_MIGRATION);
    expect(executorBytes).toEqual(siteBytes);
    expect(sha256(executorBytes)).toBe(sha256(siteBytes));

    const databases = [new SqliteD1(), new SqliteD1()];
    try {
      databases[0].database.exec(readMigration(SITE_MIGRATION));
      databases[1].database.exec(readMigration(EXECUTOR_MIGRATION));
      await expect(new D1BridgeNonceStore(databases[0]).claim(INPUT)).resolves.toBe(true);
      await expect(new D1BridgeNonceStore(databases[1]).claim(INPUT)).resolves.toBe(true);
    } finally {
      databases.forEach((db) => db.close());
    }
  });

  it("preserves all prior migration bytes and existing snapshot tables", () => {
    for (const file of PRIOR_MIGRATIONS) {
      const bytes = readFileSync(resolve(process.cwd(), "drizzle", file));
      expect(sha256(bytes), file).toBe(PRIOR_MIGRATION_HASHES[file]);
    }

    const priorSnapshot = JSON.parse(readFileSync(resolve(
      process.cwd(),
      "drizzle/meta/0006_snapshot.json",
    ), "utf8")) as { id: string; tables: Record<string, unknown> };
    const currentSnapshot = JSON.parse(readFileSync(resolve(
      process.cwd(),
      "drizzle/meta/0007_snapshot.json",
    ), "utf8")) as {
      prevId: string;
      tables: Record<string, unknown>;
    };
    const { research_bridge_nonces: nonceTable, ...existingTables } =
      currentSnapshot.tables;

    expect(currentSnapshot.prevId).toBe(priorSnapshot.id);
    expect(nonceTable).toBeDefined();
    expect(existingTables).toEqual(priorSnapshot.tables);
  });

  it("adds one nonce table and index without changing existing Sites data or foreign keys", () => {
    const db = new SqliteD1();
    try {
      db.database.exec("PRAGMA foreign_keys = ON");
      for (const file of PRIOR_MIGRATIONS) {
        db.database.exec(readMigration(resolve(process.cwd(), "drizzle", file)));
      }
      db.database.prepare(
        "INSERT INTO users (id,name,email,email_verified) VALUES (?1,?2,?3,0)",
      ).run("task3-user", "Task 3", "task3@example.test");

      db.database.exec(readMigration(SITE_MIGRATION));

      expect(db.database.prepare(
        "SELECT id,name,email FROM users WHERE id = ?1",
      ).get("task3-user")).toEqual({
        id: "task3-user",
        name: "Task 3",
        email: "task3@example.test",
      });
      expect(db.database.prepare("PRAGMA foreign_keys").get()).toEqual({
        foreign_keys: 1,
      });
      expect(() => db.database.prepare(`INSERT INTO sessions
        (id,expires_at,token,user_id) VALUES (?1,?2,?3,?4)`)
        .run("bad-session", NOW, "bad-token", "missing-user")).toThrow();
      expect(db.database.prepare(`SELECT type,name FROM sqlite_master
        WHERE name IN ('research_bridge_nonces','research_bridge_nonces_expiry_idx')
        ORDER BY type DESC`).all()).toEqual([
        { type: "table", name: "research_bridge_nonces" },
        { type: "index", name: "research_bridge_nonces_expiry_idx" },
      ]);
    } finally {
      db.close();
    }
  });

  it("includes migration 0007 in the standard research test database", () => {
    const db = createResearchD1();
    try {
      expect(db.database.prepare(`SELECT name FROM sqlite_master
        WHERE type = 'table' AND name = 'research_bridge_nonces'`).get())
        .toEqual({ name: "research_bridge_nonces" });
    } finally {
      db.close();
    }
  });
});
