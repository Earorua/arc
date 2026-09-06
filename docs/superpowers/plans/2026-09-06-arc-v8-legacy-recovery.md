# Arc v8 Synthetic Legacy Recovery Implementation Plan

> **For agentic workers:** Use the approved superpowers:subagent-driven-development workflow. Root owns documents, verification and Git. One implementer writes the test-only rehearsal using TDD; independent specification review must pass before quality/security review. Do not redo product Tasks 1–12.

**Goal:** Demonstrate preservation and recovery of populated synthetic v7.2 data and Proof objects during a local v8 schema upgrade, including partial-upgrade failure.

**Architecture:** Pin archived 0000–0001 and pending 0002–0006 SQL by normalized SHA256. Use internally created nonpersistent Miniflare D1/R2, fixture-scoped logical snapshots and separate empty restore targets. No production code, credentials, external requests or new dependency.

**Tech Stack:** Existing Node >=22.13, node:test/assert/crypto, installed Miniflare/workerd, SQL and JavaScript modules.

Design: `docs/superpowers/specs/2026-09-06-arc-v8-legacy-recovery-design.md`. User continuation approves the next local rehearsal already described in the readiness report; existing worktree/branch selection and subagent workflow remain authoritative.

## Task 1: Implement the isolated rehearsal with TDD

**Files:**
- Create `tests/offline-uat/legacy-fixture.mjs`: seven pinned migrations and explicit deterministic fixture rows/object bytes; no runtime or production imports.
- Create `tests/offline-uat/legacy-recovery.mjs`: local lifecycle, apply/capture/validate/restore/preservation checks, bounded result summary. If storage snapshot operations need separation for readability, use `tests/offline-uat/legacy-snapshot.mjs` with that sole responsibility.
- Create `tests/offline-uat/legacy-recovery.test.mjs`: node:test integration and fault assertions over actual local workerd D1/R2.

- [x] Write assertions before implementation. A callable stub may throw `Error("Legacy recovery not implemented")` so RED is an explicit missing-behavior failure rather than an import/tooling error. Record actual command, assertion/failure and exit code, then replace the stub with minimum working behavior.

```js
import assert from "node:assert/strict";
import test from "node:test";
import { runLegacyRecoveryRehearsal } from "./legacy-recovery.mjs";

test("preserves populated v7.2 rows and objects through upgrade and separate recovery", async () => {
  const result = await runLegacyRecoveryRehearsal();
  assert.equal(result.legacyTableCount, 20);
  assert.equal(result.upgradedTableCount, 41);
  assert.equal(result.oldRowsPreserved, true);
  assert.equal(result.restoredRowsPreserved, true);
  assert.equal(result.objectsPreserved, true);
  assert.equal(result.interruptedUpgradeRecovered, true);
  assert.equal(result.disposed, true);
});
```

Run `node --test tests/offline-uat/legacy-recovery.test.mjs`; the initial missing implementation must fail. Continue behavior-first cycles for integrity rejection, drift and nonempty targets; do not add methods to application classes.

- [x] Implement fixture. Pin the archive identity and all seven normalized hashes from the reviewed readiness report. Read only fixed migration paths. Create all 20 old tables from 0000–0001; insert parents before children with fixed timestamps and synthetic values, including all specified owner/goal/task/Proof/share/quota/receipt cases. Put every attachment byte array into the local source R2 and assert metadata/bytes agree. Assert the exact table set and every fixture table is populated.

- [x] Implement capture/restore with explicit fixture scope. Read all legacy columns and rows in deterministic key order, `PRAGMA table_info`, `foreign_key_list`, and existing index definitions; capture objects referenced by every legacy `proof_assets` row. Preserve original JSON text and NULL. Canonicalize the snapshot for SHA256, validate the full snapshot/object integrity before target writes, reject a nonempty DB or bucket, create baseline tables/indexes, then bind every row value in parent-first order and restore object bytes. Never disable foreign keys to make a test pass. Fresh integrity and foreign-key checks must pass.

- [x] Implement normal upgrade and recovery. Apply only fixed 0002–0006 statement-breakpoint segments. Compare every old row/column/FK and retain every old index, allowing added indexes. Assert 41 final tables. Recover the baseline into a different local D1 and R2; compare old schema/rows/objects exactly before reapplying the suffix. This logical snapshot is built with no concurrent writes and is not Cloudflare native backup evidence.

- [x] Add failure assertions first, then minimum checks to pass. Use independent targets or captures so a previous successful write cannot mask corruption. Required actual behavior:

```js
await assert.rejects(() => restoreBaseline(emptyDb, emptyBucket, tamperedSnapshot), /integrity|checksum|object/i);
assert.equal(await countUserTables(emptyDb), 0);
assert.equal((await emptyBucket.list()).objects.length, 0);
await assert.rejects(() => restoreBaseline(populatedDb, populatedBucket, validSnapshot), /empty/i);
assert.deepEqual(await captureLegacy(populatedDb, populatedBucket), beforeRejectedRestore);
```

The actual implementation may name these small helpers to fit its modules, but tests must perform these independent before/after checks. Cover changed SQL hash, changed row, missing/changed object, and nonempty DB/bucket. For a partial upgrade, first commit 0002 plus part of 0003 in a separate restored DB, then execute known invalid SQL and observe failure. Assert some new schema exists and recovery from the original snapshot into a separate empty target succeeds before applying the full suffix. This is a fault rehearsal, not a new production migration runner.

- [x] Exercise actual constraints after upgrade. Confirm valid owner-scoped v8 rows can be written and duplicate active goal, duplicate legacy receipt identity, missing-owner FK and cross-owner new planning/Proof references fail. Capture before/after each rejected statement or atomic batch; no incorrect success or residue. Use supported SQL constraints rather than assuming old tables enforce composite ownership.

- [x] Keep runtime nonpersistent, use worker outbound denial, import no product Provider/auth/config modules, expose no external target flag, always dispose in `finally`, and only report counts/hashes/status after success. Failure must reject/exit nonzero. Do not use deprecated `D1Database.dump()` or remote Wrangler. No generic backup CLI, dependency changes or unrelated refactor.

- [x] Run focused node tests to GREEN and targeted lint. Implementer self-reviews and reports exact RED/GREEN evidence and changed paths; root commits after independent review.

## Task 2: Independent review and root verification

- [x] Specification reviewer reads actual implementation/tests against the design and Task 1 requirements, checks every old table is nonempty and all failure tests assert actual storage. Fix findings and re-review before quality review.
- [x] Quality/security reviewer checks isolation, restoration fidelity, resource disposal, error semantics, readonly fixed migration inputs, synthetic-only content and understandable module boundaries. Fix and re-review any blocking finding.
- [x] Root runs `node --test tests/offline-uat/legacy-recovery.test.mjs`, full `npm run test:unit`, nonincremental `node node_modules/typescript/bin/tsc --noEmit --incremental false`, `npm run lint`, and `git diff --check`. Because product source/build inputs do not change, repeat build/render checks only if implementation or findings expand that scope.
- [x] Root records actual counts, hashes, schema baseline, fault outcomes and runtime disposal in `docs/operations/v8-legacy-recovery-rehearsal.md`; updates the top of `docs/operations/v8-resume-checkpoint.md` and adds a dated follow-up to `docs/operations/v8-local-release-readiness.md` without rewriting older evidence as current execution.
- [ ] Review final diff, save exact intended files locally, ordinarily back up only the approved development branch to `https://github.com/Earorua/arc.git`, and verify remote/local SHA plus unchanged master. Never force, merge master, create a PR or deploy.

## Evidence

Starting branch and clean HEAD verified at `f2874d95aa5f8bbe48494aef3768be29c197dcee`. Existing application checks in the earlier readiness report remain historical; the completed new rehearsal, current regression and independent reviews are recorded below. Final source delivery and remote verification follow the approved backup scope.

- Readonly archive audit and root diff agree: archived `7ca5b530dfc58f3cbc700b44a7a881a9bd661209` 0000/0001 equal current SQL, with normalized hashes `1e92f53ce6aeec38c3c39d4e5c77f86d9e44d08a4b4f30d425094736b99cbde8` and `666fb7dc150a1106bd68726e4c8b6286c3908e56b8fc86c5518b2f8d4a384445`. The legacy FK graph is acyclic; forward references in CREATE statements do not justify disabling FKs for insertion.
- Fixture semantics checked against `app/server/cloud/d1-cloud-repository.ts`: `learning_events.task_id` and completion-created `proof_items.source_task_id` hold unit IDs, not `learning_tasks.id`; imported completed units need not have task rows, and imported Proof roots use NULL source IDs. The test fixture must distinguish these values.
- Old enum/boolean annotations are not SQL CHECK constraints, and separate legacy owner/goal FKs are not composite owner isolation. Validate fixture ownership explicitly, then test the new composite planning/Proof constraints after upgrade. Only three legacy indexes are appended by 0003/0004; compare stable index identity/definition, not transient `PRAGMA index_list.seq` positions.
- An interrupted prefix of 0003/0004 can contain child composite FKs before their parent unique index (created at the end of each file). The deliberately incomplete database need not pass FK checks; baseline, full upgrade, separate baseline restore and completed re-upgrade must. Recovery restores the original snapshot to a fresh target instead of blindly replaying CREATE statements over partial schema.
- Implementer RED: initial 0/1 (730.36 ms), then expanded 0/5 (77.83 ms), both exit 1 due missing implementation. Final implementer GREEN 5/5 in 38,551.39 ms and targeted ESLint passed. Root independently ran the final rehearsal: **5/5 in 38,478.01 ms**, exit 0; actual nonpersistent workerd **20→41 tables, 50 legacy rows, 2 objects, 27 tables at interruption, disposed=true**. Seven pre-restore rejections and six constraint/atomic-batch rejections are asserted inside the shared full rehearsal.
- Root fresh application regression: **137 files/2,641 tests, 74.95 s, exit 0**; nonincremental TypeScript and full lint exit 0. Product/build inputs are unchanged, so no repeat build/render claim. Workerd rejects full `PRAGMA integrity_check` with SQLITE_AUTH; actual supported `quick_check` plus `foreign_key_check`, full snapshot comparisons and constraint cases are used and reported explicitly. Independent reviews subsequently passed as recorded below.
- Independent specification review returned **READY, P0/P1/P2 0/0/0**. Subsequent independent quality/security review of the three new modules, rehearsal report and four document increments also returned **READY, 0/0/0**. It independently verified pinned migrations and fixture/object declarations; publication scan found no real credential/private payload. Both reviewers were read-only and did not claim a full runtime rerun or production evidence. Root finalizes the reviewed eight-file delivery and verified branch backup next.
