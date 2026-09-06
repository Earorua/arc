import assert from "node:assert/strict";
import test from "node:test";

import { runRetainedCompatibility } from "./retained-compatibility.mjs";
import {
  RETAINED_MANIFEST,
  validateRetainedImport,
  validateRetainedSourceBytes,
} from "./retained-source.mjs";

test("rejects retained source drift before evaluation", () => {
  const drifted = new Map(RETAINED_MANIFEST.map(({ path }) => [path, Buffer.from("synthetic drift")]));
  assert.throws(() => validateRetainedSourceBytes(drifted), /Retained source hash mismatch/u);
});

test("rejects modules outside the retained runtime closure before evaluation", () => {
  assert.throws(
    () => validateRetainedImport("app/server/cloud/service.ts", "node:fs"),
    /Retained import is outside the closed runtime graph/u,
  );
});

test("single run classifies unchanged archived services against actual upgraded data", async (context) => {
  const result = await runRetainedCompatibility();

  assert.equal(result.archive.commit, "7ca5b530dfc58f3cbc700b44a7a881a9bd661209");
  assert.equal(result.archive.verifiedSourceCount, 7);
  assert.equal(result.archive.tree, "d0693b0a6bb0d13ded951d2df44aaab24f69ffe3");
  assert.deepEqual(result.archive.runtimeVersions, { typescript: "5.9.3", zod: "4.4.3" });
  assert.equal(result.legacy.unchangedReadAfterUpgrade, true);
  assert.equal(result.upgradedTableCount, 41);
  assert.equal(result.realProviderRequests, 0);
  assert.equal(result.disposed, true);
  assert.equal(result.rollbackEligible, false);

  assert.equal(result.storage.migrationHashes.length, 7);
  assert.equal(result.storage.legacyTableCount, 20);
  assert.equal(result.storage.legacyRowCount, 50);
  assert.equal(result.storage.legacyObjectCount, 2);
  assert.equal(result.storage.legacyRowsBeforeHash, result.storage.legacyRowsAfterHash);
  assert.equal(result.storage.legacyObjectsBeforeHash, result.storage.legacyObjectsAfterHash);
  assert.equal(result.storage.quickCheck, "ok");
  assert.equal(result.storage.foreignKeyViolationCount, 0);
  assert.deepEqual(result.primaryMixedBaseline.identity, { tableCount: 20, rowCount: 50, objectCount: 2 });
  assert.equal(result.primaryMixedBaseline.rowsBeforeHash, result.primaryMixedBaseline.rowsAfterV8Hash);
  assert.equal(result.primaryMixedBaseline.rowsBeforeHash, result.primaryMixedBaseline.rowsAfterMixedHash);
  assert.equal(result.primaryMixedBaseline.objectsBeforeHash, result.primaryMixedBaseline.objectsAfterV8Hash);
  assert.equal(result.primaryMixedBaseline.objectsBeforeHash, result.primaryMixedBaseline.objectsAfterMixedHash);
  assert.deepEqual(result.legacy.ownerSnapshotHashesBefore, result.legacy.ownerSnapshotHashesAfter);

  assert.equal(result.legacy.operations.setup.idempotencyReceiptCount, 1);
  assert.equal(result.legacy.operations.setup.replayEqual, true);
  assert.equal(result.legacy.operations.completion.learningEventCount, 1);
  assert.equal(result.legacy.operations.completion.proofRootCount, 1);
  assert.equal(result.legacy.operations.completion.idempotencyReceiptCount, 1);
  assert.equal(result.legacy.operations.completion.replayEqual, true);
  assert.equal(result.legacy.operations.imports.conflictStatus, "conflict");
  assert.equal(result.legacy.operations.imports.archiveStatus, "imported");
  assert.equal(result.legacy.operations.imports.activateStatus, "imported");
  assert.equal(result.legacy.operations.imports.activateReplayStatus, "already-imported");
  assert.equal(result.legacy.operations.imports.activeRole, "synthetic-role-active");
  assert.equal(result.legacy.operations.imports.archivedGoalCount, 2);
  assert.equal(result.legacy.operations.imports.freshReadMatchesActiveRole, true);
  assert.equal(result.legacy.operations.imports.nonTargetOwnerHashBefore, result.legacy.operations.imports.nonTargetOwnerHashAfter);
  assert.deepEqual(result.legacy.operations.proof.ownedRead, { owner: true, foreign: null });
  assert.deepEqual(result.legacy.operations.proof.assetRead, {
    owner: true, foreign: null, bodyHashMatches: true, contentTypeMatches: true, sizeMetadataMatches: true,
  });
  assert.deepEqual(result.legacy.operations.proof.shareRevoke, { owner: true, replay: false, foreign: false });
  assert.equal(result.legacy.operations.proof.foreignRevokePreservedActiveShare, true);
  for (const operation of ["foreignProofRead", "foreignAssetRead", "foreignRevoke"]) {
    const evidence = result.legacy.operations.proof.negativeIsolation[operation];
    assert.equal(evidence.rowsBeforeHash, evidence.rowsAfterHash);
    assert.equal(evidence.objectsBeforeHash, evidence.objectsAfterHash);
  }
  assert.equal(result.legacy.operations.proof.negativeIsolation.foreignRevoke.activeShareNonNull, true);
  assert.equal(
    result.legacy.operations.proof.negativeIsolation.foreignRevoke.activeShareBeforeHash,
    result.legacy.operations.proof.negativeIsolation.foreignRevoke.activeShareAfterHash,
  );
  assert.equal(result.legacy.operations.proof.shareWriteCount, 1);

  assert.equal(result.current.fakeProviderCalls, 1);
  assert.equal(result.current.researchRunCount > 0, true);
  assert.equal(result.current.researchBudgetBucketCount > 0, true);
  assert.equal(result.current.researchBudgetReservationCount > 0, true);
  assert.equal(result.current.planningEventCount > 0, true);
  assert.equal(result.current.proofVersionCount, 2);
  assert.equal(result.current.proofReviewCount > result.current.proofVersionCount, true);
  assert.deepEqual(result.current.compatibilityRoot, {
    title: "Retained v8 proof original",
    kind: "project",
    verified: false,
  });
  assert.equal(result.current.latestVersion.title, "Retained v8 proof revised");
  assert.equal(result.current.latestStatus, "withdrawn");

  assert.equal(result.comparisons.archivedMissesV8Completion, true);
  assert.equal(result.comparisons.oldCompletionLeavesPlanningStateUnchanged, true);
  assert.equal(result.comparisons.oldCompletionCreatesVerifiedLegacyRoot, true);
  assert.equal(result.comparisons.oldSetupChangesGoalMinutes, true);
  assert.equal(result.comparisons.oldSetupLeavesAvailabilityAndPlanUnchanged, true);
  assert.equal(result.comparisons.oldActivationArchivesPlannedGoal, true);
  assert.equal(result.comparisons.currentActiveWorkspaceAfterOldActivation, null);
  assert.equal(result.comparisons.oldActivationPreservesPlanAndProofRows, true);
  assert.equal(result.comparisons.strictIntentRejectedWithoutWrites, true);
  assert.equal(result.comparisons.newTablesPreservedAcrossOldOperations, true);
  assert.equal(result.comparisons.primaryResearchBudgetPreservedAcrossOldOperations, true);
  assert.equal(result.comparisons.nonTargetOwnerPreserved, true);
  assert.equal(result.comparisons.nonTargetOwnerRowCount > 1, true);
  assert.deepEqual(result.currentDatabaseHealth, {
    primary: { foreignKeyViolationCount: 0, quickCheck: "ok" },
    completion: { foreignKeyViolationCount: 0, quickCheck: "ok" },
    setup: { foreignKeyViolationCount: 0, quickCheck: "ok" },
    activation: { foreignKeyViolationCount: 0, quickCheck: "ok" },
  });
  assert.equal(result.archiveFactoryStub.realFactoryLoaded, false);
  assert.equal(result.archiveFactoryStub.realAdapterLoaded, false);

  assert.deepEqual(result.publicViews, {
    titleBearingV8OldView: { title: "Retained v8 proof revised" },
    statusSummaryOnlyOldView: null,
    documentKindOldRejected: true,
    oldFormatCurrentView: null,
    oldRevokeOfV8ShareEffective: true,
    existingSnapshotNonNullBeforeAfter: true,
    existingSnapshotSurvivesWithdrawal: true,
    withdrawnOldRootStillReadable: true,
    trustedOldShareCreatedAfterWithdrawal: true,
  });
  assert.deepEqual(result.unsupported, [
    "legacy-proof-ledger-revise",
    "legacy-proof-ledger-withdraw",
    "legacy-proof-delete",
    "legacy-user-delete",
  ]);
  assert.deepEqual(result.differences, [
    "archived-activation-detaches-active-v8-workspace",
    "archived-completion-leaves-v8-planning-stale",
    "archived-proof-root-stale-vs-ledger",
    "archived-read-misses-planning-events",
    "archived-schema-rejects-research-intent",
    "archived-setup-diverges-from-v8-plan",
    "public-share-schema-incompatible",
    "withdrawn-proof-old-share-creation-gap",
  ]);
  assert.deepEqual(Object.values(result.differenceEvidence), Array(8).fill(true));

  assert.deepEqual(result.researchAdmissionFallback, {
    status: 503,
    resultCode: "RESEARCH_UNAVAILABLE",
    savedPlanningPreserved: true,
    savedProofPreserved: true,
    savedResearchPreserved: true,
    additionalFakeProviderCalls: 0,
  });

  const healthyDatabaseCount = [
    { foreignKeyViolationCount: result.storage.foreignKeyViolationCount, quickCheck: result.storage.quickCheck },
    ...Object.values(result.currentDatabaseHealth),
  ].filter(({ foreignKeyViolationCount, quickCheck }) => foreignKeyViolationCount === 0 && quickCheck === "ok").length;
  context.diagnostic(JSON.stringify({
    archiveVerifiedSourceCount: result.archive.verifiedSourceCount,
    legacyTableCount: result.storage.legacyTableCount,
    upgradedTableCount: result.upgradedTableCount,
    legacyRowCount: result.storage.legacyRowCount,
    legacyObjectCount: result.storage.legacyObjectCount,
    differences: result.differences,
    rollbackEligible: result.rollbackEligible,
    healthyDatabaseCount,
    nonTargetOwnerRowCount: result.comparisons.nonTargetOwnerRowCount,
    realFactoryLoaded: result.archiveFactoryStub.realFactoryLoaded,
    realAdapterLoaded: result.archiveFactoryStub.realAdapterLoaded,
    fallbackStatus: result.researchAdmissionFallback.status,
    fallbackAdditionalFakeProviderCalls: result.researchAdmissionFallback.additionalFakeProviderCalls,
    legacyRowsBeforeHash: result.storage.legacyRowsBeforeHash,
    legacyRowsAfterHash: result.storage.legacyRowsAfterHash,
    legacyObjectsBeforeHash: result.storage.legacyObjectsBeforeHash,
    legacyObjectsAfterHash: result.storage.legacyObjectsAfterHash,
    primaryMixedRowsBeforeHash: result.primaryMixedBaseline.rowsBeforeHash,
    primaryMixedRowsAfterV8Hash: result.primaryMixedBaseline.rowsAfterV8Hash,
    primaryMixedRowsAfterMixedHash: result.primaryMixedBaseline.rowsAfterMixedHash,
    primaryMixedObjectsBeforeHash: result.primaryMixedBaseline.objectsBeforeHash,
    primaryMixedObjectsAfterMixedHash: result.primaryMixedBaseline.objectsAfterMixedHash,
    negativeIsolation: result.legacy.operations.proof.negativeIsolation,
    disposed: result.disposed,
  }));
});
