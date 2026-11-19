# Materials course and native planning acceptance

> **For agentic workers:** Use `superpowers:subagent-driven-development` for bounded implementation and specification then quality review. Reuse existing accepted evidence; do not repeat broad tests without a changed dependency or a specific unresolved risk.

**Goal:** Finish the missing course evidence and all 14 native planning behavior bindings from the accepted November 9 checkpoint, without changing historical expected answers or initiating paid/remote work.

**Architecture:** Keep the frozen `materials-quality-v2` assets unchanged. A separately versioned acceptance package verifies the current course dependency binding and collects actual service records for legal native scenarios. Course topic matching and taught-task coverage remain separate; any product addition must derive from actual course content, preserve explicit user choices, and retain historical previews.

**Tech Stack:** Existing TypeScript services, Node 24, Vitest, local SQLite/Miniflare/workerd D1/R2, the existing outbound-blocking verification wrapper. No additional dependency or external model.

## Baseline and scope

- Resume branch: `codex/materials-replan-recovery-20261106`; local and fetched origin HEAD `3eeb5c3f203dd0ba9cf864fa2b7a48ce6a43bae6`, initially clean.
- Accepted application source: `2fad2850e447dd353c8d7a9587f114f60ce3dd01`. Reuse November 9's 10,009 Vitest, 290 Node and five render checks as historical evidence for that exact source; do not describe them as fresh November 19 runs.
- Fetched `origin/master`: `60e7cb6`; preserve its later UI and product fixes when integrating. No merge in the initial two tasks below.
- Both SOURCE_INDEX files have been read. Their `714ea9e` materials entry is historical and does not replace the later accepted checkpoint.
- Text resumes, one primary JD and supplementary text are in scope. PDF/OCR, new course authoring, universal natural-language coverage and expanding the test corpus are not release prerequisites.
- Real model calls, remote migration and deployment remain outside this offline batch. Expired R2/P1 authorizations are not renewed by resuming development.

## Task 1: Narrow course-reference binding

Completed 2026-11-19: five focused tests, targeted lint and actual capture/CLI passed; independent specification and code-quality reviews passed. The separate review receipt attests the immutable binding. Existing application source and all 26 historical reference assets are unchanged.

**Files:** new `docs/verification/materials-native-acceptance/course-binding.json`, `verify-course-binding.mjs`, `verify-course-binding.test.mjs`, and review evidence. Read-only: all existing `materials-quality-v2` assets and all application course objects.

- [x] Record the complete current capture with the unchanged `captureCourseReference` function; call its API, never its overwriting CLI.
- [x] Verify the reviewed snapshot, source/course ledgers and original corpus/basis byte hashes before reuse. Require exact equality of full role, blueprint, registry, inventory and course source files.
- [x] Permit only the specifically inspected old-to-current `app/contracts/planning.ts` dependency transition. Pin the complete new capture, every dependency and bundle; reject any additional drift, including same-version course edits.
- [x] Preserve the old loader's rejection of the new dependency. New binding must explicitly attest equivalence; it must not feed fabricated old bytes into the old loader or modify its hash constants.
- [x] Use small meaningful tests: accepted binding, changed course/dependency rejection, corrupted frozen reference rejection. Reuse the already reviewed course semantic judgments.
- [x] Review the actual schema change and new verifier, then publish the reviewed binding receipt. This does not approve model quality or the release Gate.

## Task 2: Native bindings for the existing 14 behaviors

Protocol and its independent review are complete in `docs/verification/materials-native-acceptance/planning-protocol.md`. Execute the native collection after Task 3 settles, so course/preview changes do not trigger an immediate duplicate run.

**Files:** new `docs/verification/materials-native-acceptance/planning-protocol.md`, native scenario driver/worker and results; reuse the existing local native harness and `tests/components/material-adoption-persistence.test.tsx` evidence where applicable. Existing frozen `planning-reference-cases.json` remains unchanged.

- [ ] Write the 14-row evidence matrix before running tests, mapping original case IDs to legal native setup, action, observation and preservation requirements.
- [ ] Use a target of at least four weeks, actual generated workspaces and separate document/selection/context/workspace versions. Create completed units and HTTPS synthetic Proof records through the existing services. Only starting synthetic inputs may be seeded.
- Use `CloudService.importLocalState` with `D1CloudRepository`, an explicit synthetic consent and empty completion/Proof arrays to establish the legal initial goal in the isolated local database. `saveSetup` alone cannot initialize an absent goal. Do not copy the historical helper's direct `career_goals` INSERT. Then create/confirm materials through document services, followed by `PlanningService.generate`, completion events and `ProofService.create`. This local fixture import performs no remote migration.
- [ ] Observe confirmation-only, guided adoption, batch-independent rejection, single independent adoption, unadopted intent, adopted soft focus, withdrawal, deletion, one-term exclusion, primary-JD replacement, explicit preview acceptance, secondary-JD authority, unresolved conflict and stale preview.
- [ ] Existing self-assessment UI is the explicit adoption boundary. Reuse its accepted interaction evidence and bind actual generated/persisted audits; do not invent an active-plan audit-edit endpoint. Clearly identify this native interpretation.
- [ ] Collect full before/after records, actual errors and separate lifecycle versions. Do not manufacture an expected audit entry, revision, Proof, proposal or state to fit the abstract fixture. Compare declared invariants independently from production outputs.
- [ ] Retain other selected materials, source/goal identity, protected task content/dependencies/minutes, completion events and Proof. Any accepted context switch must be explicit and persist after reload. A rejected or abandoned preview must not apply proposed context.
- [ ] Run the fixed native matrix once after its protocol review. Diagnose failures before changes; rerun only affected cases during repairs and the full 14 only when their shared harness or relevant product behavior changes.

## Task 3: Actual course-task coverage

Completed 2026-11-19: eight affected suites / 193 tests passed; one specific soft-wrap defect found by specification review was repaired with RED/GREEN and the affected nine-test suite. Lint, application/test types and both independent reviews passed. The after-patch course binding also passed. See `docs/verification/materials-native-acceptance/course-coverage-result.md`; no full repository rerun.

The read-only audit confirmed that topic correspondence exists but task-coverage metadata does not. Use compact bounded metadata so terms with equal coverage still group efficiently within the existing 256 KiB preview limit. Names and manual mappings alone must never establish full coverage. Supported scope must have exact current unit-content evidence; unknown scope remains explicit. Keep old preview fields optional and old saved records unchanged. New mapping/explanation semantics receive a new version; never mass-replace historical version literals or expected hashes.

**Files to inspect/change only if needed:** `app/lib/materials/skill-mapper.ts`, `app/lib/materials/contextual-skill-mapping.ts`, a small content-backed coverage module, `app/contracts/material-planning.ts`, `app/server/documents/context-builder.ts`, existing material preview consumers and focused tests.

- [x] Audit current outputs against existing reviewed course facts, distinguishing absent coverage information from an incorrect full-coverage claim and topic discovery from adoption.
- [x] Implement only the missing task-coverage behavior required by the approved design. A recognized course name alone cannot establish full task coverage. Keep concrete supported scope, remaining scope and content references separate from topic candidates.
- [x] Keep composite topics and unresolved alternatives distinguishable; do not select an ambiguous track for the user. Unknown or unsupported requirements remain visible for review and do not create courses, grant ability or become primary-JD requirements.
- [x] Derive runtime relationships from reviewed, bounded course-content rules; never import the frozen evaluation ledger or key behavior by its document/fact IDs. Verify evidence against the actual registry and preserve catalog/version boundaries.
- [x] Preserve old saved previews and planning semantics; add focused coverage/preview tests before changing behavior. Use the existing tests for source attribution, adoption and historical replay rather than duplicating them.

## Task 4: Review, evidence and next checkpoint

- [ ] Specification review, then code-quality review of changed code/protocol; reviewers reuse recorded outputs and add only probes addressing a concrete uncertainty.
- [ ] Run tests selected by changed files, plus relevant types/lint. No full-repository run solely because a report or binding record changed. Reserve the next full repository acceptance for the final integrated application version.
- [ ] Record exact completed/missing cases, changed files, actual test results and the immutable historical reference hashes. Keep intermediate failures separate from final results.
- [ ] Update the latest recovery record with the next concrete step. Model quality, hosted environment validation, accounting/cleanup/rollback and publication remain separate unresolved release steps until their actual evidence exists.

## Stop conditions

This batch is complete when the new dependency binding is reviewed, all 14 native behaviors have adequate actual evidence, and task coverage is truthful within the existing course scope. A known unrelated language edge does not trigger another expanding test campaign. A demonstrated data-loss, authority, incorrect-ability or false-coverage defect still requires a bounded repair. No Gate threshold or reference hash is relaxed merely to obtain PASS.
