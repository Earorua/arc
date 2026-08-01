import { describe, expect, it } from "vitest";
import { D1AccountLinkRepository } from "../../app/server/account-link/d1-repository";
import type { AccountLinkRepository } from "../../app/server/account-link/repository";

type IntentRow = {
  id: string;
  token_hash: string;
  user_id: string;
  source_provider: "google" | "github";
  target_provider: "google" | "github";
  status: "pending_reauth" | "verified" | "consumed" | "completed" | "failed" | "expired";
  expires_at: number;
  verified_at: number | null;
  consumed_at: number | null;
  completed_at: number | null;
  failure_code: string | null;
  created_at: number;
  updated_at: number;
};

type Call = { sql: string; values: unknown[] };
type RunResult = { success: true; meta: { changes: number } };

class FakeStatement {
  values: unknown[] = [];

  constructor(
    private readonly db: FakeD1,
    readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    this.db.calls.push({ sql: this.sql, values });
    return this;
  }

  async first<T>() {
    return await this.db.first(this.sql, this.values) as T | null;
  }

  async run() {
    return this.db.run(this.sql, this.values);
  }
}

class FakeD1 {
  readonly calls: Call[] = [];
  readonly runs: Call[] = [];
  readonly batches: Call[][] = [];
  private readonly rows = new Map<string, IntentRow & Record<string, unknown>>();
  private transitionInterleaving: ((row: IntentRow & Record<string, unknown>) => void) | null = null;
  private returnedTransitionRow: (IntentRow & Record<string, unknown>) | null = null;

  seed(row: IntentRow & Record<string, unknown>) {
    this.rows.set(row.id, { ...row });
  }

  row(id: string) {
    return this.rows.get(id);
  }

  afterNextTransition(callback: (row: IntentRow & Record<string, unknown>) => void) {
    this.transitionInterleaving = callback;
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  async batch(statements: FakeStatement[]) {
    this.batches.push(statements.map((statement) => ({
      sql: statement.sql,
      values: statement.values,
    })));
    const snapshot = [...this.rows.entries()].map(
      ([id, row]) => [id, clone(row)] as const,
    );
    const results: RunResult[] = [];
    try {
      for (const statement of statements) {
        results.push(await this.run(statement.sql, statement.values));
      }
      return results;
    } catch (error) {
      this.rows.clear();
      for (const [id, row] of snapshot) this.rows.set(id, row);
      throw error;
    }
  }

  async first(sql: string, values: unknown[]) {
    const normalized = normalize(sql);
    if (
      normalized.startsWith("UPDATE account_link_intents")
      && normalized.includes(" RETURNING ")
    ) {
      const result = await this.run(sql, values);
      return result.meta.changes === 1 ? clone(this.returnedTransitionRow) : null;
    }
    if (normalized.includes("WHERE user_id = ?1 AND token_hash = ?2")) {
      const [userId, tokenHash] = values as [string, string];
      return clone([...this.rows.values()].find(
        (row) => row.user_id === userId && row.token_hash === tokenHash,
      ) ?? null);
    }
    if (normalized.includes("WHERE id = ?1")) {
      return clone(this.rows.get(String(values[0])) ?? null);
    }
    throw new Error(`Unexpected first SQL: ${normalized}`);
  }

  async run(sql: string, values: unknown[]): Promise<RunResult> {
    this.runs.push({ sql, values });
    this.returnedTransitionRow = null;
    const normalized = normalize(sql);
    let changes = 0;

    if (normalized.startsWith("INSERT INTO account_link_intents")) {
      const [id, tokenHash, userId, sourceProvider, targetProvider, expiresAt, now] = values as [
        string,
        string,
        string,
        IntentRow["source_provider"],
        IntentRow["target_provider"],
        number,
        number,
      ];
      if (this.rows.has(id)) {
        throw new Error("UNIQUE constraint failed: account_link_intents.id");
      }
      if ([...this.rows.values()].some((row) => row.token_hash === tokenHash)) {
        throw new Error("UNIQUE constraint failed: account_link_intents.token_hash");
      }
      this.seed({
        id,
        token_hash: tokenHash,
        user_id: userId,
        source_provider: sourceProvider,
        target_provider: targetProvider,
        status: "pending_reauth",
        expires_at: expiresAt,
        verified_at: null,
        consumed_at: null,
        completed_at: null,
        failure_code: null,
        created_at: now,
        updated_at: now,
      });
      changes = 1;
    } else if (normalized.includes("failure_code = 'SUPERSEDED'")) {
      const [now, userId, targetProvider] = values as [number, string, string];
      for (const row of this.rows.values()) {
        if (
          row.user_id === userId
          && row.target_provider === targetProvider
          && (row.status === "pending_reauth" || row.status === "verified")
        ) {
          row.status = "failed";
          row.failure_code = "SUPERSEDED";
          row.updated_at = now;
          changes += 1;
        }
      }
    } else if (normalized.includes("SET status = 'expired'")) {
      const [now, userId, tokenHash] = values as [number, string, string];
      for (const row of this.rows.values()) {
        if (
          row.user_id === userId
          && row.token_hash === tokenHash
          && (row.status === "pending_reauth" || row.status === "verified")
          && row.expires_at <= now
        ) {
          row.status = "expired";
          row.updated_at = now;
          changes += 1;
        }
      }
    } else if (normalized.includes("SET status = 'verified'")) {
      const [now, expiresAt, id, userId] = values as [number, number, string, string];
      const row = this.rows.get(id);
      if (
        row?.user_id === userId
        && row.status === "pending_reauth"
        && row.expires_at > now
      ) {
        row.status = "verified";
        row.verified_at = now;
        row.expires_at = expiresAt;
        row.updated_at = now;
        changes = 1;
        this.returnedTransitionRow = clone(row);
        this.runTransitionInterleaving(row);
      }
    } else if (normalized.includes("SET status = 'consumed'")) {
      const [now, id, userId] = values as [number, string, string];
      const row = this.rows.get(id);
      if (row?.user_id === userId && row.status === "verified" && row.expires_at > now) {
        row.status = "consumed";
        row.consumed_at = now;
        row.updated_at = now;
        changes = 1;
        this.returnedTransitionRow = clone(row);
        this.runTransitionInterleaving(row);
      }
    } else if (normalized.includes("SET status = 'completed'")) {
      const [now, id, userId] = values as [number, string, string];
      const row = this.rows.get(id);
      if (row?.user_id === userId && row.status === "consumed") {
        row.status = "completed";
        row.completed_at = now;
        row.updated_at = now;
        changes = 1;
      }
    } else if (normalized.includes("SET status = 'failed'")) {
      const [code, now, id, userId] = values as [string, number, string, string];
      const row = this.rows.get(id);
      const isUnexpiredGrant = row?.expires_at !== undefined && row.expires_at > now;
      if (
        row?.user_id === userId
        && (
          row.status === "consumed"
          || (isUnexpiredGrant && (row.status === "pending_reauth" || row.status === "verified"))
        )
      ) {
        row.status = "failed";
        row.failure_code = code;
        row.updated_at = now;
        changes = 1;
      }
    } else if (normalized.includes("SET updated_at = CASE")) {
      const [claimTime, id, userId, provider, issuedAt] = values as [
        number,
        string,
        string,
        string,
        number,
      ];
      const row = this.rows.get(id);
      const isReauth = normalized.includes("source_provider = ?4");
      const expectedProvider = isReauth ? row?.source_provider : row?.target_provider;
      const expectedStatus = isReauth ? "pending_reauth" : "consumed";
      if (
        row?.user_id === userId
        && expectedProvider === provider
        && row.status === expectedStatus
        && row.updated_at === issuedAt
        && (!isReauth || row.expires_at > claimTime)
      ) {
        row.updated_at = Math.max(claimTime, row.updated_at + 1);
        changes = 1;
      }
    } else {
      throw new Error(`Unexpected run SQL: ${normalized}`);
    }

    return { success: true, meta: { changes } };
  }

  private runTransitionInterleaving(row: IntentRow & Record<string, unknown>) {
    const callback = this.transitionInterleaving;
    this.transitionInterleaving = null;
    callback?.(row);
  }
}

function normalize(sql: string) {
  return sql.replace(/\s+/gu, " ").trim();
}

function clone<T>(value: T): T {
  return value === null ? value : structuredClone(value);
}

const baseTime = Date.UTC(2026, 7, 1, 12, 0, 0);

function intentRow(overrides: Partial<IntentRow> = {}): IntentRow {
  return {
    id: "intent-1",
    token_hash: "sha256:credential-1",
    user_id: "user-1",
    source_provider: "github",
    target_provider: "google",
    status: "pending_reauth",
    expires_at: baseTime + 10 * 60_000,
    verified_at: null,
    consumed_at: null,
    completed_at: null,
    failure_code: null,
    created_at: baseTime,
    updated_at: baseTime,
    ...overrides,
  };
}

function repository(db: FakeD1) {
  return new D1AccountLinkRepository(db as unknown as D1Database);
}

describe("D1AccountLinkRepository", () => {
  it("creates in one batch while superseding only older active intents for the owner-target pair", async () => {
    const db = new FakeD1();
    db.seed(intentRow({ id: "pending-old", token_hash: "hash-pending" }));
    db.seed(intentRow({
      id: "verified-old",
      token_hash: "hash-verified",
      status: "verified",
      verified_at: baseTime + 1,
    }));
    db.seed(intentRow({ id: "consumed-old", token_hash: "hash-consumed", status: "consumed" }));
    db.seed(intentRow({
      id: "other-target",
      token_hash: "hash-other-target",
      target_provider: "github",
      source_provider: "google",
    }));
    db.seed(intentRow({ id: "other-user", token_hash: "hash-other-user", user_id: "user-2" }));
    const rawCredential = "raw-browser-credential-must-never-reach-d1";
    const createInput: Parameters<AccountLinkRepository["create"]>[0] = {
      id: "intent-new",
      tokenHash: "sha256:new-credential",
      userId: "user-1",
      sourceProvider: "github",
      targetProvider: "google",
      expiresAt: new Date(baseTime + 20 * 60_000),
      now: new Date(baseTime + 10_000),
    };
    const runtimeInput = {
      ...createInput,
      rawCredential,
    } as typeof createInput & { rawCredential: string };

    expect(runtimeInput.rawCredential).toBe(rawCredential);
    const created = await repository(db).create(runtimeInput);

    expect(db.batches).toHaveLength(1);
    expect(db.batches[0]).toHaveLength(2);
    expect(normalize(db.batches[0][0].sql)).toContain(
      "WHERE user_id = ?2 AND target_provider = ?3 AND status IN ('pending_reauth', 'verified')",
    );
    expect(db.row("pending-old")).toMatchObject({ status: "failed", failure_code: "SUPERSEDED" });
    expect(db.row("verified-old")).toMatchObject({ status: "failed", failure_code: "SUPERSEDED" });
    expect(db.row("consumed-old")?.status).toBe("consumed");
    expect(db.row("other-target")?.status).toBe("pending_reauth");
    expect(db.row("other-user")?.status).toBe("pending_reauth");
    expect(created).toEqual({
      id: "intent-new",
      tokenHash: "sha256:new-credential",
      userId: "user-1",
      sourceProvider: "github",
      targetProvider: "google",
      status: "pending_reauth",
      expiresAt: new Date(baseTime + 20 * 60_000),
      verifiedAt: null,
      consumedAt: null,
      completedAt: null,
      failureCode: null,
      createdAt: new Date(baseTime + 10_000),
      updatedAt: new Date(baseTime + 10_000),
    });
    const recordedBatchValues = db.batches[0].flatMap((call) => call.values);
    expect(recordedBatchValues).not.toContain(rawCredential);
    expect(JSON.stringify(recordedBatchValues)).not.toContain(rawCredential);
    expect(db.batches[0][1].values).toContain("sha256:new-credential");
  });

  it("rolls back supersession when the batched insert violates a unique constraint", async () => {
    const db = new FakeD1();
    db.seed(intentRow());

    await expect(repository(db).create({
      id: "intent-1",
      tokenHash: "sha256:new-credential",
      userId: "user-1",
      sourceProvider: "github",
      targetProvider: "google",
      expiresAt: new Date(baseTime + 20 * 60_000),
      now: new Date(baseTime + 10_000),
    })).rejects.toThrow(/unique constraint/iu);

    expect(db.row("intent-1")).toMatchObject({
      status: "pending_reauth",
      failure_code: null,
      updated_at: baseTime,
    });
  });

  it("expires active rows before credential lookup and scopes both statements by owner and hash", async () => {
    const db = new FakeD1();
    db.seed(intentRow({ status: "verified", verified_at: baseTime - 60_000, expires_at: baseTime }));
    const repo = repository(db);

    await expect(repo.findByCredential(
      "wrong-user",
      "sha256:credential-1",
      new Date(baseTime),
    )).resolves.toBeNull();
    expect(db.row("intent-1")?.status).toBe("verified");

    await expect(repo.findByCredential(
      "user-1",
      "sha256:credential-1",
      new Date(baseTime),
    )).resolves.toMatchObject({ status: "expired", failureCode: null });
    expect(db.row("intent-1")?.status).toBe("expired");
    for (const call of db.calls) {
      expect(normalize(call.sql)).toContain("user_id");
      expect(normalize(call.sql)).toContain("token_hash");
      expect(call.values).toEqual(expect.arrayContaining(["sha256:credential-1"]));
    }
  });

  it("finds by ID and strictly maps nullable snake-case row fields", async () => {
    const db = new FakeD1();
    db.seed(intentRow({
      status: "consumed",
      expires_at: baseTime + 300_000,
      verified_at: baseTime + 1_000,
      consumed_at: baseTime + 2_000,
      completed_at: null,
      failure_code: null,
    }));

    await expect(repository(db).findById("intent-1")).resolves.toEqual({
      id: "intent-1",
      tokenHash: "sha256:credential-1",
      userId: "user-1",
      sourceProvider: "github",
      targetProvider: "google",
      status: "consumed",
      expiresAt: new Date(baseTime + 300_000),
      verifiedAt: new Date(baseTime + 1_000),
      consumedAt: new Date(baseTime + 2_000),
      completedAt: null,
      failureCode: null,
      createdAt: new Date(baseTime),
      updatedAt: new Date(baseTime),
    });
    expect(db.calls[0].values).toEqual(["intent-1"]);
  });

  it("rejects database rows with unexpected fields instead of loosely mapping them", async () => {
    const db = new FakeD1();
    db.seed({ ...intentRow(), unexpected_secret: "must-not-be-accepted" });

    await expect(repository(db).findById("intent-1")).rejects.toThrow();
  });

  it("marks verified only from an owned, non-expired pending_reauth row", async () => {
    const db = new FakeD1();
    db.seed(intentRow());
    db.seed(intentRow({ id: "expired-pending", token_hash: "expired-hash", expires_at: baseTime }));
    const repo = repository(db);

    await expect(repo.markVerified(
      "intent-1",
      "user-1",
      new Date(baseTime + 1_000),
      new Date(baseTime + 301_000),
    )).resolves.toMatchObject({
      status: "verified",
      verifiedAt: new Date(baseTime + 1_000),
      expiresAt: new Date(baseTime + 301_000),
    });
    await expect(repo.markVerified(
      "intent-1",
      "user-1",
      new Date(baseTime + 2_000),
      new Date(baseTime + 302_000),
    )).resolves.toBeNull();
    await expect(repo.markVerified(
      "expired-pending",
      "user-1",
      new Date(baseTime),
      new Date(baseTime + 300_000),
    )).resolves.toBeNull();
    expect(normalize(db.runs[0].sql)).toContain(
      "WHERE id = ?3 AND user_id = ?4 AND status = 'pending_reauth' AND expires_at > ?1",
    );
  });

  it("returns the row changed by markVerified without a racy follow-up read", async () => {
    const db = new FakeD1();
    db.seed(intentRow());
    db.afterNextTransition((row) => {
      row.status = "failed";
      row.failure_code = "INTERLEAVED";
      row.updated_at = baseTime + 2_000;
    });

    await expect(repository(db).markVerified(
      "intent-1",
      "user-1",
      new Date(baseTime + 1_000),
      new Date(baseTime + 301_000),
    )).resolves.toMatchObject({
      status: "verified",
      verifiedAt: new Date(baseTime + 1_000),
      failureCode: null,
    });
    expect(db.row("intent-1")?.status).toBe("failed");
    expect(db.calls.some((call) => normalize(call.sql).startsWith("SELECT"))).toBe(false);
  });

  it("consumes an owned, non-expired verified intent once and rejects replay", async () => {
    const db = new FakeD1();
    db.seed(intentRow({
      status: "verified",
      verified_at: baseTime,
      expires_at: baseTime + 300_000,
    }));
    const repo = repository(db);

    await expect(repo.consume("intent-1", "user-1", new Date(baseTime + 1_000))).resolves.toMatchObject({
      status: "consumed",
      consumedAt: new Date(baseTime + 1_000),
    });
    await expect(repo.consume("intent-1", "user-1", new Date(baseTime + 1_000))).resolves.toBeNull();
    expect(normalize(db.runs[0].sql)).toContain(
      "WHERE id = ?2 AND user_id = ?3 AND status = 'verified' AND expires_at > ?1",
    );
  });

  it("returns the row changed by consume without a racy follow-up read", async () => {
    const db = new FakeD1();
    db.seed(intentRow({
      status: "verified",
      verified_at: baseTime,
      expires_at: baseTime + 300_000,
    }));
    db.afterNextTransition((row) => {
      row.status = "failed";
      row.failure_code = "INTERLEAVED";
      row.updated_at = baseTime + 2_000;
    });

    await expect(repository(db).consume(
      "intent-1",
      "user-1",
      new Date(baseTime + 1_000),
    )).resolves.toMatchObject({
      status: "consumed",
      consumedAt: new Date(baseTime + 1_000),
      failureCode: null,
    });
    expect(db.row("intent-1")?.status).toBe("failed");
    expect(db.calls.some((call) => normalize(call.sql).startsWith("SELECT"))).toBe(false);
  });

  it("does not consume at the expiry boundary or for a different owner", async () => {
    const db = new FakeD1();
    db.seed(intentRow({ status: "verified", verified_at: baseTime - 1, expires_at: baseTime }));
    const repo = repository(db);

    await expect(repo.consume("intent-1", "user-1", new Date(baseTime))).resolves.toBeNull();
    await expect(repo.consume("intent-1", "user-2", new Date(baseTime - 1))).resolves.toBeNull();
    expect(db.row("intent-1")?.status).toBe("verified");
  });

  it.each([
    ["reauth", "pending_reauth", "github"],
    ["target", "consumed", "google"],
  ] as const)("durably claims one %s internal proof with an updated_at CAS", async (
    phase,
    status,
    provider,
  ) => {
    const db = new FakeD1();
    db.seed(intentRow({ status, updated_at: baseTime }));
    const repo = repository(db);
    const claim = {
      intentId: "intent-1",
      userId: "user-1",
      provider,
      phase,
      issuedAt: new Date(baseTime),
      now: new Date(baseTime),
    } as const;

    const results = await Promise.all([
      repo.claimInternalProof(claim),
      repo.claimInternalProof(claim),
    ]);

    expect(results.sort()).toEqual([false, true]);
    expect(db.row("intent-1")?.updated_at).toBe(baseTime + 1);
    expect(normalize(db.runs[0].sql)).toContain("updated_at = ?5");
  });

  it("rejects proof claims with mismatched owner, provider, phase, issuance, or expiry", async () => {
    const cases: Array<Partial<Parameters<AccountLinkRepository["claimInternalProof"]>[0]>> = [
      { userId: "other-user" },
      { provider: "google" },
      { phase: "target" as const },
      { issuedAt: new Date(baseTime - 1) },
      { now: new Date(baseTime + 10 * 60_000) },
    ];

    for (const overrides of cases) {
      const db = new FakeD1();
      db.seed(intentRow());
      await expect(repository(db).claimInternalProof({
        intentId: "intent-1",
        userId: "user-1",
        provider: "github",
        phase: "reauth",
        issuedAt: new Date(baseTime),
        now: new Date(baseTime),
        ...overrides,
      })).resolves.toBe(false);
      expect(db.row("intent-1")?.updated_at).toBe(baseTime);
    }
  });

  it("completes only a consumed intent and cannot complete it twice", async () => {
    const db = new FakeD1();
    db.seed(intentRow({ status: "consumed", consumed_at: baseTime + 1_000 }));
    db.seed(intentRow({ id: "verified", token_hash: "hash-verified", status: "verified" }));
    const repo = repository(db);

    await expect(repo.complete("verified", "user-1", new Date(baseTime + 2_000))).resolves.toBe(false);
    await expect(repo.complete("intent-1", "user-1", new Date(baseTime + 2_000))).resolves.toBe(true);
    await expect(repo.complete("intent-1", "user-1", new Date(baseTime + 3_000))).resolves.toBe(false);
    expect(db.row("intent-1")).toMatchObject({
      status: "completed",
      completed_at: baseTime + 2_000,
    });
  });

  it.each(["pending_reauth", "verified", "consumed"] as const)(
    "fails active %s intents with a sanitized code",
    async (status) => {
      const db = new FakeD1();
      db.seed(intentRow({ status }));

      await expect(repository(db).fail(
        "intent-1",
        "user-1",
        "OAUTH_FAILED_2",
        new Date(baseTime + 1_000),
      )).resolves.toBe(true);
      expect(db.row("intent-1")).toMatchObject({
        status: "failed",
        failure_code: "OAUTH_FAILED_2",
      });
    },
  );

  it("rejects invalid failure codes and cannot revive or rewrite terminal rows", async () => {
    const invalidCodes = ["", "lowercase", "2STARTS_WITH_DIGIT", "HAS-HYPHEN", `A${"B".repeat(64)}`];
    for (const code of invalidCodes) {
      const db = new FakeD1();
      db.seed(intentRow());
      await expect(repository(db).fail(
        "intent-1",
        "user-1",
        code,
        new Date(baseTime + 1_000),
      )).rejects.toThrow(/failure code/iu);
      expect(db.runs).toHaveLength(0);
    }

    for (const status of ["completed", "failed", "expired"] as const) {
      const db = new FakeD1();
      db.seed(intentRow({ status }));
      const repo = repository(db);
      await expect(repo.markVerified(
        "intent-1",
        "user-1",
        new Date(baseTime + 1_000),
        new Date(baseTime + 301_000),
      )).resolves.toBeNull();
      await expect(repo.consume("intent-1", "user-1", new Date(baseTime + 1_000))).resolves.toBeNull();
      await expect(repo.complete("intent-1", "user-1", new Date(baseTime + 1_000))).resolves.toBe(false);
      await expect(repo.fail(
        "intent-1",
        "user-1",
        "OAUTH_FAILED",
        new Date(baseTime + 1_000),
      )).resolves.toBe(false);
      expect(db.row("intent-1")?.status).toBe(status);
    }
  });

  it("does not fail expired grants or mutate intents owned by another user", async () => {
    const db = new FakeD1();
    db.seed(intentRow({ expires_at: baseTime }));
    const repo = repository(db);

    await expect(repo.fail(
      "intent-1",
      "user-1",
      "OAUTH_FAILED",
      new Date(baseTime),
    )).resolves.toBe(false);
    await expect(repo.fail(
      "intent-1",
      "user-2",
      "OAUTH_FAILED",
      new Date(baseTime - 1),
    )).resolves.toBe(false);
    expect(db.row("intent-1")?.status).toBe("pending_reauth");
  });
});
