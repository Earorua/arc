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
- Live read-only preflight verified the existing Site (44 bindings), executor (14 bindings), and zero active Research runs. Production deployment is pending at this checkpoint.
- The panel and its test use LF line endings; other production behavior is unchanged beyond the scoped repair.
