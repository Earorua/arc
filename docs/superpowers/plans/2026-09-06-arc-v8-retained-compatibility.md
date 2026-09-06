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

- [x] Write the first meaningful assertion and explicit stub before implementation; run to observe RED, report actual duration/exit/output. Expand expectations before adding behavior.

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

- [x] Load the exact seven manifest files from the design via `execFile` argument arrays, never a shell command assembled from source input. Verify tree and Git blob SHA1 over `blob ${byteLength}\0` plus original bytes before any evaluation. Enforce installed zod/TypeScript version expectations, fixed root and manifest-only resolver; reject unknown module/source drift with independent tests. No runtime source modification, tsconfig/env reads, checkout or temporary source extraction.
- [x] Create internally held nonpersistent D1/R2. Reuse existing `LEGACY_ROWS`, `LEGACY_OBJECTS`, `RESTORE_ORDER`, `MIGRATIONS`; verify seven migration hashes before writes. Insert old fixture before suffix. Compare archived CloudService snapshots for both owners before/after suffix plus complete old row/object fingerprints and healthy final 41-table schema.
- [x] Exercise real legacy operations with synthetic IDs and a fixed injected old clock/ID generator: setup edit and replay; completion and replay; import conflict and archive/activate resolutions on isolated owners; old metadata and R2 storage upload/read; share create/read/revoke/revoke replay. Assert owner isolation for owned Proof/asset reads and revoke, complete non-target owner preservation, and no duplicate idempotent writes. Use actual services, not rewritten old SQL logic; SQL remains fixture/snapshot/assertion machinery.
- [x] Use `createOfflineVite` (config/env disabled) to load `retained-v8-fixture.ts`. Reuse `createOfflineComposition` and `offlinePlanningRequest` for current Fake research, current setup activation and planning, completion, Proof submit/revise/withdraw. Add a test-only exact resolver for the indirectly imported `app/server/research/service-factory.ts`: its virtual factory may return an inert object because routes construct it during module initialization, but every production method throws if invoked. Preserve existing offline auth/cloudflare aliases. Assert loaded module IDs exclude the real factory and OpenRouter adapter. Never construct OpenRouter adapter, read production runtime/env or issue real GET/POST. Ensure current-created fixture services are disposed even if assertions fail.
- [x] Compare archived and current reads of current completion and Proof versions/states. Test archived completion, setup edit and activate-import on isolated current plans. Derive evidence from actual old return, relevant database rows before/after, and fresh current service reads. Capture new table snapshots (including Research/budget) before old operations and distinguish preservation from semantic consistency.
- [x] Test share format compatibility with archived/current actual public-view functions and repository-persisted rows: v8 status/summary-only shape, old format re-read by current sanitizer, and old root visibility after current withdrawal. Do not claim absent legacy edit/delete endpoints exist or bypass application ownership by treating raw repository calls as public API requests.
- [x] With the existing v8 fixture, configure only the in-process composition as disabled. Dispatch a valid same-origin, owner-scoped JSON Research POST and assert the actual unavailable response; saved terminal Research, planning and Proof remain available with no additional Fake calls. This supports retaining v8 when new admission is closed, not a real flag change or an assertion that all Research GET operations are database-readonly.
- [x] Derive `rollbackEligible` from concrete observed differences; if divergence exists return false with stable difference categories and tests that verify underlying data, not just a hardcoded result. Initial source suggests missing planning completions, stale Proof root data, unguarded setup/activation and incompatible public-view schemas; investigate actual outcomes without changing archive or product to force green.
- [x] Deny worker and application outbound; restore global fetch in finally; close Vite and all Miniflare resources even if another close fails. Report success only after cleanup. Output bounded counts/hashes/classifications, no fixture rows, payloads or tokens.
- [x] Run focused test to GREEN and targeted lint; self-review then report exact RED/GREEN, files and limitations. Root verifies actual diff before reviews.

## Task 2: Independent review, rollback guidance and source backup

**Files:**
- Create `docs/operations/v8-retained-compatibility.md`: exact archive/runtime identity, test evidence and compatibility matrix, explicit unsafe/unsupported cases and scope limits.
- Create `docs/operations/v8-release-gates.md`: ordered operational decisions, local evidence mapping and external acceptance conditions; no production actions or secrets.
- Update top of `docs/operations/v8-resume-checkpoint.md` and dated follow-up in `docs/operations/v8-local-release-readiness.md`.
- Update this plan with actual evidence and completed checkboxes.

- [x] Root reviews output and actual source; records observed compatible and incompatible cases separately. Draft operational decisions only after runtime evidence, using the design's second deliverable. Do not call an unsafe downgrade ready or label synthetic checks as live acceptance.
- [x] Independent specification reviewer reads implementation and result documentation against every design requirement. Resolve findings and re-review before quality review.
- [x] Independent quality/security reviewer checks archived identity, input closure, isolation, actual assertions, cleanup, documentation truth and approved public backup contents. Resolve findings and re-review.
- [x] Root runs focused node:test, full unit regression, nonincremental typecheck, full lint and diff checks. Re-run the prior recovery suite only if shared inputs/helpers change or findings require it. Product/build inputs remain unchanged; do not repeat build/render without a new reason or claim new CI success.
- [ ] Save exact reviewed files locally and ordinary fast-forward backup only `codex/v8-openrouter-research-beta` to the already approved PUBLIC `https://github.com/Earorua/arc.git`. Verify final local/remote SHA, clean worktrees and unchanged master. No force push, merge, PR, tags, Sites save or deploy.

## Evidence

- Root verified authoritative worktree, branch and clean start `271f957fad68b14c764c7432c97290bac641cabb`. Initial design/plan commit `3ce529ab34c5976f9860c8821317019d2c917728`; independent read-only archive audit completed.
- First meaningful RED: 0/1, exit 1, TAP 263.484 ms, wall 1.575 s, expected `Retained compatibility not implemented`. The preceding sandbox spawn EPERM was not valid RED. No claim that every expanded assertion had its own RED.
- Root initial focused GREEN: 3/3, exit 0, TAP 30,383.445 ms (one full rehearsal case 29,472.9528 ms plus two pure loader tests). Application regression: 137 files / 2,641 tests, 53.74 s, exit 0. Nonincremental TypeScript and full lint exit 0.
- Actual runtime yields eight differences and `rollbackEligible: false`; five databases pass quick_check/FK, non-target owner has 54 preserved rows, real factory/adapter remain unloaded, disabled-admission POST returns 503 with existing data preserved and zero additional Fake calls.
- Specification review identified three P2 evidence gaps: missing original legacy baseline in mixed current DB, incomplete foreign negative row/object comparison, and potentially vacuous null public snapshot equality. Root verified findings; implementer added expected evidence assertions before changes and observed a second RED (2 loader pass / 1 full rehearsal fail at absent `primaryMixedBaseline.identity`, TAP 27.135 s, wall 27.619 s, exit 1).
- Corrections seed the primary legacy baseline before the suffix and compare all 50 original fixed-primary-key rows and two objects after current generation and mixed operations; foreign negatives fingerprint complete relevant Proof tables/all bucket objects, with non-null exact active-share equality; withdrawal reads must be non-null. Implementer corrected GREEN: 3/3, TAP 38.030 s, full rehearsal 37.071 s, exit 0; targeted lint and nonincremental types pass. Code re-review finds all three gaps resolved. Root final focused rerun passes 3/3, exit 0, 39,150.1438 ms (full case 38,078.8167 ms); final nonincremental types and full lint also exit 0. Independent specification review of final code/documents is 0/0/0 READY. Subsequent independent quality/security review is also 0/0/0 READY, with no fixes requested. Exact local commit and ordinary approved development-branch backup are pending.
- Archive Proof ledger revise/withdraw/delete/user-delete endpoints are absent and classified unsupported. Tests characterize unchanged archived services, not full archived HTTP/OAuth/browser/artifact compatibility. Existing public snapshots surviving withdrawal are intended; a new share through old trusted repositories is a different compatibility gap.
- On the user's current public-version question, read-only Sites metadata confirms v7.2/version 9 source and successful recorded deployment at the active/public URL. This is metadata evidence, not an artifact recovery or redeployment test. No Sites version save/deploy, production mutation, master integration, Provider request or credential access occurred.