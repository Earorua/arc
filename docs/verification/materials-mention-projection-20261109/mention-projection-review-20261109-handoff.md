# Task 3: versioned mention review persistence and correction UI

Status: **DONE — implementation frozen for specification review, then quality review.** This is a delegated implementation handoff, not full materials acceptance or release approval.

Baseline: `c36aa0e8049e3b8f245dc6004ac9d2c23b89ae29` on `codex/materials-replan-recovery-20261106`. Parent already read the live GitHub SOURCE_INDEX and local routing index; local accepted work supersedes the historical paused source reference. Existing parent changes to the two verification documents were preserved. No branch, commit, deployment, migration, remote operation, live inference, or paid provider request was made.

## Frozen implementation

- `app/server/documents/review-service.ts`: original candidate kinds are joined for exactly v2/v3; public drafts retain the actual stored marker. The shared exact-version predicate gates source linkage, edits, additions, extraction switching and saved projection. The explicit source-term validator receives the original candidate slice, edited text, requested source term and server-owned projection. Existing revision, owner, atomicity, immutable extraction/source, confirmation and retry protocols stay intact.
- `app/components/materials/material-confirmation.tsx`: AddSourceTerm requires the draft projection and uses the same four-argument validator. Source labels use the versioned raw-term locator. Only exact known source-linked versions expose the correction control. The eight-term quota, reclassification restriction, main-JD requirement gate and separate ability-adoption callback remain in place.
- `tests/server/document-review-draft.test.ts`: v3 actual service delivery/save/read/replay; negative SQL retention; explicit correction and source/version/owner/atomic guards; empty, omitted and removed terms; reclassification; current v3 to historical extraction adoption guard; unsupported personal-hint edits across legacy/v1/v2/v3.
- `tests/components/material-confirmation-source.test.tsx`: exact v3 negative source addition, raw versus canonical alias display, v2 negative control, quota and persisted reclassification, immediate hint removal, main-JD negative/conditional unspecified classification gate.
- `tests/components/material-source-term-correction.test.tsx`: retained existing full v2 analysis/editor/planning test; added actual v3 MaterialTextPanel plus HTTP-backed DocumentsClient save/reload/confirmation/selection/context; negative topic addition/removal/deletion and personal-to-colleague/future edits with no hint restoration.
- `tests/server/material-mention-review-flow.test.ts`: actual client → route factory → runtime → ReviewService/D1/R2 → confirmation/selection/context, including negative/other/future SQL, personal React plus other SQL, explicit learning-intent control, manual fallbacks and eight-term quota.
- `tests/helpers/material-mention-review-fixture.ts`: shared offline review fixture, approved by parent. Uses actual DocumentsClient, route factory, runtime and local SQLite D1/memory bucket. Only inert consent/job rows and canonical result delivery are seeded; analysis is disabled. It does not claim provider or native workerd verification. Existing v2 analysis fixture is unchanged.

`material-text-panel.tsx`, shared grammar/helpers, policy/validator files accepted in Tasks 1–2, old persistent historical stores, frozen refs and course captures were not edited.

## Preserved TDD record

All Node invocations used `node work/grounded-verification/run.mjs UNIQUE-LABEL ...` with distinct `-results.json` output paths. Every wrapper reported zero non-loopback denials. Test source snapshots are adjacent to the raw RED evidence.

| Label suffix (prefix `mention-projection-review-20261109-`) | Result | Interpretation |
| --- | --- | --- |
| `red-01` | 207 pass / 34 fail | 31 expected product gaps; three fixture routing failures because generic `/[documentId]` intercepted `/capabilities`. Source copies retained. |
| `red-02` | 207 pass / 34 fail | Fixture static-route precedence corrected before production edits. All failures now reach intended missing v3 behavior: marker/reclassification reload, source correction, exact source with an empty list, extraction adoption guard, editor controls. |
| `green-01` | 240 pass / 1 fail | Minimal production wiring works. Remaining fixture expectation incorrectly assumed full-width `ＳＱＬ` canonicalizes to `SQL`; the unchanged term helper intentionally preserves this literal spelling. No product grammar changed. |
| `red-03` | 2 pass / 97 filtered | Corrected alias sentence `I have never performed data cleansing.` was not a discriminating v2/v3 test: the old term matcher also accepts that wording. This is a preserved non-discriminating probe, not claimed RED evidence. |
| `red-04` | 2 fail / 97 filtered | Final alias sentence `I have no experience with data cleansing.` fails correctly against baseline c36aa0e: source-add button disabled and nominated raw alias absent. Vite load override supplies the baseline component at its original module path; shared working tree was never reverted. |
| `green-02` | **338 pass / 0 fail**, 12 files | Final corrected assertions and focused v2/historical/service/planning regression suites pass on current source. |
| `types-01` | exit 0 | Scoped TypeScript compilation for the seven source/test files and their imports. |
| `lint-01` | exit 0 | Scoped lint, `--max-warnings=0`, for all seven files. |

The focused test log contains the existing Node experimental SQLite warning; there are no application errors or test failures in the passing run. `git diff --check` passed. HEAD is unchanged from the baseline.

## Self-review and remaining parent validation

The final diff retains server authority over projection choice; request schemas still reject client markers. V2 retains its old correction predicate and data model. Legacy and v1 projection behavior is unchanged. New review handling never rewrites stored extraction envelopes, source objects or digest rows. Explicit empty labels remain empty, and omitted old-client fields cannot silently restore labels. Removed labels cannot return via a stale list; intentional source correction still requires explicit per-item addition against the current revision and exact source.

Topic mapping does not grant practice or ability: negative/other/future SQL maps to SQL with no practice priority or hint; mixed personal React/other SQL awards only React practice. Supplemental learning-intent priority requires its existing explicit adoption input. Manual fallback, audit, time availability and target are asserted unchanged. The main-JD unspecified gate is covered on the actual component. No new adoption UI was implemented.

Root owns reruns of the prepared 25 native flows, node parity, 170 provider/helper compatibility observations, six persistent historical reads, broader repository acceptance and archival evidence. These remain pending at this handoff. Independent specification review should precede quality review; this agent will not alter frozen files until feedback.

The preexisting Chinese guided-action false negative and numbered whole-entry quote limitation remain open, as documented by parent. Neither was repaired or reclassified as resolved in this task.

Hashes, raw log SHA values and result-file SHA values are in `mention-projection-review-20261109-freeze-results.json`.
