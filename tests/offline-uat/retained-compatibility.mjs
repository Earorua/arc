import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { createOfflineVite, offlineAliases } from "./server.mjs";
import {
  all, applyMigrations, canonicalHash, createRetainedRuntime, databaseHealth,
  LEGACY_OBJECTS, LEGACY_TABLES, legacyRowCount, loadRetainedMigrations,
  seedLegacy, snapshotObjects, snapshotRows, tableNames,
  snapshotLegacyFixtureRows,
} from "./retained-storage.mjs";
import { loadRetainedArchive } from "./retained-source.mjs";

const DATABASES = ["LEGACY_DB", "V8_PRIMARY_DB", "V8_COMPLETION_DB", "V8_SETUP_DB", "V8_ACTIVATE_DB"];
const BUCKETS = ["LEGACY_BUCKET", "V8_PRIMARY_BUCKET"];
const FIXED_TIME = new Date("2027-01-15T12:00:00.000Z");
const count = async (db, sql, ...bindings) => Number((await db.prepare(sql).bind(...bindings).first())?.count ?? 0);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function deterministicOptions() {
  let next = 0;
  return { createId: () => `retained-old-${++next}`, now: () => new Date(FIXED_TIME), hash: async (value) => sha256(value) };
}

function baseState(roleId = "ai-native-full-stack-engineer") {
  return { setup: { roleId, level: "beginner", weeklyMinutes: 420, targetWeeks: 18 }, completedUnitIds: [], proofs: [] };
}

async function addSyntheticUsers(db, owners) {
  for (const owner of owners) await db.prepare(
    "INSERT OR IGNORE INTO users (id,name,email,email_verified,created_at,updated_at) VALUES (?1,?1,?2,0,?3,?3)",
  ).bind(owner, `${owner}@example.invalid`, FIXED_TIME.getTime()).run();
}

async function ownerFingerprint(db, owner) {
  const result = {};
  for (const table of await tableNames(db)) {
    const columns = await all(db, `PRAGMA table_info("${table}")`);
    if (table === "users") {
      result[table] = await all(db, "SELECT * FROM users WHERE id=?1", owner);
    } else if (columns.some(({ name }) => name === "user_id")) {
      result[table] = await all(db, `SELECT * FROM "${table}" WHERE user_id=?1 ORDER BY rowid`, owner);
    }
  }
  return canonicalHash(result);
}

async function ownerRowCount(db, owner) {
  let total = 0;
  for (const table of await tableNames(db)) {
    const columns = await all(db, `PRAGMA table_info("${table}")`);
    if (table === "users") total += await count(db, "SELECT count(*) count FROM users WHERE id=?1", owner);
    else if (columns.some(({ name }) => name === "user_id")) total += await count(db, `SELECT count(*) count FROM "${table}" WHERE user_id=?1`, owner);
  }
  return total;
}

const newTableFingerprint = async (db, tables) => canonicalHash(await snapshotRows(db, tables));

async function proofSurfaceFingerprint(db, bucket) {
  return {
    rowsHash: canonicalHash(await snapshotRows(db, ["proof_items", "proof_assets", "public_proof_shares"])),
    objectsHash: canonicalHash(await snapshotObjects(bucket)),
  };
}

function retainedResearchFactoryStub(audit) {
  const virtualId = "\0retained-research-service-factory";
  return {
    name: "retained-research-factory-stub", enforce: "pre",
    resolveId(source) {
      if (/openrouter-provider/u.test(source)) throw new Error("Real OpenRouter adapter import denied");
      if (/(?:^|\/)research\/service-factory(?:\.ts)?$/u.test(source)) { audit.resolved++; return virtualId; }
    },
    load(id) {
      if (id !== virtualId) return undefined;
      audit.loaded++;
      return `const unavailable=()=>{throw new Error("Production Research factory capability disabled")}
        export function createResearchServiceFactory(){return Object.freeze({createRecoveryService:unavailable,createNewCallService:unavailable,cohortEnabled:unavailable,deriveIpSubject:unavailable,configuredOrigin:unavailable,rateLimitPerMinute:unavailable})}
        export function readResearchProductionConfiguration(){throw new Error("Production Research configuration disabled")}`;
    },
  };
}

async function runLegacyLifecycle(db, bucket, archive, migrations) {
  const CloudService = archive.modules["app/server/cloud/service.ts"].CloudService;
  const D1CloudRepository = archive.modules["app/server/cloud/d1-cloud-repository.ts"].D1CloudRepository;
  const D1ProofRepository = archive.modules["app/server/proof/d1-proof-repository.ts"].D1ProofRepository;
  const { R2ProofStorage, proofObjectKey } = archive.modules["app/server/proof/storage.ts"];
  const { createPublicProofView } = archive.modules["app/server/proof/public-view.ts"];
  const cloud = new CloudService(new D1CloudRepository(db, deterministicOptions()));
  const proofRepository = new D1ProofRepository(db, () => FIXED_TIME.getTime());
  const storage = new R2ProofStorage(bucket);
  await db.prepare("PRAGMA foreign_keys=ON").run();
  await applyMigrations(db, migrations, 0, 2);
  await seedLegacy(db, bucket);
  assert.deepEqual(await tableNames(db), LEGACY_TABLES);
  const owners = ["usr-a", "usr-b"];
  const snapshotsBefore = Object.fromEntries(await Promise.all(owners.map(async (owner) => [owner, canonicalHash(await cloud.getWorkspace(owner))])));
  const rowsBefore = canonicalHash(await snapshotRows(db, LEGACY_TABLES));
  const objectsBefore = canonicalHash(await snapshotObjects(bucket, LEGACY_OBJECTS.map(({ key }) => key)));
  await applyMigrations(db, migrations, 2);
  const snapshotsAfter = Object.fromEntries(await Promise.all(owners.map(async (owner) => [owner, canonicalHash(await cloud.getWorkspace(owner))])));
  const rowsAfter = canonicalHash(await snapshotRows(db, LEGACY_TABLES));
  const objectsAfter = canonicalHash(await snapshotObjects(bucket, LEGACY_OBJECTS.map(({ key }) => key)));
  assert.deepEqual(snapshotsAfter, snapshotsBefore); assert.equal(rowsAfter, rowsBefore); assert.equal(objectsAfter, objectsBefore);

  const operationOwners = ["old-setup", "old-completion", "old-import", "old-control", "old-proof", "old-proof-foreign"];
  await addSyntheticUsers(db, operationOwners);
  for (const owner of operationOwners) {
    const state = owner === "old-proof" ? { ...baseState(), proofs: [{ id: "synthetic-proof-input", title: "Retained old proof", kind: "project", skillIds: ["synthetic-skill"], verified: false }] } : baseState();
    await cloud.importLocalState(owner, { migrationId: `retained-init-${owner}`, consent: true, conflictResolution: "reject", state });
  }
  const setupRequest = { mutationId: "retained-old-setup", setup: { ...baseState().setup, weeklyMinutes: 300 } };
  const setupFirst = await cloud.saveSetup("old-setup", setupRequest);
  const setupReplay = await cloud.saveSetup("old-setup", setupRequest);
  const setupReceiptCount = await count(db, "SELECT count(*) count FROM idempotency_records WHERE user_id=?1 AND scope='setup' AND mutation_id=?2", "old-setup", setupRequest.mutationId);
  const completionRequest = { mutationId: "retained-old-completion", unitId: "retained-old-unit", title: "Retained old unit", deliverable: "Retained old completion artifact", skillIds: ["synthetic-skill"] };
  const completionFirst = await cloud.recordCompletion("old-completion", completionRequest);
  const completionReplay = await cloud.recordCompletion("old-completion", completionRequest);
  const completionEventCount = await count(db, "SELECT count(*) count FROM learning_events WHERE user_id=?1 AND mutation_id=?2", "old-completion", completionRequest.mutationId);
  const completionProofCount = await count(db, "SELECT count(*) count FROM proof_items WHERE user_id=?1 AND source_task_id=?2", "old-completion", completionRequest.unitId);
  const completionReceiptCount = await count(db, "SELECT count(*) count FROM idempotency_records WHERE user_id=?1 AND scope='completion' AND mutation_id=?2", "old-completion", completionRequest.mutationId);
  const nonTargetBefore = await ownerFingerprint(db, "old-control");
  const conflict = await cloud.importLocalState("old-import", { migrationId: "retained-import-conflict", consent: true, conflictResolution: "reject", state: baseState("synthetic-role-conflict") });
  const archivedImport = await cloud.importLocalState("old-import", { migrationId: "retained-import-archive", consent: true, conflictResolution: "archive-import", state: baseState("synthetic-role-archive") });
  const activatedImport = await cloud.importLocalState("old-import", { migrationId: "retained-import-activate", consent: true, conflictResolution: "activate-import", state: baseState("synthetic-role-active") });
  const activatedReplay = await cloud.importLocalState("old-import", { migrationId: "retained-import-activate", consent: true, conflictResolution: "activate-import", state: baseState("synthetic-role-active") });
  const activeImportGoal = await db.prepare("SELECT role_id FROM career_goals WHERE user_id='old-import' AND active_slot=1").first();
  const archivedGoalCount = await count(db, "SELECT count(*) count FROM career_goals WHERE user_id='old-import' AND status='archived'");
  const freshImportRead = await new CloudService(new D1CloudRepository(db, deterministicOptions())).getWorkspace("old-import");
  const nonTargetAfter = await ownerFingerprint(db, "old-control");

  const proofRow = await db.prepare("SELECT id FROM proof_items WHERE user_id='old-proof' LIMIT 1").first();
  assert.ok(proofRow?.id);
  const proofId = proofRow.id;
  const ownedProof = await proofRepository.getOwnedProof("old-proof", proofId);
  const foreignProofBefore = await proofSurfaceFingerprint(db, bucket);
  const foreignProof = await proofRepository.getOwnedProof("old-proof-foreign", proofId);
  const foreignProofAfter = await proofSurfaceFingerprint(db, bucket);
  assert.ok(ownedProof);
  const assetId = "retained-old-asset";
  const objectKey = proofObjectKey("old-proof", proofId, assetId);
  const assetBytes = new TextEncoder().encode("retained synthetic proof bytes");
  await proofRepository.createAssetMetadata({ id: assetId, userId: "old-proof", proofId, objectKey, filename: "retained-proof.txt", contentType: "text/plain", sizeBytes: assetBytes.byteLength });
  await storage.put(objectKey, { body: assetBytes.buffer, contentType: "text/plain", sizeBytes: assetBytes.byteLength });
  const ownedAsset = await proofRepository.getOwnedAsset("old-proof", proofId);
  const foreignAssetBefore = await proofSurfaceFingerprint(db, bucket);
  const foreignAsset = await proofRepository.getOwnedAsset("old-proof-foreign", proofId);
  const foreignAssetAfter = await proofSurfaceFingerprint(db, bucket);
  const storedObject = await storage.get(objectKey); assert.ok(storedObject);
  const storedBytes = new Uint8Array(await new Response(storedObject.body).arrayBuffer());
  const storedHead = await bucket.head(objectKey); assert.ok(storedHead);
  const publicView = createPublicProofView(ownedProof, ["title", "kind"]);
  await proofRepository.upsertShare({ id: "retained-old-share", userId: "old-proof", proofId, tokenHash: "synthetic-retained-old-token-hash", publishedFields: ["title", "kind"], publicView });
  assert.deepEqual((await proofRepository.getActiveShareByTokenHash("synthetic-retained-old-token-hash"))?.publicView, publicView);
  const activeBeforeForeignRevoke = await proofRepository.getActiveShareByTokenHash("synthetic-retained-old-token-hash");
  assert.ok(activeBeforeForeignRevoke);
  const foreignRevokeBefore = await proofSurfaceFingerprint(db, bucket);
  const foreignRevoke = await proofRepository.revokeShare("old-proof-foreign", proofId);
  const activeAfterForeignRevoke = await proofRepository.getActiveShareByTokenHash("synthetic-retained-old-token-hash");
  assert.ok(activeAfterForeignRevoke);
  assert.deepEqual(activeAfterForeignRevoke, activeBeforeForeignRevoke);
  const foreignRevokeAfter = await proofSurfaceFingerprint(db, bucket);
  const ownerRevoke = await proofRepository.revokeShare("old-proof", proofId);
  const replayRevoke = await proofRepository.revokeShare("old-proof", proofId);
  const shareWriteCount = await count(db, "SELECT count(*) count FROM public_proof_shares WHERE user_id=?1 AND proof_id=?2", "old-proof", proofId);
  return {
    storage: { migrationHashes: migrations.map(({ filename, sha256: hash }) => ({ filename, sha256: hash })), legacyTableCount: LEGACY_TABLES.length, legacyRowCount: legacyRowCount(), legacyObjectCount: LEGACY_OBJECTS.length, legacyRowsBeforeHash: rowsBefore, legacyRowsAfterHash: rowsAfter, legacyObjectsBeforeHash: objectsBefore, legacyObjectsAfterHash: objectsAfter },
    legacy: { unchangedReadAfterUpgrade: canonicalHash(snapshotsBefore) === canonicalHash(snapshotsAfter), ownerSnapshotHashesBefore: snapshotsBefore, ownerSnapshotHashesAfter: snapshotsAfter,
      operations: {
        setup: { idempotencyReceiptCount: setupReceiptCount, replayEqual: canonicalHash(setupFirst) === canonicalHash(setupReplay) },
        completion: { learningEventCount: completionEventCount, proofRootCount: completionProofCount, idempotencyReceiptCount: completionReceiptCount, replayEqual: canonicalHash(completionFirst) === canonicalHash(completionReplay) },
        imports: { conflictStatus: conflict.status, archiveStatus: archivedImport.status, activateStatus: activatedImport.status,
          activateReplayStatus: activatedReplay.status, activeRole: activeImportGoal?.role_id ?? null, archivedGoalCount,
          freshReadMatchesActiveRole: freshImportRead?.state.setup.roleId === activeImportGoal?.role_id,
          nonTargetOwnerHashBefore: nonTargetBefore, nonTargetOwnerHashAfter: nonTargetAfter },
        proof: { ownedRead: { owner: Boolean(ownedProof), foreign: foreignProof }, assetRead: { owner: Boolean(ownedAsset), foreign: foreignAsset,
          bodyHashMatches: sha256(storedBytes) === sha256(assetBytes), contentTypeMatches: storedHead.httpMetadata?.contentType === "text/plain",
          sizeMetadataMatches: storedHead.customMetadata?.sizeBytes === String(assetBytes.byteLength) },
          shareRevoke: { owner: ownerRevoke, replay: replayRevoke, foreign: foreignRevoke },
          foreignRevokePreservedActiveShare: Boolean(activeAfterForeignRevoke),
          negativeIsolation: {
            foreignProofRead: { rowsBeforeHash: foreignProofBefore.rowsHash, rowsAfterHash: foreignProofAfter.rowsHash,
              objectsBeforeHash: foreignProofBefore.objectsHash, objectsAfterHash: foreignProofAfter.objectsHash },
            foreignAssetRead: { rowsBeforeHash: foreignAssetBefore.rowsHash, rowsAfterHash: foreignAssetAfter.rowsHash,
              objectsBeforeHash: foreignAssetBefore.objectsHash, objectsAfterHash: foreignAssetAfter.objectsHash },
            foreignRevoke: { rowsBeforeHash: foreignRevokeBefore.rowsHash, rowsAfterHash: foreignRevokeAfter.rowsHash,
              objectsBeforeHash: foreignRevokeBefore.objectsHash, objectsAfterHash: foreignRevokeAfter.objectsHash,
              activeShareNonNull: Boolean(activeBeforeForeignRevoke && activeAfterForeignRevoke),
              activeShareBeforeHash: canonicalHash(activeBeforeForeignRevoke), activeShareAfterHash: canonicalHash(activeAfterForeignRevoke) },
          }, shareWriteCount },
      } },
  };
}

async function prepareCurrentDb(runtime, name, migrations) {
  const db = await runtime.getD1Database(name); await db.prepare("PRAGMA foreign_keys=ON").run(); await applyMigrations(db, migrations); return db;
}

async function preparePrimaryCurrentDb(runtime, migrations) {
  const db = await runtime.getD1Database("V8_PRIMARY_DB");
  const bucket = await runtime.getR2Bucket("V8_PRIMARY_BUCKET");
  await db.prepare("PRAGMA foreign_keys=ON").run();
  await applyMigrations(db, migrations, 0, 2);
  await seedLegacy(db, bucket);
  const rows = await snapshotLegacyFixtureRows(db);
  const objects = await snapshotObjects(bucket, LEGACY_OBJECTS.map(({ key }) => key));
  assert.equal(Object.keys(rows).length, LEGACY_TABLES.length);
  assert.ok(Object.values(rows).every((tableRows) => tableRows.length > 0));
  assert.equal(Object.values(rows).reduce((sum, tableRows) => sum + tableRows.length, 0), legacyRowCount());
  assert.equal(objects.length, LEGACY_OBJECTS.length);
  await applyMigrations(db, migrations, 2);
  return {
    db, bucket,
    rowsBeforeHash: canonicalHash(rows),
    objectsBeforeHash: canonicalHash(objects),
  };
}

async function runCurrentLifecycle(runtime, archive, migrations, fixtureModule) {
  const CloudService = archive.modules["app/server/cloud/service.ts"].CloudService;
  const D1CloudRepository = archive.modules["app/server/cloud/d1-cloud-repository.ts"].D1CloudRepository;
  const OldProofRepository = archive.modules["app/server/proof/d1-proof-repository.ts"].D1ProofRepository;
  const oldViews = archive.modules["app/server/proof/public-view.ts"];
  const disposals = [];
  try {
    const primary = await preparePrimaryCurrentDb(runtime, migrations);
    const { db: primaryDb, bucket: primaryBucket } = primary;
    const fixture = await fixtureModule.createRetainedV8Fixture(primaryDb); disposals.push(() => fixture.app.dispose());
    const primaryRowsAfterV8 = canonicalHash(await snapshotLegacyFixtureRows(primaryDb));
    const primaryObjectsAfterV8 = canonicalHash(await snapshotObjects(primaryBucket, LEGACY_OBJECTS.map(({ key }) => key)));
    assert.equal(primaryRowsAfterV8, primary.rowsBeforeHash);
    assert.equal(primaryObjectsAfterV8, primary.objectsBeforeHash);
    const oldCloud = new CloudService(new D1CloudRepository(primaryDb, deterministicOptions()));
    const oldProof = new OldProofRepository(primaryDb, () => FIXED_TIME.getTime());
    const currentProof = fixtureModule.currentProofRepository(primaryDb);
    const newTables = (await tableNames(primaryDb)).filter((name) => !LEGACY_TABLES.includes(name));
    const archivedRead = await oldCloud.getWorkspace(fixture.owner); assert.ok(archivedRead);
    const compatibilityRoot = await oldProof.getOwnedProof(fixture.owner, fixture.proofId); assert.ok(compatibilityRoot);
    const latestBeforeWithdraw = fixture.revised.workspace.versions.filter(({ proofId }) => proofId === fixture.proofId).sort((a, b) => b.versionNumber - a.versionNumber)[0]; assert.ok(latestBeforeWithdraw);
    const strictBefore = canonicalHash(await snapshotRows(primaryDb));
    const primaryNewBeforeStrict = await newTableFingerprint(primaryDb, newTables);
    let strictIntentRejected = false;
    try { await oldCloud.saveSetup(fixture.owner, { mutationId: "retained-strict-intent", intent: "research-setup", setup: { ...fixture.state.setup, weeklyMinutes: 390 } }); }
    catch (error) { strictIntentRejected = error?.name === "ZodError" && error.issues?.some(({ code, keys }) => code === "unrecognized_keys" && keys?.includes("intent")); }
    const strictAfter = canonicalHash(await snapshotRows(primaryDb));
    const primaryNewAfterStrict = await newTableFingerprint(primaryDb, newTables);
    const titleView = fixtureModule.buildCurrentPublicView({ version: latestBeforeWithdraw, status: "demonstrated", skillNames: ["Synthetic skill"], fields: ["title", "status", "summary"] });
    await currentProof.upsertShare({ id: "v8-share-title", userId: fixture.owner, proofId: fixture.proofId, tokenHash: "synthetic-v8-title-hash", publishedFields: ["title", "status", "summary"], publicView: titleView });
    const oldTitleView = oldViews.sanitizeStoredPublicProofView((await oldProof.getActiveShareByTokenHash("synthetic-v8-title-hash"))?.publicView);
    const statusView = fixtureModule.buildCurrentPublicView({ version: latestBeforeWithdraw, status: "demonstrated", skillNames: ["Synthetic skill"], fields: ["status", "summary"] });
    await currentProof.upsertShare({ id: "v8-share-status", userId: fixture.owner, proofId: fixture.proofId, tokenHash: "synthetic-v8-status-hash", publishedFields: ["status", "summary"], publicView: statusView });
    const oldStatusView = oldViews.sanitizeStoredPublicProofView((await oldProof.getActiveShareByTokenHash("synthetic-v8-status-hash"))?.publicView);
    const documentView = fixtureModule.buildCurrentPublicView({ version: latestBeforeWithdraw, status: "demonstrated", skillNames: ["Synthetic skill"], fields: ["kind"] });
    await currentProof.upsertShare({ id: "v8-share-document", userId: fixture.owner, proofId: fixture.proofId, tokenHash: "synthetic-v8-document-hash", publishedFields: ["kind"], publicView: documentView });
    const documentRejected = oldViews.sanitizeStoredPublicProofView((await oldProof.getActiveShareByTokenHash("synthetic-v8-document-hash"))?.publicView) === null;
    const oldFormat = oldViews.createPublicProofView(compatibilityRoot, ["title", "kind"]);
    const oldFormatNewBefore = await newTableFingerprint(primaryDb, newTables);
    await oldProof.upsertShare({ id: "old-format-share", userId: fixture.owner, proofId: fixture.proofId, tokenHash: "synthetic-old-format-hash", publishedFields: ["title", "kind"], publicView: oldFormat });
    const oldFormatCurrent = fixtureModule.sanitizeCurrentPublicView((await currentProof.getActiveShareByTokenHash("synthetic-old-format-hash"))?.publicView);
    const oldFormatNewAfter = await newTableFingerprint(primaryDb, newTables);
    await currentProof.upsertShare({ id: "v8-revoke-share", userId: fixture.owner, proofId: fixture.proofId, tokenHash: "synthetic-v8-revoke-hash", publishedFields: ["title"], publicView: titleView });
    const oldRevokeNewBefore = await newTableFingerprint(primaryDb, newTables);
    const oldRevoke = await oldProof.revokeShare(fixture.owner, fixture.proofId); const revokedActive = await currentProof.getActiveShareByTokenHash("synthetic-v8-revoke-hash");
    const oldRevokeNewAfter = await newTableFingerprint(primaryDb, newTables);
    await currentProof.upsertShare({ id: "v8-survive-share", userId: fixture.owner, proofId: fixture.proofId, tokenHash: "synthetic-v8-survive-hash", publishedFields: ["title"], publicView: titleView });
    const publicBeforeWithdrawal = await currentProof.getActiveShareByTokenHash("synthetic-v8-survive-hash");
    assert.ok(publicBeforeWithdrawal);
    const privateResult = await fixture.setPrivate();
    const withdrawn = await fixture.withdraw(privateResult.workspace.revision);
    const publicAfterWithdrawal = await currentProof.getActiveShareByTokenHash("synthetic-v8-survive-hash");
    assert.ok(publicAfterWithdrawal);
    const rootAfterWithdrawal = await oldProof.getOwnedProof(fixture.owner, fixture.proofId); assert.ok(rootAfterWithdrawal);
    const postWithdrawalOldView = oldViews.createPublicProofView(rootAfterWithdrawal, ["title"]);
    const postWithdrawalNewBefore = await newTableFingerprint(primaryDb, newTables);
    await oldProof.upsertShare({ id: "old-post-withdrawal-share", userId: fixture.owner, proofId: fixture.proofId, tokenHash: "synthetic-old-post-withdrawal-hash", publishedFields: ["title"], publicView: postWithdrawalOldView });
    const postWithdrawalShare = await oldProof.getActiveShareByTokenHash("synthetic-old-post-withdrawal-hash");
    const postWithdrawalNewAfter = await newTableFingerprint(primaryDb, newTables);
    const fallback = await fixtureModule.verifyDisabledResearchAdmission(fixture);
    const primaryRowsAfterMixed = canonicalHash(await snapshotLegacyFixtureRows(primaryDb));
    const primaryObjectsAfterMixed = canonicalHash(await snapshotObjects(primaryBucket, LEGACY_OBJECTS.map(({ key }) => key)));
    assert.equal(primaryRowsAfterMixed, primary.rowsBeforeHash);
    assert.equal(primaryObjectsAfterMixed, primary.objectsBeforeHash);

    const completionDb = await prepareCurrentDb(runtime, "V8_COMPLETION_DB", migrations);
    const completionFixture = await fixtureModule.createRetainedPlanFixture(completionDb, "retained-completion-case"); disposals.push(() => completionFixture.app.dispose());
    const completionCurrentProof = await completionFixture.app.proof.create(completionFixture.owner, { mutationId: "retained-completion-existing-proof", baseRevision: 0, intent: "submit", validatorKey: null, dailyUnitId: completionFixture.unit.id, title: "Existing current proof", kind: "document", summary: "Existing current projection before an archived completion write.", artifactUrl: "https://example.com/existing-proof", assetId: null, skillIds: [completionFixture.unit.skillId], completionCriteria: completionFixture.unit.completionCriteria, visibility: "private" });
    assert.ok(completionCurrentProof.workspace.projections.length);
    const completionOld = new CloudService(new D1CloudRepository(completionDb, deterministicOptions()));
    const completionBefore = await completionFixture.app.planning.getWorkspaceResponse(completionFixture.owner);
    const completionNewBefore = await newTableFingerprint(completionDb, newTables);
    const oldCompletionRequest = { mutationId: "retained-v8-old-completion", unitId: completionFixture.unit.id, title: "Retained current-plan unit", deliverable: "Retained current-plan completion artifact", skillIds: [completionFixture.unit.skillId] };
    const oldCompletionResult = await completionOld.recordCompletion(completionFixture.owner, oldCompletionRequest);
    await completionOld.recordCompletion(completionFixture.owner, oldCompletionRequest);
    const completionAfter = await completionFixture.app.planning.getWorkspaceResponse(completionFixture.owner);
    const completionNewAfter = await newTableFingerprint(completionDb, newTables);
    const oldCompletionRoot = await completionDb.prepare("SELECT title,kind,verified FROM proof_items WHERE user_id=?1 AND source_task_id=?2").bind(completionFixture.owner, completionFixture.unit.id).first();

    const setupDb = await prepareCurrentDb(runtime, "V8_SETUP_DB", migrations);
    const setupFixture = await fixtureModule.createRetainedPlanFixture(setupDb, "retained-setup-case"); disposals.push(() => setupFixture.app.dispose());
    const setupOld = new CloudService(new D1CloudRepository(setupDb, deterministicOptions()));
    const setupBefore = await setupFixture.app.planning.getWorkspaceResponse(setupFixture.owner);
    const setupNewBefore = await newTableFingerprint(setupDb, newTables);
    await setupOld.saveSetup(setupFixture.owner, { mutationId: "retained-v8-old-setup", setup: { ...setupFixture.state.setup, weeklyMinutes: 300 } });
    const setupGoal = await setupDb.prepare("SELECT weekly_minutes FROM career_goals WHERE user_id=?1 AND active_slot=1").bind(setupFixture.owner).first();
    const setupAfter = await setupFixture.app.planning.getWorkspaceResponse(setupFixture.owner);
    const setupNewAfter = await newTableFingerprint(setupDb, newTables);

    const activateDb = await prepareCurrentDb(runtime, "V8_ACTIVATE_DB", migrations);
    const activateFixture = await fixtureModule.createRetainedPlanFixture(activateDb, "retained-activate-case"); disposals.push(() => activateFixture.app.dispose());
    const controlFixture = await fixtureModule.createAdditionalPlanFixture(activateFixture.app, "owner-b", "retained-nontarget-case");
    const controlProof = await activateFixture.app.proof.create(controlFixture.owner, { mutationId: "retained-control-proof", baseRevision: 0, intent: "submit", validatorKey: null, dailyUnitId: controlFixture.unit.id, title: "Non-target continuity proof", kind: "document", summary: "Synthetic non-target owner evidence.", artifactUrl: "https://example.com/control-proof", assetId: null, skillIds: [controlFixture.unit.skillId], completionCriteria: controlFixture.unit.completionCriteria, visibility: "private" });
    assert.ok(controlProof.workspace.versions.length);
    const activationProof = await activateFixture.app.proof.create(activateFixture.owner, { mutationId: "retained-activate-proof", baseRevision: 0, intent: "submit", validatorKey: null, dailyUnitId: activateFixture.unit.id, title: "Activation continuity proof", kind: "document", summary: "Synthetic proof retained under an archived current-plan goal.", artifactUrl: "https://example.com/activation-proof", assetId: null, skillIds: [activateFixture.unit.skillId], completionCriteria: activateFixture.unit.completionCriteria, visibility: "private" });
    assert.ok(activationProof.workspace.versions.length);
    const activateOld = new CloudService(new D1CloudRepository(activateDb, deterministicOptions()));
    const nonTargetBefore = await ownerFingerprint(activateDb, "owner-b");
    const nonTargetRows = await ownerRowCount(activateDb, "owner-b");
    const activateNewBefore = await newTableFingerprint(activateDb, newTables);
    const planProofCountsBefore = await activateDb.prepare("SELECT (SELECT count(*) FROM planning_workspaces WHERE user_id=?1) plans,(SELECT count(*) FROM proof_versions WHERE user_id=?1) proofs").bind(activateFixture.owner).first();
    await activateOld.importLocalState(activateFixture.owner, { migrationId: "retained-old-activation", consent: true, conflictResolution: "activate-import", state: baseState("synthetic-retained-replacement-role") });
    const activeWorkspaceAfter = (await activateFixture.app.planning.getWorkspaceResponse(activateFixture.owner)).workspace;
    const planProofCountsAfter = await activateDb.prepare("SELECT (SELECT count(*) FROM planning_workspaces WHERE user_id=?1) plans,(SELECT count(*) FROM proof_versions WHERE user_id=?1) proofs").bind(activateFixture.owner).first();
    const activateNewAfter = await newTableFingerprint(activateDb, newTables);
    const nonTargetAfter = await ownerFingerprint(activateDb, "owner-b");
    const primaryCounts = await primaryDb.prepare("SELECT (SELECT count(*) FROM research_runs WHERE user_id=?1) research,(SELECT count(*) FROM ai_budget_buckets) budget_buckets,(SELECT count(*) FROM ai_budget_reservations) budget_reservations,(SELECT count(*) FROM planning_events WHERE user_id=?1) planning,(SELECT count(*) FROM proof_versions WHERE user_id=?1) versions,(SELECT count(*) FROM proof_review_events WHERE user_id=?1) reviews").bind(fixture.owner).first();
    const latestStatus = withdrawn.workspace.reviews.filter(({ proofId }) => proofId === fixture.proofId).sort((a, b) => b.sequence - a.sequence)[0]?.stateAfter;
    const [primaryHealth, completionHealth, setupHealth, activationHealth] = await Promise.all([
      databaseHealth(primaryDb), databaseHealth(completionDb), databaseHealth(setupDb), databaseHealth(activateDb),
    ]);
    return {
      current: { fakeProviderCalls: fixture.app.counters.fakeResearchCalls, researchRunCount: Number(primaryCounts.research), researchBudgetBucketCount: Number(primaryCounts.budget_buckets), researchBudgetReservationCount: Number(primaryCounts.budget_reservations), planningEventCount: Number(primaryCounts.planning), proofVersionCount: Number(primaryCounts.versions), proofReviewCount: Number(primaryCounts.reviews), compatibilityRoot: { title: compatibilityRoot.title, kind: compatibilityRoot.kind, verified: compatibilityRoot.verified }, latestVersion: { title: latestBeforeWithdraw.title, versionNumber: latestBeforeWithdraw.versionNumber }, latestStatus },
      comparisons: {
        archivedMissesV8Completion: !archivedRead.state.completedUnitIds.includes(fixture.unit.id),
        oldCompletionLeavesPlanningStateUnchanged: canonicalHash(completionBefore) === canonicalHash(completionAfter),
        oldCompletionCreatesVerifiedLegacyRoot: oldCompletionResult.state.completedUnitIds.includes(completionFixture.unit.id) && oldCompletionRoot?.kind === "completion" && Boolean(oldCompletionRoot?.verified),
        oldSetupChangesGoalMinutes: Number(setupGoal?.weekly_minutes) === 300,
        oldSetupLeavesAvailabilityAndPlanUnchanged: canonicalHash(setupBefore) === canonicalHash(setupAfter),
        oldActivationArchivesPlannedGoal: await count(activateDb, "SELECT count(*) count FROM career_goals WHERE user_id=?1 AND status='archived' AND id IN (SELECT goal_id FROM planning_workspaces WHERE user_id=?1)", activateFixture.owner) === 1,
        currentActiveWorkspaceAfterOldActivation: activeWorkspaceAfter,
        oldActivationPreservesPlanAndProofRows: canonicalHash(planProofCountsBefore) === canonicalHash(planProofCountsAfter),
        strictIntentRejectedWithoutWrites: strictIntentRejected && strictBefore === strictAfter,
        newTablesPreservedAcrossOldOperations: completionNewBefore === completionNewAfter && setupNewBefore === setupNewAfter && activateNewBefore === activateNewAfter,
        primaryResearchBudgetPreservedAcrossOldOperations: primaryNewBeforeStrict === primaryNewAfterStrict && oldFormatNewBefore === oldFormatNewAfter && oldRevokeNewBefore === oldRevokeNewAfter && postWithdrawalNewBefore === postWithdrawalNewAfter,
        nonTargetOwnerPreserved: nonTargetBefore === nonTargetAfter,
        nonTargetOwnerRowCount: nonTargetRows,
      },
      publicViews: { titleBearingV8OldView: oldTitleView, statusSummaryOnlyOldView: oldStatusView, documentKindOldRejected: documentRejected, oldFormatCurrentView: oldFormatCurrent, oldRevokeOfV8ShareEffective: oldRevoke && revokedActive === null, existingSnapshotNonNullBeforeAfter: Boolean(publicBeforeWithdrawal && publicAfterWithdrawal), existingSnapshotSurvivesWithdrawal: canonicalHash(publicBeforeWithdrawal) === canonicalHash(publicAfterWithdrawal), withdrawnOldRootStillReadable: Boolean(rootAfterWithdrawal), trustedOldShareCreatedAfterWithdrawal: Boolean(postWithdrawalShare) },
      researchAdmissionFallback: fallback,
      primaryMixedBaseline: {
        identity: { tableCount: LEGACY_TABLES.length, rowCount: legacyRowCount(), objectCount: LEGACY_OBJECTS.length },
        rowsBeforeHash: primary.rowsBeforeHash, rowsAfterV8Hash: primaryRowsAfterV8, rowsAfterMixedHash: primaryRowsAfterMixed,
        objectsBeforeHash: primary.objectsBeforeHash, objectsAfterV8Hash: primaryObjectsAfterV8, objectsAfterMixedHash: primaryObjectsAfterMixed,
      },
      currentDatabaseHealth: { primary: primaryHealth, completion: completionHealth, setup: setupHealth, activation: activationHealth },
      evidence: { activateNewTableHashBefore: activateNewBefore, activateNewTableHashAfter: activateNewAfter },
    };
  } finally {
    const cleanup = await Promise.allSettled(disposals.reverse().map((dispose) => dispose()));
    if (cleanup.some(({ status }) => status === "rejected")) throw new Error("Retained current fixture cleanup failed");
  }
}

export async function runRetainedCompatibility() {
  const originalFetch = globalThis.fetch;
  let applicationOutboundAttempts = 0; let runtime; let vite; let result; let cleanupFailure = false;
  globalThis.fetch = async () => { applicationOutboundAttempts++; throw new Error("Outbound application fetch denied by retained compatibility harness"); };
  try {
    const [archive, migrations] = await Promise.all([loadRetainedArchive(), loadRetainedMigrations()]);
    const workerOutbound = { attempts: 0 };
    runtime = createRetainedRuntime(DATABASES, BUCKETS, workerOutbound);
    const legacyDb = await runtime.getD1Database("LEGACY_DB"); const legacyBucket = await runtime.getR2Bucket("LEGACY_BUCKET");
    const legacy = await runLegacyLifecycle(legacyDb, legacyBucket, archive, migrations);
    const audit = { resolved: 0, loaded: 0 };
    vite = await createOfflineVite({ plugins: [offlineAliases(), retainedResearchFactoryStub(audit)], optimizeDeps: { noDiscovery: true } });
    const fixtureModule = await vite.ssrLoadModule("/tests/offline-uat/retained-v8-fixture.ts");
    assert.ok(audit.resolved >= 1 && audit.loaded === 1);
    const loadedModuleIds = [...vite.moduleGraph.idToModuleMap.keys()].map((id) => id.replaceAll("\\", "/"));
    audit.realFactoryLoaded = loadedModuleIds.some((id) => /\/app\/server\/research\/service-factory\.ts(?:\?|$)/u.test(id));
    audit.realAdapterLoaded = loadedModuleIds.some((id) => /\/app\/server\/research\/openrouter-provider\.ts(?:\?|$)/u.test(id));
    assert.equal(audit.realFactoryLoaded, false); assert.equal(audit.realAdapterLoaded, false);
    const current = await runCurrentLifecycle(runtime, archive, migrations, fixtureModule);
    const health = await databaseHealth(legacyDb); const upgradedTableCount = (await tableNames(legacyDb)).length;
    assert.equal(upgradedTableCount, 41); assert.equal(applicationOutboundAttempts, 0); assert.equal(workerOutbound.attempts, 0);
    const differenceEvidence = {
      "archived-activation-detaches-active-v8-workspace": current.comparisons.oldActivationArchivesPlannedGoal && current.comparisons.currentActiveWorkspaceAfterOldActivation === null && current.comparisons.oldActivationPreservesPlanAndProofRows,
      "archived-completion-leaves-v8-planning-stale": current.comparisons.oldCompletionLeavesPlanningStateUnchanged && current.comparisons.oldCompletionCreatesVerifiedLegacyRoot,
      "archived-proof-root-stale-vs-ledger": current.current.compatibilityRoot.title !== current.current.latestVersion.title && current.current.compatibilityRoot.kind === "project" && current.current.compatibilityRoot.verified === false && current.current.latestStatus === "withdrawn",
      "archived-read-misses-planning-events": current.comparisons.archivedMissesV8Completion,
      "archived-schema-rejects-research-intent": current.comparisons.strictIntentRejectedWithoutWrites,
      "archived-setup-diverges-from-v8-plan": current.comparisons.oldSetupChangesGoalMinutes && current.comparisons.oldSetupLeavesAvailabilityAndPlanUnchanged,
      "public-share-schema-incompatible": current.publicViews.titleBearingV8OldView?.title === "Retained v8 proof revised" && current.publicViews.statusSummaryOnlyOldView === null && current.publicViews.documentKindOldRejected && current.publicViews.oldFormatCurrentView === null && current.publicViews.oldRevokeOfV8ShareEffective,
      "withdrawn-proof-old-share-creation-gap": current.publicViews.existingSnapshotSurvivesWithdrawal && current.publicViews.withdrawnOldRootStillReadable && current.publicViews.trustedOldShareCreatedAfterWithdrawal,
    };
    const differences = Object.entries(differenceEvidence).filter(([, observed]) => observed).map(([category]) => category);
    result = { archive: { commit: archive.commit, tree: archive.tree, verifiedSourceCount: archive.verifiedSourceCount, runtimeVersions: archive.runtimeVersions }, ...legacy, storage: { ...legacy.storage, ...health }, upgradedTableCount, ...current, differenceEvidence, differences, unsupported: ["legacy-proof-ledger-revise", "legacy-proof-ledger-withdraw", "legacy-proof-delete", "legacy-user-delete"], rollbackEligible: differences.length === 0, realProviderRequests: applicationOutboundAttempts + workerOutbound.attempts, archiveFactoryStub: audit };
  } finally {
    const cleanups = []; if (vite) cleanups.push(vite.close()); if (runtime) cleanups.push(runtime.dispose());
    cleanupFailure = (await Promise.allSettled(cleanups)).some(({ status }) => status === "rejected"); globalThis.fetch = originalFetch;
  }
  if (cleanupFailure) throw new Error("Retained compatibility cleanup failed");
  return { ...result, disposed: true };
}
