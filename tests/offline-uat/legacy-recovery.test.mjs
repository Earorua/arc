import assert from "node:assert/strict";
import test from "node:test";

import { runLegacyRecoveryRehearsal } from "./legacy-recovery.mjs";

let rehearsal;

function result() {
  rehearsal ??= runLegacyRecoveryRehearsal();
  return rehearsal;
}

test("upgrades and restores a populated synthetic v7.2 database and bucket", async (context) => {
  const recovery = await result();

  assert.equal(recovery.legacyTableCount, 20);
  assert.equal(recovery.upgradedTableCount, 41);
  assert.equal(recovery.oldRowsPreserved, true);
  assert.equal(recovery.restoredRowsPreserved, true);
  assert.equal(recovery.objectsPreserved, true);
  assert.equal(recovery.interruptedUpgradeRecovered, true);
  assert.equal(recovery.disposed, true);
  assert.ok(recovery.evidence.legacyRowCount >= 40);
  assert.equal(recovery.evidence.nonemptyLegacyTables, 20);
  assert.equal(recovery.evidence.objectCount, 2);
  assert.equal(recovery.evidence.migrationHashes.length, 7);
  context.diagnostic(JSON.stringify({
    legacyTables: recovery.legacyTableCount,
    upgradedTables: recovery.upgradedTableCount,
    legacyRows: recovery.evidence.legacyRowCount,
    objects: recovery.evidence.objectCount,
    backupChecksum: recovery.evidence.backupChecksum,
    legacySnapshotHash: recovery.evidence.legacySnapshotHash,
    objectSnapshotHash: recovery.evidence.objectSnapshotHash,
    interruptedPartialTables: recovery.evidence.interruption.partialTableCount,
    disposed: recovery.disposed,
  }));
});

test("rejects changed migration SQL and damaged backups before target writes", async () => {
  const { evidence } = await result();

  for (const name of ["changedSql", "tamperedRow", "missingRow", "missingObject", "tamperedObject"]) {
    assert.equal(evidence.rejections[name].rejected, true, name);
    assert.deepEqual(evidence.rejections[name].before, evidence.rejections[name].after, name);
    assert.deepEqual(evidence.rejections[name].after, { tables: 0, objects: 0 }, name);
  }
});

test("rejects nonempty database and bucket targets without changing them", async () => {
  const { evidence } = await result();

  for (const name of ["nonemptyDatabase", "nonemptyBucket"]) {
    assert.equal(evidence.rejections[name].rejected, true, name);
    assert.deepEqual(evidence.rejections[name].before, evidence.rejections[name].after, name);
  }
  assert.deepEqual(evidence.rejections.nonemptyDatabase.after, { tables: 1, objects: 0 });
  assert.deepEqual(evidence.rejections.nonemptyBucket.after, { tables: 0, objects: 1 });
});

test("enforces legacy and v8 owner constraints without rejected-write residue", async () => {
  const { constraints } = (await result()).evidence;

  assert.equal(constraints.validOwnerScopedWrite, true);
  for (const name of ["duplicateActiveGoal", "duplicateIdempotency", "missingOwner", "crossOwnerPlanning", "crossOwnerProof", "atomicBatch"]) {
    assert.equal(constraints[name].rejected, true, name);
    assert.deepEqual(constraints[name].before, constraints[name].after, name);
  }
});

test("observes a real partial migration failure then recovers from the original backup", async () => {
  const { interruption } = (await result()).evidence;

  assert.equal(interruption.realSqlError, true);
  assert.ok(interruption.partialTableCount > 20);
  assert.equal(interruption.fabricatedMigrationReceiptCount, 0);
  assert.equal(interruption.recoveredLegacyTableCount, 20);
  assert.equal(interruption.recoveredUpgradedTableCount, 41);
  assert.equal(interruption.recoveredRowsEqual, true);
  assert.equal(interruption.recoveredObjectsEqual, true);
});
