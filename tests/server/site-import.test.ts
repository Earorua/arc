// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { D1SiteImportPublication } from "../../app/server/research/d1-site-import-publication";
import { SiteImportCoordinator, type SiteImportCoordinatorDependencies } from "../../app/server/research/site-import";
import { summarizeBridgeProviderReceipt } from "../../app/server/research/executor/receipt";
import { createSiteImportFixture, validReceipt } from "../helpers/site-import-fixture";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { SqliteD1 } from "../helpers/sqlite-d1";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { D1SiteExecutionRepository } from "../../app/server/research/d1-site-execution-repository";
import { D1SiteImportRepository } from "../../app/server/research/d1-site-import-repository";
import { D1AiRunSink } from "../../app/server/ai/d1-run-recorder";
import { D1EntitlementRepository } from "../../app/server/entitlements/d1-entitlement-repository";
import { D1ResearchBudgetRepository } from "../../app/server/research/d1-budget-repository";
import { ResearchBudgetError } from "../../app/server/research/budget";

const open: Array<Awaited<ReturnType<typeof createSiteImportFixture>>> = [];
afterEach(() => { for (const value of open.splice(0)) value.db.close(); });
type Fixture = Awaited<ReturnType<typeof createSiteImportFixture>>;
type CoordinatorOverrides = { -readonly [Key in keyof SiteImportCoordinatorDependencies]?:
  SiteImportCoordinatorDependencies[Key] };

function dependencies(f: Fixture): SiteImportCoordinatorDependencies {
  return {
    imports: f.imports,
    publication: new D1SiteImportPublication(f.db as unknown as D1Database, f.research, f.executions),
    research: f.research,
    audits: f.audits,
    entitlements: f.quota,
    budget: f.budget,
  };
}

function coordinator(f: Fixture, overrides: CoordinatorOverrides = {}) {
  return new SiteImportCoordinator({ ...dependencies(f), ...overrides });
}

function importCapabilities(
  f: Fixture,
  overrides: Partial<SiteImportCoordinatorDependencies["imports"]> = {},
): SiteImportCoordinatorDependencies["imports"] {
  return {
    read: f.imports.read.bind(f.imports),
    readStrictImportContext: f.imports.readStrictImportContext.bind(f.imports),
    captureBody: f.imports.captureBody.bind(f.imports),
    captureMetadata: f.imports.captureMetadata.bind(f.imports),
    markAudit: f.imports.markAudit.bind(f.imports),
    markQuota: f.imports.markQuota.bind(f.imports),
    markBudget: f.imports.markBudget.bind(f.imports),
    finish: f.imports.finish.bind(f.imports),
    ...overrides,
  };
}

async function fixture() {
  const value = await createSiteImportFixture(); open.push(value); return value;
}

function count(f: Fixture, table: string, where = "") {
  return (f.db.database.prepare(`SELECT count(*) AS n FROM ${table} ${where}`).get() as { n: number }).n;
}

async function prepareKnownHoldPhaseThree(f: Fixture) {
  const receipt = validReceipt(f.execution, 6_000_000);
  const captured = await f.imports.captureBody(f.identity, receipt);
  await f.audits.record(captured.audit);
  await f.imports.markAudit(f.identity, captured.metadata.receiptHash);
  await f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!, { kind: "unknown" });
  f.setSqlNow(f.execution.executionExpiresAt! + 1);
  f.setAppNow(f.execution.executionExpiresAt! + 1);
  const publication = new D1SiteImportPublication(f.db as unknown as D1Database, f.research, f.executions);
  const published = await publication.resolve(f.identity, captured.metadata.receiptHash);
  await f.quota.finalize(f.execution.quotaReservationId!, published.resolution!.quotaStatus, 0);
  await f.imports.markQuota(f.identity, captured.metadata.receiptHash);
  return { receipt, publication };
}

describe("SiteImportCoordinator", () => {
  it("completes a valid real receipt once and exactly replays the terminal result", async () => {
    const f = await fixture();
    const receipt = validReceipt(f.execution);
    const service = coordinator(f);
    const before = f.db.database.prepare("SELECT id,reserved_micros,settled_micros FROM ai_budget_buckets ORDER BY id")
      .all() as Array<{ id: string; reserved_micros: number; settled_micros: number }>;

    const result = await service.complete(f.identity, receipt);

    expect(result).toMatchObject({ run: { state: "ready" }, accounting: "settled" });
    expect(await f.imports.read(f.identity)).toMatchObject({ phase: 5, decision: null });
    expect(await coordinator(f).complete(f.identity, receipt)).toEqual(result);
    expect({
      packages: (f.db.database.prepare("SELECT count(*) AS n FROM research_packages").get() as { n: number }).n,
      audits: (f.db.database.prepare("SELECT count(*) AS n FROM ai_runs WHERE purpose='role-research'").get() as { n: number }).n,
      quotaTerminal: (f.db.database.prepare("SELECT count(*) AS n FROM quota_ledger WHERE entry_kind<>'reserved'").get() as { n: number }).n,
    }).toEqual({ packages: 1, audits: 1, quotaTerminal: 1 });
    const after = f.db.database.prepare("SELECT id,reserved_micros,settled_micros FROM ai_budget_buckets ORDER BY id")
      .all() as Array<{ id: string; reserved_micros: number; settled_micros: number }>;
    expect(after).toEqual(before.map((bucket) => ({ ...bucket,
      reserved_micros: bucket.reserved_micros - f.execution.policy.maximumMicros,
      settled_micros: bucket.settled_micros + 100_000 })));
  });

  it("coalesces concurrent body and owner-style metadata completion for one receipt", async () => {
    const f = await fixture();
    const receipt = validReceipt(f.execution);
    const metadata = await summarizeBridgeProviderReceipt(receipt);
    let release!: () => void;
    const bodyCaptured = new Promise<void>((resolve) => { release = resolve; });
    const imports = importCapabilities(f, {
      captureBody: async (...args: Parameters<typeof f.imports.captureBody>) => {
        const saved = await f.imports.captureBody(...args); release(); return saved;
      },
      captureMetadata: async (...args: Parameters<typeof f.imports.captureMetadata>) => {
        await bodyCaptured; return f.imports.captureMetadata(...args);
      },
    });
    const service = coordinator(f, { imports });

    const [callback, ownerGet] = await Promise.all([
      service.complete(f.identity, receipt),
      service.reconcileMetadata(f.identity, metadata),
    ]);

    expect(ownerGet).toEqual(callback);
    expect((await f.imports.read(f.identity))?.phase).toBe(5);
    expect(count(f, "ai_runs", "WHERE purpose='role-research'")).toBe(1);
    expect(count(f, "quota_ledger", "WHERE entry_kind<>'reserved'")).toBe(1);
  });

  it.each([
    ["zero", 0, "settled"],
    ["known", 100_000, "settled"],
    ["above-reserve", 6_000_000, "settled"],
  ] as const)("settles %s actual cost exactly", async (_name, costMicros, accounting) => {
    const f = await fixture();
    const result = await coordinator(f).complete(f.identity, validReceipt(f.execution, costMicros));
    const reservation = await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!);
    expect(result.accounting).toBe(accounting);
    expect(reservation).toMatchObject({ status: "settled", settledMicros: costMicros });
  });

  it("releases not-charged errors and holds immutable unknown cost", async () => {
    const released = await fixture();
    expect((await coordinator(released).complete(released.identity, released.receipt)).accounting).toBe("released");
    const unknown = await fixture();
    const receipt = validReceipt(unknown.execution);
    const unknownReceipt = { ...receipt, outcome: { ...receipt.outcome, usage: null } };
    expect((await coordinator(unknown).complete(unknown.identity, unknownReceipt)).accounting).toBe("held");
    await expect(coordinator(unknown).complete(unknown.identity, validReceipt(unknown.execution, 10)))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("snapshots identity and receipt before awaiting capture and never invokes accessors", async () => {
    const f = await fixture();
    const receipt = validReceipt(f.execution);
    const identity = { ...f.identity };
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const waiting = new Promise<void>((resolve) => { entered = resolve; });
    const imports = importCapabilities(f, {
      captureBody: async (...args: Parameters<typeof f.imports.captureBody>) => {
        entered(); await gate; return f.imports.captureBody(...args);
      },
    });
    const pending = coordinator(f, { imports }).complete(identity, receipt);
    await waiting;
    identity.ownerId = "owner-b";
    receipt.outcome.usage.costMicros = 999_999;
    release();
    expect(await pending).toMatchObject({ run: { ownerId: "owner-a" }, accounting: "settled" });
    expect((await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!))?.settledMicros)
      .toBe(100_000);

    let touched = false;
    const unsafe = Object.defineProperty({ ...receipt }, "outcome", {
      enumerable: true, get: () => { touched = true; return receipt.outcome; },
    });
    await expect(coordinator(f).complete(f.identity, unsafe)).rejects.toBeDefined();
    expect(touched).toBe(false);
  });

  it("keeps response metadata read-only before expiry and settles it without a package after expiry", async () => {
    const f = await fixture();
    const receipt = validReceipt(f.execution);
    const metadata = await summarizeBridgeProviderReceipt(receipt);
    await expect(coordinator(f).reconcileMetadata(f.identity, metadata))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(await f.imports.read(f.identity)).toBeNull();
    f.setSqlNow(f.execution.executionExpiresAt! + 1);
    f.setAppNow(f.execution.executionExpiresAt! + 1);
    const result = await coordinator(f).reconcileMetadata(f.identity, metadata);
    expect(result).toMatchObject({ run: { state: "failed" }, accounting: "settled" });
    expect(count(f, "research_packages")).toBe(0);
  });

  it("lets same-hash metadata finish an existing body journal and rejects altered metadata", async () => {
    const f = await fixture();
    const receipt = validReceipt(f.execution);
    const metadata = await summarizeBridgeProviderReceipt(receipt);
    await f.imports.captureBody(f.identity, receipt);
    const result = await coordinator(f).reconcileMetadata(f.identity, metadata);
    expect(result.run.state).toBe("ready");
    await expect(coordinator(f).reconcileMetadata(f.identity, { ...metadata, latencyMs: metadata.latencyMs + 1 }))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("accepts matching error metadata and rejects altered metadata under the same hash", async () => {
    const f = await fixture();
    const metadata = await f.metadata();
    const result = await coordinator(f).reconcileMetadata(f.identity, metadata);
    expect(result).toMatchObject({ run: { state: "failed" }, accounting: "released" });
    await expect(coordinator(f).reconcileMetadata(f.identity, {
      ...metadata,
      outcome: { ...metadata.outcome, code: "rate" },
    })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(coordinator(f).reconcileMetadata(f.identity, {
      ...metadata,
      receiptHash: "f".repeat(64),
    })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("settles a late known cost from the original hold and buckets after midnight", async () => {
    const f = await fixture();
    const receipt = validReceipt(f.execution, 6_000_000);
    const captured = await f.imports.captureBody(f.identity, receipt);
    const held = await f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!, { kind: "unknown" });
    const originalBuckets = await Promise.all([
      f.budget.readBucket(held.dayBucketId), f.budget.readBucket(held.monthBucketId),
    ]);
    const afterMidnight = Date.parse("2026-09-16T12:00:00.000Z");
    f.setAppNow(afterMidnight); f.setSqlNow(afterMidnight);

    const result = await coordinator(f).complete(f.identity, receipt);

    expect(result).toMatchObject({ run: { state: "failed" }, accounting: "settled" });
    const journal = await f.imports.read(f.identity);
    expect(journal?.audit).toMatchObject({ latencyMs: captured.audit.latencyMs, usage: captured.audit.usage });
    const settled = await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!);
    expect(settled).toMatchObject({ id: held.id, dayBucketId: held.dayBucketId,
      monthBucketId: held.monthBucketId, createdAt: held.createdAt,
      status: "settled", settledMicros: 6_000_000 });
    const finalBuckets = await Promise.all([
      f.budget.readBucket(held.dayBucketId), f.budget.readBucket(held.monthBucketId),
    ]);
    expect(finalBuckets.map((bucket) => bucket?.periodStart))
      .toEqual(originalBuckets.map((bucket) => bucket?.periodStart));
    expect(finalBuckets).toEqual(originalBuckets.map((bucket) => ({ ...bucket,
      reservedMicros: bucket!.reservedMicros - held.maximumMicros,
      settledMicros: bucket!.settledMicros + 6_000_000,
      version: bucket!.version + 1,
      updatedAt: afterMidnight })));
    expect(count(f, "research_packages")).toBe(0);
  });

  it("rereads a mixed original hold and freshly settled bucket observation without retrying mutation", async () => {
    const f = await fixture();
    const { receipt, publication } = await prepareKnownHoldPhaseThree(f);
    let reservationReads = 0;
    let settlementAttempts = 0;
    const budget = {
      readReservation: async (...args: Parameters<typeof f.budget.readReservation>) => {
        const observed = await f.budget.readReservation(...args);
        reservationReads += 1;
        if (reservationReads === 1) {
          expect((await coordinator(f).complete(f.identity, receipt)).accounting).toBe("settled");
        }
        return observed;
      },
      readBucket: f.budget.readBucket.bind(f.budget),
      settle: async (...args: Parameters<typeof f.budget.settle>) => {
        settlementAttempts += 1;
        return f.budget.settle(...args);
      },
    };

    const result = await coordinator(f, { publication, budget }).complete(f.identity, receipt);

    expect(result.accounting).toBe("settled");
    expect(settlementAttempts).toBe(0);
    expect(reservationReads).toBeGreaterThanOrEqual(2);
    expect((await f.imports.read(f.identity))?.phase).toBe(5);
  });

  it("fails a persistently corrupt budget observation after exactly one complete reread", async () => {
    const f = await fixture();
    const { receipt, publication } = await prepareKnownHoldPhaseThree(f);
    const reservation = await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!);
    f.db.database.prepare("UPDATE ai_budget_buckets SET reserved_micros=0 WHERE id=?1")
      .run(reservation!.dayBucketId);
    let reservationReads = 0;
    let bucketReads = 0;
    let settlementAttempts = 0;
    const budget = {
      readReservation: async (...args: Parameters<typeof f.budget.readReservation>) => {
        reservationReads += 1; return f.budget.readReservation(...args);
      },
      readBucket: async (...args: Parameters<typeof f.budget.readBucket>) => {
        bucketReads += 1; return f.budget.readBucket(...args);
      },
      settle: async (...args: Parameters<typeof f.budget.settle>) => {
        settlementAttempts += 1; return f.budget.settle(...args);
      },
    };

    await expect(coordinator(f, { publication, budget }).complete(f.identity, receipt))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect({ reservationReads, bucketReads, settlementAttempts })
      .toEqual({ reservationReads: 2, bucketReads: 4, settlementAttempts: 0 });
    expect((await f.imports.read(f.identity))?.phase).toBe(3);
  });

  it("does not reread or mutate after a budget observation conflict", async () => {
    const f = await fixture();
    const { receipt, publication } = await prepareKnownHoldPhaseThree(f);
    let reservationReads = 0;
    let bucketReads = 0;
    let settlementAttempts = 0;
    const budget = {
      readReservation: async () => {
        reservationReads += 1; throw new ResearchBudgetError("CONFLICT");
      },
      readBucket: async (...args: Parameters<typeof f.budget.readBucket>) => {
        bucketReads += 1; return f.budget.readBucket(...args);
      },
      settle: async (...args: Parameters<typeof f.budget.settle>) => {
        settlementAttempts += 1; return f.budget.settle(...args);
      },
    };

    await expect(coordinator(f, { publication, budget }).complete(f.identity, receipt))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect({ reservationReads, bucketReads, settlementAttempts })
      .toEqual({ reservationReads: 1, bucketReads: 0, settlementAttempts: 0 });
    expect((await f.imports.read(f.identity))?.phase).toBe(3);
  });

  it("retries a transient budget observation without multiplying settlement or marker writes", async () => {
    const f = await fixture();
    const { receipt, publication } = await prepareKnownHoldPhaseThree(f);
    let reservationReads = 0;
    let settlementAttempts = 0;
    let markerAttempts = 0;
    const budget = {
      readReservation: async (...args: Parameters<typeof f.budget.readReservation>) => {
        reservationReads += 1;
        if (reservationReads === 1) return null;
        return f.budget.readReservation(...args);
      },
      readBucket: f.budget.readBucket.bind(f.budget),
      settle: async (...args: Parameters<typeof f.budget.settle>) => {
        settlementAttempts += 1; return f.budget.settle(...args);
      },
    };
    const imports = importCapabilities(f, {
      markBudget: async (...args) => {
        markerAttempts += 1; return f.imports.markBudget(...args);
      },
    });

    const result = await coordinator(f, { publication, budget, imports }).complete(f.identity, receipt);

    expect(result.accounting).toBe("settled");
    expect({ reservationReads, settlementAttempts, markerAttempts })
      .toEqual({ reservationReads: 3, settlementAttempts: 1, markerAttempts: 1 });
  });

  it.each(["audit", "audit-marker", "publication", "quota", "quota-marker", "budget", "budget-marker", "finish"] as const)
  ("recovers one committed %s acknowledgement loss without a second effect", async (stage) => {
    const f = await fixture();
    const base = dependencies(f);
    let attempts = 0;
    let losses = 0;
    const failAfter = async <T>(effect: () => Promise<T>): Promise<T> => {
      attempts += 1;
      const result = await effect();
      if (losses === 0) { losses += 1; throw new Error("lost acknowledgement"); }
      return result;
    };
    const overrides: CoordinatorOverrides = {};
    if (stage === "audit") overrides.audits = {
      readResearchAttempt: f.audits.readResearchAttempt.bind(f.audits),
      record: (record) => failAfter(() => f.audits.record(record)),
    };
    if (stage === "publication") overrides.publication = {
      resolve: (...args) => failAfter(() => base.publication.resolve(...args)),
    };
    if (stage === "quota") overrides.entitlements = {
      readResearchReservation: f.quota.readResearchReservation.bind(f.quota),
      finalize: (...args) => failAfter(() => f.quota.finalize(...args)),
    };
    if (stage === "budget") overrides.budget = {
      readReservation: f.budget.readReservation.bind(f.budget),
      readBucket: f.budget.readBucket.bind(f.budget),
      settle: (...args) => failAfter(() => f.budget.settle(...args)),
    };
    if (stage.endsWith("marker") || stage === "finish") {
      if (stage === "audit-marker") overrides.imports = importCapabilities(f, {
        markAudit: (...args) => failAfter(() => f.imports.markAudit(...args)),
      });
      if (stage === "quota-marker") overrides.imports = importCapabilities(f, {
        markQuota: (...args) => failAfter(() => f.imports.markQuota(...args)),
      });
      if (stage === "budget-marker") overrides.imports = importCapabilities(f, {
        markBudget: (...args) => failAfter(() => f.imports.markBudget(...args)),
      });
      if (stage === "finish") overrides.imports = importCapabilities(f, {
        finish: (...args) => failAfter(() => f.imports.finish(...args)),
      });
    }
    const result = await coordinator(f, overrides).complete(f.identity, validReceipt(f.execution));
    expect(result.run.state).toBe("ready");
    expect(losses).toBe(1);
    expect(attempts).toBe(stage === "publication" ? 2 : 1);
    expect(count(f, "ai_runs", "WHERE purpose='role-research'")).toBe(1);
    expect(count(f, "quota_ledger", "WHERE entry_kind<>'reserved'")).toBe(1);
  });

  it.each(["capture", "audit", "audit-marker", "publication", "quota", "quota-marker", "budget", "budget-marker", "finish"] as const)
  ("bounds a pre-commit %s failure to one attempt and resumes on a later call", async (stage) => {
    const f = await fixture();
    let attempts = 0;
    const failBefore = async <T>(): Promise<T> => { attempts += 1; throw new Error("pre-commit failure"); };
    const overrides: CoordinatorOverrides = {};
    if (stage === "capture") overrides.imports = importCapabilities(f, { captureBody: () => failBefore() });
    if (stage === "audit") overrides.audits = {
      readResearchAttempt: f.audits.readResearchAttempt.bind(f.audits), record: () => failBefore(),
    };
    if (stage === "audit-marker") overrides.imports = importCapabilities(f, { markAudit: () => failBefore() });
    if (stage === "publication") overrides.publication = { resolve: () => failBefore() };
    if (stage === "quota") overrides.entitlements = {
      readResearchReservation: f.quota.readResearchReservation.bind(f.quota), finalize: () => failBefore(),
    };
    if (stage === "quota-marker") overrides.imports = importCapabilities(f, { markQuota: () => failBefore() });
    if (stage === "budget") overrides.budget = {
      readReservation: f.budget.readReservation.bind(f.budget),
      readBucket: f.budget.readBucket.bind(f.budget), settle: () => failBefore(),
    };
    if (stage === "budget-marker") overrides.imports = importCapabilities(f, { markBudget: () => failBefore() });
    if (stage === "finish") overrides.imports = importCapabilities(f, { finish: () => failBefore() });

    await expect(coordinator(f, overrides).complete(f.identity, validReceipt(f.execution)))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(attempts).toBe(1);
    expect((await coordinator(f).complete(f.identity, validReceipt(f.execution))).run.state).toBe("ready");
    expect(count(f, "ai_runs", "WHERE purpose='role-research'")).toBe(1);
    expect(count(f, "quota_ledger", "WHERE entry_kind<>'reserved'")).toBe(1);
  });

  it("recovers a committed capture whose acknowledgement is lost", async () => {
    const f = await fixture();
    let attempts = 0;
    const imports = importCapabilities(f, {
      captureBody: async (...args) => {
        attempts += 1;
        await f.imports.captureBody(...args);
        throw new Error("lost capture acknowledgement");
      },
    });
    const result = await coordinator(f, { imports }).complete(f.identity, validReceipt(f.execution));
    expect(result.run.state).toBe("ready");
    expect(attempts).toBe(1);
    expect(count(f, "research_site_imports")).toBe(1);
  });

  it.each(["maximum_reserved_micros", "expires_at"] as const)
  ("refuses corrupted original budget %s before attempting settlement", async (column) => {
    const f = await fixture();
    let settleAttempts = 0;
    const imports = importCapabilities(f, {
      markQuota: async (...args) => {
        const saved = await f.imports.markQuota(...args);
        f.db.database.prepare(`UPDATE ai_budget_reservations SET ${column}=${column}-1 WHERE id=?1`)
          .run(f.execution.budgetReservationId);
        return saved;
      },
    });
    const budget = {
      readReservation: f.budget.readReservation.bind(f.budget),
      readBucket: f.budget.readBucket.bind(f.budget),
      settle: async (...args: Parameters<typeof f.budget.settle>) => {
        settleAttempts += 1; return f.budget.settle(...args);
      },
    };
    await expect(coordinator(f, { imports, budget }).complete(f.identity, validReceipt(f.execution)))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(settleAttempts).toBe(0);
    expect((await f.imports.read(f.identity))?.phase).toBe(3);
  });

  it("revalidates strict phase-five accounting proof on replay", async () => {
    const f = await fixture();
    const receipt = validReceipt(f.execution);
    const unknown = { ...receipt, outcome: { ...receipt.outcome, usage: null } };
    const result = await coordinator(f).complete(f.identity, unknown);
    expect(result.accounting).toBe("held");
    const reservation = await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!);
    f.db.database.prepare("UPDATE ai_budget_buckets SET reserved_micros=0 WHERE id=?1")
      .run(reservation!.dayBucketId);
    await expect(coordinator(f).complete(f.identity, unknown))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it("uses one publication attempt per mutation stage plus one phase-five canonical replay", async () => {
    const f = await fixture();
    const base = dependencies(f);
    let calls = 0;
    const publication = { resolve: (...args: Parameters<typeof base.publication.resolve>) => {
      calls += 1; return base.publication.resolve(...args);
    } };
    const service = coordinator(f, { publication });
    const receipt = validReceipt(f.execution);
    await service.complete(f.identity, receipt);
    expect(calls).toBe(2);
    await service.complete(f.identity, receipt);
    expect(calls).toBe(3);
  });

  it("fails safely when publication statement preparation throws before submission", async () => {
    const f = await fixture();
    let failures = 0;
    const nativeDb = f.db as unknown as D1Database;
    const failingDb = new Proxy(nativeDb, {
      get(target, property, receiver) {
        if (property === "prepare") return (sql: string) => {
          if (sql.includes("UPDATE research_site_imports AS j SET phase=2")) {
            failures += 1;
            throw new Error("synchronous prepare failure");
          }
          return target.prepare(sql);
        };
        const value = Reflect.get(target, property, receiver) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const publication = new D1SiteImportPublication(failingDb, f.research, f.executions);
    const before = {
      packages: count(f, "research_packages"),
      quota: count(f, "quota_ledger", "WHERE entry_kind<>'reserved'"),
      budget: await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!),
    };

    await expect(coordinator(f, { publication }).complete(f.identity, validReceipt(f.execution)))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });

    expect(failures).toBe(1);
    expect((await f.imports.read(f.identity))?.phase).toBe(1);
    expect(count(f, "research_packages")).toBe(before.packages);
    expect(count(f, "quota_ledger", "WHERE entry_kind<>'reserved'")).toBe(before.quota);
    expect(await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!)).toEqual(before.budget);
    expect((await coordinator(f).complete(f.identity, validReceipt(f.execution))).run.state).toBe("ready");
  });

  it("preserves typed ownership and receipt conflicts without effects", async () => {
    const f = await fixture();
    const service = coordinator(f);
    await expect(service.complete({ ...f.identity, ownerId: "owner-b" }, validReceipt(f.execution)))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    await service.complete(f.identity, validReceipt(f.execution));
    await expect(service.complete(f.identity, validReceipt(f.execution, 100_001)))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(count(f, "ai_runs", "WHERE purpose='role-research'")).toBe(1);
  });

  it("rejects a contradictory same-hash marker result that was never committed", async () => {
    const f = await fixture();
    const imports = importCapabilities(f, {
      markAudit: async () => {
        const saved = await f.imports.read(f.identity);
        if (!saved) throw new Error("missing journal");
        return { ...saved, phase: 1, audit: { ...saved.audit, latencyMs: saved.audit.latencyMs + 1 } };
      },
    });
    await expect(coordinator(f, { imports }).complete(f.identity, validReceipt(f.execution)))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect((await f.imports.read(f.identity))?.phase).toBe(0);
    expect(count(f, "quota_ledger", "WHERE entry_kind<>'reserved'")).toBe(0);
  });

  it("does not settle when an uncommitted quota marker claims phase three", async () => {
    const f = await fixture();
    let settleAttempts = 0;
    const imports = importCapabilities(f, {
      markQuota: async () => {
        const saved = await f.imports.read(f.identity);
        if (!saved) throw new Error("missing journal");
        return { ...saved, phase: 3 };
      },
    });
    const budget = {
      readReservation: f.budget.readReservation.bind(f.budget),
      readBucket: f.budget.readBucket.bind(f.budget),
      settle: async (...args: Parameters<typeof f.budget.settle>) => {
        settleAttempts += 1; return f.budget.settle(...args);
      },
    };
    await expect(coordinator(f, { imports, budget }).complete(f.identity, validReceipt(f.execution)))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(settleAttempts).toBe(0);
    expect((await f.imports.read(f.identity))?.phase).toBe(2);
  });

  it("does not finalize quota from a substituted publication resolution", async () => {
    const f = await fixture();
    const base = dependencies(f);
    let finalizeAttempts = 0;
    const publication = {
      resolve: async (...args: Parameters<typeof base.publication.resolve>) => {
        const saved = await base.publication.resolve(...args);
        if (saved.phase !== 2 || !saved.resolution) return saved;
        return { ...saved, resolution: { ...saved.resolution,
          quotaStatus: saved.resolution.quotaStatus === "accepted" ? "failed" as const : "accepted" as const } };
      },
    };
    const entitlements = {
      readResearchReservation: f.quota.readResearchReservation.bind(f.quota),
      finalize: async (...args: Parameters<typeof f.quota.finalize>) => {
        finalizeAttempts += 1; return f.quota.finalize(...args);
      },
    };
    await expect(coordinator(f, { publication, entitlements }).complete(f.identity, validReceipt(f.execution)))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(finalizeAttempts).toBe(0);
    expect((await f.imports.read(f.identity))?.phase).toBe(2);
    expect(count(f, "quota_ledger", "WHERE entry_kind<>'reserved'")).toBe(0);
  });

  it("keeps two owners on their original quota and budget reservations", async () => {
    const f = await fixture();
    const second = await f.createRemote("owner-b");
    const reservations = await f.reserveAdmission(second.execution);
    const admitted = await f.executions.markAdmitted(f.admissionCommand(second.execution, reservations));
    await f.begin.begin({ ownerId: admitted.ownerId, runId: admitted.runId,
      requestId: admitted.requestId, jobId: admitted.jobId, requestHash: admitted.requestHash,
      newExecutionAllowed: true });
    const executionB = await f.executions.read(admitted.ownerId, admitted.runId);
    if (!executionB) throw new Error("missing owner-b execution");
    const identityB = { ownerId: executionB.ownerId, runId: executionB.runId,
      requestId: executionB.requestId, jobId: executionB.jobId, requestHash: executionB.requestHash };
    const resultA = await coordinator(f).complete(f.identity, validReceipt(f.execution));
    const resultB = await coordinator(f).complete(identityB, validReceipt(executionB));
    expect([resultA.run.ownerId, resultB.run.ownerId]).toEqual(["owner-a", "owner-b"]);
    expect((await f.quota.readResearchReservation("owner-a", f.execution.quotaKey))?.reservationId)
      .toBe(f.execution.quotaReservationId);
    expect((await f.quota.readResearchReservation("owner-b", executionB.quotaKey))?.reservationId)
      .toBe(executionB.quotaReservationId);
    expect((await f.budget.readReservation("owner-b", executionB.budgetReservationId!))?.runId)
      .toBe(executionB.runId);
    expect(count(f, "research_packages")).toBe(2);
  });

  it("replays the completed proof through a fresh SQLite connection", async () => {
    const parent = resolve(process.cwd(), ".tmp-site-import");
    mkdirSync(parent, { recursive: true });
    const dir = mkdtempSync(join(parent, "reopen-"));
    const path = join(dir, "coordinator.sqlite");
    let first: Awaited<ReturnType<typeof createSiteImportFixture>> | null = null;
    let reopened: SqliteD1 | null = null;
    try {
      first = await createSiteImportFixture(path);
      const identity = first.identity;
      const receipt = validReceipt(first.execution);
      const original = await coordinator(first).complete(identity, receipt);
      first.db.close(); first = null;
      reopened = new SqliteD1(path);
      reopened.database.exec("PRAGMA foreign_keys=ON");
      const db = reopened as unknown as D1Database;
      const research = new D1ResearchRepository(db);
      const executions = new D1SiteExecutionRepository(db, research);
      const imports = new D1SiteImportRepository(db, research, executions);
      const replay = await new SiteImportCoordinator({
        imports,
        publication: new D1SiteImportPublication(db, research, executions),
        research,
        audits: new D1AiRunSink(db),
        entitlements: new D1EntitlementRepository(db),
        budget: new D1ResearchBudgetRepository(db),
      }).complete(identity, receipt);
      expect(replay).toEqual(original);
    } finally {
      if (reopened) reopened.close();
      if (first) first.db.close();
      const target = resolve(dir);
      if (!target.startsWith(`${parent}${sep}`) || !basename(target).startsWith("reopen-")) {
        throw new Error("Refusing to remove an unexpected fixture directory");
      }
      rmSync(target, { recursive: true, force: true });
    }
  });
});
