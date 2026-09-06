# Arc v8 Retained Compatibility Implementation Plan

> **For agentic workers:** Use the approved superpowers:subagent-driven-development workflow with TDD, independent specification review, then quality/security review. Root owns documents and all Git mutations. Preserve the authoritative worktree; do not redo Tasks 1–12.

**Goal:** Execute unchanged archived v7.2 services against upgraded synthetic data, classify actual compatibility, and derive evidence-based rollback conditions and release gates.

**Architecture:** Seven pinned Git blobs are loaded and transpiled only in memory with a closed import list. Actual nonpersistent Miniflare D1/R2 hosts legacy and mixed-v8 fixtures. Current services run through the existing offline composition; Fake provider only. This is a compatibility characterization, not a production runner or full archived website deployment.

**Tech Stack:** Installed Node, TypeScript 5.9.3, zod 4.4.3, node:test/assert/crypto, Vite and Miniflare. No installation or configuration changes.

Design: `docs/superpowers/specs/2026-09-06-arc-v8-retained-compatibility-design.md`. Start clean HEAD `271f957fad68b14c764c7432c97290bac641cabb`; user approved proceeding incrementally with available local work.

## Task 1: Archived source execution and actual storage characterization

**Files:**
- Create `tests/offline-uat/retained-source.mjs`: fixed commit/tree/path/blob manifest, read-only execFile Git loading, byte verification, in-memory TypeScript transpilation and closed CommonJS resolver.
- Create `tests/offline-uat/retained-compatibility.mjs`: migration validation, actual storage lifecycle, legacy fixture and checks, bounded classification result.
- Create `tests/offline-uat/retained-v8-fixture.ts`: current offline services generate mixed v8 data; run archived/current comparison with directly injected archived exports and disposable DB/bucket.
- Create `tests/offline-uat/retained-compatibility.test.mjs`: node:test assertions, shared full rehearsal and independent pure loader rejection tests.
- Only if necessary for module size, create `tests/offline-uat/retained-storage.mjs` for fixed fixture/migration/snapshot helpers. Do not modify existing recovery modules or product code.

- [ ] Write the first meaningful assertion and explicit stub before implementation; run to observe RED, report actual duration/exit/output. Expand expectations before adding behavior.

```js
import assert from "node:assert/strict";
import test from "node:test";
import { runRetainedCompatibility } from "./retained-compatibility.mjs";
test("classifies unchanged archived services against actual upgraded data", async () => {
  const result = await runRetainedCompatibility();
  assert.equal(result.archive.commit, "7ca5b530dfc58f3cbc700b44a7a881a9bd661209");
  assert.equal(result.archive.verifiedSourceCount, 7);
  assert.equal(result.legacy.unchangedReadAfterUpgrade, true);
  assert.equal(result.upgradedTableCount, 41);
  assert.equal(result.realProviderRequests, 0);
  assert.equal(result.disposed, true);
  assert.equal(typeof result.rollbackEligible, "boolean");
});
```

Run `node --test tests/offline-uat/retained-compatibility.test.mjs`. The stub throws `Retained compatibility not implemented`; an import failure or spawn EPERM is not the expected RED.

- [ ] Load the exact seven manifest files from the design via `execFile` argument arrays, never a shell command assembled from source input. Verify tree and Git blob SHA1 over `blob ${byteLength}\0` plus original bytes before any evaluation. Enforce installed zod/TypeScript version expectations, fixed root and manifest-only resolver; reject unknown module/source drift with independent tests. No runtime source modification, tsconfig/env reads, checkout or temporary source extraction.
- [ ] Create internally held nonpersistent D1/R2. Reuse existing `LEGACY_ROWS`, `LEGACY_OBJECTS`, `RESTORE_ORDER`, `MIGRATIONS`; verify seven migration hashes before writes. Insert old fixture before suffix. Compare archived CloudService snapshots for both owners before/after suffix plus complete old row/object fingerprints and healthy final 41-table schema.
- [ ] Exercise real legacy operations with synthetic IDs and a fixed injected old clock/ID generator: setup edit and replay; completion and replay; import conflict and archive/activate resolutions on isolated owners; old metadata and R2 storage upload/read; share create/read/revoke/revoke replay. Assert owner isolation for owned Proof/asset reads and revoke, complete non-target owner preservation, and no duplicate idempotent writes. Use actual services, not rewritten old SQL logic; SQL remains fixture/snapshot/assertion machinery.
- [ ] Use `createOfflineVite` (config/env disabled) to load `retained-v8-fixture.ts`. Reuse `createOfflineComposition` and `offlinePlanningRequest` for current Fake research, current setup activation and planning, completion, Proof submit/revise/withdraw. Never construct OpenRouter adapter, read production runtime/env or issue real GET/POST. Ensure current-created fixture services are disposed even if assertions fail.
- [ ] Compare archived and current reads of current completion and Proof versions/states. Test archived completion, setup edit and activate-import on isolated current plans. Derive evidence from actual old return, relevant database rows before/after, and fresh current service reads. Capture new table snapshots (including Research/budget) before old operations and distinguish preservation from semantic consistency.
- [ ] Test share format compatibility with archived/current actual public-view functions and repository-persisted rows: v8 status/summary-only shape, old format re-read by current sanitizer, and old root visibility after current withdrawal. Do not claim absent legacy edit/delete endpoints exist or bypass application ownership by treating raw repository calls as public API requests.
- [ ] Derive `rollbackEligible` from concrete observed differences; if divergence exists return false with stable difference categories and tests that verify underlying data, not just a hardcoded result. Initial source suggests missing planning completions, stale Proof root data, unguarded setup/activation and incompatible public-view schemas; investigate actual outcomes without changing archive or product to force green.
- [ ] Deny worker and application outbound; restore global fetch in finally; close Vite and all Miniflare resources even if another close fails. Report success only after cleanup. Output bounded counts/hashes/classifications, no fixture rows, payloads or tokens.
- [ ] Run focused test to GREEN and targeted lint; self-review then report exact RED/GREEN, files and limitations. Root verifies actual diff before reviews.

## Task 2: Independent review, rollback guidance and source backup

**Files:**
- Create `docs/operations/v8-retained-compatibility.md`: exact archive/runtime identity, test evidence and compatibility matrix, explicit unsafe/unsupported cases and scope limits.
- Create `docs/operations/v8-release-gates.md`: ordered operational decisions, local evidence mapping and external acceptance conditions; no production actions or secrets.
- Update top of `docs/operations/v8-resume-checkpoint.md` and dated follow-up in `docs/operations/v8-local-release-readiness.md`.
- Update this plan with actual evidence and completed checkboxes.

- [ ] Root reviews output and actual source; records observed compatible and incompatible cases separately. Draft operational decisions only after runtime evidence, using the design's second deliverable. Do not call an unsafe downgrade ready or label synthetic checks as live acceptance.
- [ ] Independent specification reviewer reads implementation and result documentation against every design requirement. Resolve findings and re-review before quality review.
- [ ] Independent quality/security reviewer checks archived identity, input closure, isolation, actual assertions, cleanup, documentation truth and approved public backup contents. Resolve findings and re-review.
- [ ] Root runs focused node:test, full unit regression, nonincremental typecheck, full lint and diff checks. Re-run the prior recovery suite only if shared inputs/helpers change or findings require it. Product/build inputs remain unchanged; do not repeat build/render without a new reason or claim new CI success.
- [ ] Save exact reviewed files locally and ordinary fast-forward backup only `codex/v8-openrouter-research-beta` to the already approved PUBLIC `https://github.com/Earorua/arc.git`. Verify final local/remote SHA, clean worktrees and unchanged master. No force push, merge, PR, tags, Sites save or deploy.

## Evidence

- Root verified authoritative worktree, branch and clean start SHA. Independent read-only archive audit is in progress; implementation and runtime results are not yet available.
- Source inspection establishes the old service has no Proof ledger revise/withdraw/delete/user-delete method; current Proof mutation only inserts the legacy root initially, and current public snapshot has a distinct versioned schema. These are hypotheses to validate with actual stored data, not completed compatibility evidence.
