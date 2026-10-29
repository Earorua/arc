# Research response recovery — 2026-10-29

## Scope and evidence

The production AI工程师 run `1ee7d357-e629-447d-b028-1e13166fb9b6` was rejected by the provider adapter because citation index 27 of 50 had a blank title. Its settled cost was USD 0.248966. Research remains enabled. The rejected original model body was not retained.

The v1 preflight also reported `json-syntax`, but inspected raw content. The Site already applies `extractResearchJson` before parsing: one complete outer JSON code fence is supported. Therefore the old preflight does **not** prove an independent irreparable JSON defect. No original-response recovery or successful production retry is claimed.

## Bounded design

1. Use the existing validated public-hostname fallback for absent and whitespace-only string citation titles. Preserve every citation and its URL; continue rejecting null, non-string, excessive titles and invalid fallback URLs. Share the fallback predicate between the adapter and diagnostics.
2. Emit preflight v2 after the same bounded extraction used by Site import. Keep v1 readable as historical raw-content diagnostics. Do not repair missing facts, remove arbitrary prose, widen the accepted schema, or change the quality/source-authority rules. Apply the raw-content byte limit before extraction.
3. Say “本次研究未完成” for a failed run, and explain that an invalid result did not create a new plan and existing learning data is retained. Preserve existing retry eligibility and explicit replacement controls.

Merely retrying can incur another fee; accepting arbitrary malformed content would hide failures. The chosen repair handles only a demonstrated metadata compatibility issue and removes a diagnostic mismatch. It cannot guarantee that future model output meets all quality requirements.

## Implementation plan

**Goal:** Prevent blank citation labels from discarding an otherwise usable response and diagnose parse failures consistently with import.

**Architecture:** Existing adapter → unchanged result receipt → existing Site parser/quality validation. Only citation fallback, diagnostic observation and failed-state wording change.

**Tech stack:** TypeScript, Zod, React, Vitest; no additional dependencies.

- [x] Add regression cases in `tests/server/openrouter-response-compatibility.test.ts` for 50 citations with a blank 28th label, blank variants, unsafe fallback URLs and unchanged audited cost/single provider call.
- [x] Update `tests/server/research-annotation-diagnostic.test.ts` to expect safe blank-title fallback and retain other rejection cases.
- [x] Add preflight regressions for complete fenced JSON, incomplete/prose-wrapped data, legacy v1 projection and raw byte limits. Observe failures before changing implementation.
- [x] Add `app/server/research/citation-title.ts`; use its fallback predicate in `openrouter-provider.ts` and `annotation-diagnostic.ts`.
- [x] Update `response-preflight-diagnostic.ts` to build v2 with bounded `extractResearchJson`, retaining v1 projection.
- [x] Update failed-state copy and its existing component test; verify no automatic retry or submission.
- [x] Run the affected adapter, preflight, import/quality and UI suites, inspect the scoped diff, and record deployment/verification limits.

No new paid Research attempt, budget increase, raw-response retention, credential change or database mutation is included. The current October 28 application source must be preserved. C: is nearly full; new build and temporary outputs belong on D:.

## Local verification

- Regression tests first failed on the demonstrated blank-title rejection and misleading preflight/UI state; 14 affected suites then passed, 397 tests.
- TypeScript and changed-file ESLint passed. Existing SQLite experimental and intentional rejection-test logs remain informational.
- Site and executor candidate built on D: and passed manifest checks: 353 artifacts, manifest SHA256 893605d5601eb9577e07323bfbf5564a183848684028a66b0c1d456b0de54275.
- Live read-only preflight verified the existing Site (44 bindings), executor (14 bindings), and zero active Research runs before release.
- The panel and its test use LF line endings; other production behavior is unchanged beyond the scoped repair.

## Published and verified

Released on 2026-10-29; final native readback completed at 16:31 China Standard Time. Application commit: `513d84f6a6dbd775158b5b09972753f73fb47875`, branch `codex/research-response-recovery-20261029`.

- Site version: `149f4e31-d1da-416a-96a1-7a628e141eaf`, deployment `4e67c6ab-4df2-42f0-9c5b-96ef5df6eb83`, 100% traffic.
- Executor version: `60b176c2-be13-4df2-8743-c899b596f6d4`, deployment `b26dda72-7151-470a-aafd-c693ea259884`, 100% traffic.
- Both deployment dry runs passed. After publication, all 44 Site bindings and 14 executor bindings, plus runtime configuration, matched the pre-release state. No database/schema, secret, budget, access or source-authority setting changed.
- In the authenticated in-app browser, refreshed `/setup?step=goal`, minimized the overlapping learning companion, entered the previous role `AI工程师`, and verified the enabled “研究这个岗位” button. Recent captured browser errors: 0. Did not click Research or a learning-partner send action.
- The historical failed run remains failed and has no recoverable candidate. A new paid end-to-end Research has **not** been run. The repair is verified with local synthetic provider/import tests, production build, native deployment readback and UI availability; it does not guarantee every future model response will pass quality checks.
- Evidence and screenshot: `D:/CodexTemp/arc-research-diagnostic-20261029`; sealed candidate: `D:/CodexTemp/arc-research-candidates/response-recovery-20261029-r1`. Do not replay the consumed deployment scripts.
- Previous versions for deliberate rollback assessment: Site `34170daa-a865-410c-91de-125edac48956`; executor `58ce29e7-80df-4d78-8a28-c7dcdf614555`. These contain the old citation handling. No automatic rollback or paid retry is scheduled.
