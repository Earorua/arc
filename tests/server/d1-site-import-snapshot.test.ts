// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSiteImportFixture } from "../helpers/site-import-fixture";

type Fixture = Awaited<ReturnType<typeof createSiteImportFixture>>;
type SnapshotResults = D1Result<Record<string, unknown>>[];
const fixtures: Fixture[] = [];
async function fixture() {
  const value = await createSiteImportFixture();
  fixtures.push(value);
  await value.imports.captureBody(value.identity, value.receipt);
  return value;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const value of fixtures.splice(0)) value.db.close();
});

function alterReadBatch(f: Fixture, alter: (results: SnapshotResults) => unknown) {
  const batch = f.db.batch.bind(f.db);
  return vi.spyOn(f.db, "batch").mockImplementation(async (statements) =>
    alter(await batch(statements) as SnapshotResults) as D1Result<unknown>[]);
}

describe("strict owned Site import snapshot", () => {
  it("returns complete validated rows without changing durable state", async () => {
    const f = await fixture();
    const expectedRun = await f.research.getRun(f.identity.ownerId, f.identity.runId);
    const expectedJournal = await f.imports.read(f.identity);
    const before = f.db.database.prepare("SELECT * FROM research_site_imports").all();
    const start = f.db.batches.length;
    await expect(f.imports.readStrictImportContext(f.identity)).resolves.toMatchObject({
      run: expectedRun, execution: f.execution, journal: expectedJournal,
      runQualityJson: null, runCandidateJson: null,
    });
    expect(f.db.batches.slice(start)).toHaveLength(1);
    expect(f.db.batches.slice(start).flat().every((sql) => /^\s*SELECT\b/iu.test(sql))).toBe(true);
    expect(f.db.database.prepare("SELECT * FROM research_site_imports").all()).toEqual(before);
  });

  it.each([
    { name: "no results", alter: () => [] },
    { name: "missing result", alter: (rows: SnapshotResults) => rows.slice(0, 2) },
    { name: "extra result", alter: (rows: SnapshotResults) => [...rows, rows[0]] },
    { name: "sparse result", alter: (rows: SnapshotResults) => { delete rows[2]; return rows; } },
    ...[0, 1, 2].flatMap((index) => [
      { name: `failed result ${index}`, alter: (rows: SnapshotResults) => {
        rows[index] = { ...rows[index], success: false } as unknown as SnapshotResults[number]; return rows;
      } },
      { name: `absent rows ${index}`, alter: (rows: SnapshotResults) => {
        rows[index] = { ...rows[index], results: undefined } as unknown as SnapshotResults[number]; return rows;
      } },
      { name: `duplicate rows ${index}`, alter: (rows: SnapshotResults) => {
        rows[index].results.push(rows[index].results[0]); return rows;
      } },
      { name: `null row ${index}`, alter: (rows: SnapshotResults) => {
        rows[index].results = [null as unknown as Record<string, unknown>]; return rows;
      } },
    ]),
    ...[0, 1].map((index) => ({ name: `missing owned row ${index}`, alter: (rows: SnapshotResults) => {
      rows[index].results = []; return rows;
    } })),
  ])("fails closed on $name", async ({ alter }) => {
    const f = await fixture();
    alterReadBatch(f, alter);
    await expect(f.imports.readStrictImportContext(f.identity))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it("fails closed if the read transaction rejects", async () => {
    const f = await fixture();
    f.db.failAtBatchStatement = 1;
    await expect(f.imports.readStrictImportContext(f.identity))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it("keeps a missing journal available to the verified result fallback", async () => {
    const f = await createSiteImportFixture();
    fixtures.push(f);
    await expect(f.imports.readStrictImportContext(f.identity)).resolves.toMatchObject({ journal: null });
  });

  it.each(["ownerId", "runId"] as const)("does not expose rows for a foreign %s", async (field) => {
    const f = await fixture();
    await expect(f.imports.readStrictImportContext({ ...f.identity,
      [field]: field === "runId" ? "research-run-foreign" : "owner-foreign" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each([
    { index: 0, field: "retryable", value: 2 },
    { index: 0, field: "active_slot", value: null },
    { index: 0, field: "quality_json", value: "{}" },
    { index: 1, field: "reservation_expires_at", value: 0 },
    { index: 1, field: "quota_key", value: "foreign-quota-key" },
    { index: 1, field: "request_hash", value: "f".repeat(64) },
    { index: 1, field: "job_json", value: "{}" },
    { index: 1, field: "validation_context_json", value: "{}" },
    { index: 2, field: "request_id", value: "foreign-request" },
    { index: 2, field: "decision_hash", value: "f".repeat(64) },
  ])("rejects corrupt row $index $field through full validation", async ({ index, field, value }) => {
    const f = await fixture();
    alterReadBatch(f, (rows) => { rows[index].results[0][field] = value; return rows; });
    await expect(f.imports.readStrictImportContext(f.identity))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });
});
