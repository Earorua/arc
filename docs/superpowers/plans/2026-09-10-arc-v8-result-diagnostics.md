# Arc v8 Local Result Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development, TDD, independent specification review, then independent quality/security review. Steps use checkbox syntax. This workflow is already approved; do not ask again.

**Goal:** Distinguish provider-response rejection, candidate validation rejection and unusable accounting fields in the local safe Summary without changing Research acceptance or billing.

**Architecture:** One pure server helper projects fixed enums and validated bounded counts. The existing private OpenRouter executor exposes observation only through the local Kimi factory; the standard class remains unchanged. Local validation projects the existing receipt and one owner-bound run read before disposing the in-memory database.

**Tech Stack:** Existing TypeScript, Zod, Vitest, injected synthetic fetch, disposable SQLite. No packages, real keys, network inference, production mutations or Git commits/pushes.

Approved specification: `../specs/2026-09-10-arc-v8-result-diagnostics-design.md`. User confirmed on 2026-09-10. Source baseline HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`, authoritative existing worktree; 34 intentional dirty files before this plan. Never reset/clean or move to the old HEAD. Root owns documentation; implementers own only task files, and must report RED before touching runtime source.

## Task 1: Provider result observation

**Files:** Create `app/server/research/result-diagnostic.ts` and `tests/server/provider-result-diagnostic.test.ts`; modify `app/server/research/openrouter-provider.ts`. Existing Provider tests may be extended only if needed to assert preserved behavior; do not modify contracts, standard factory, orchestrator, profile or wire body.

- [x] Write an integration RED using existing `createKimiLocalValidationProvider` and a synthetic HTTP 200 body with model Kimi, `finish_reason: null` and no usage. Pass the proposed `onResultDiagnostic` callback (a narrow test-local intersection type can keep the preimplementation call type valid). Capture the existing thrown invalid-transport error, and assert:

```ts
expect(diagnostics).toEqual([{
  outcome: "rejected", reason: "finish-not-stop",
  finishReasonState: "missing", finishReason: null,
  usageIssueCodes: ["usage-shape"],
}]);
```

Run `node node_modules/vitest/vitest.mjs run tests/server/provider-result-diagnostic.test.ts`. Expected RED is an empty diagnostic array, not an import failure, startup EPERM or a missing mock. Runtime source remains unchanged until observed RED.

- [x] Implement the fixed diagnostic type and pure projection in `result-diagnostic.ts`. Exact fields/enums and their null rules are the approved spec's providerResultDiagnostic section. Use the actual supplied rejection reason; inspect finish_reason only when choices has exactly one ordinary object. For usage, reuse the existing `providerUsageSchema` safe-parse result; map its field paths to the six field/consistency issue codes. A non-object usage yields only usage-shape. A token-total-mismatch requires all three token fields to pass their existing bounds, even if Zod runs superRefine after an invalid numeric bound. Sort/deduplicate codes and expose no Zod messages or inputs.

Authoritative accounting stays a single path: the existing creditsToMicros function may move unchanged into the helper and be reused by both parsed usage and charged detection. Expose a `parseOpenRouterUsage(value, repair)` function returning the existing schema's safe-parse result, then let auditMetadata derive usage success/null and the observer derive issue codes from that same parse. Keep the existing absent-server-tool Repair rule (zero only for Repair when field is undefined).

The observer follows this complete isolation pattern, with makeProviderResultDiagnostic implementing the fixed pure projection above:

```ts
const observe = (reason: ProviderResultDiagnostic["reason"]) => {
  if (!onResultDiagnostic) return;
  try {
    const diagnostic = makeProviderResultDiagnostic(outer, reason, usageResult);
    void Promise.resolve(onResultDiagnostic(diagnostic)).catch(() => undefined);
  } catch { /* Diagnostics cannot change execution or accounting. */ }
};
```

Construct usageResult once from the same wire usage already validated in auditMetadata. Pass callback through local factory -> private execution dependencies -> readResponse only. Standard class constructor and its private calls must not accept/forward this callback. Keep callback snapshotting consistent with existing dependencies. Before a thrown post-parse error invoke observe exactly once at its actual branch; for success invoke observe(null) after candidate construction. The existing typed failure, retryable/charged/model/usage data, read deadline, and final return must be unchanged. For pre-outer failures no new diagnostic is generated.

Branch mapping: invalid choices array/entry/multiple choices => choices-invalid; non-stop => finish-not-stop; content bounds/type/empty => content-invalid; malformed citation/annotation container => annotations-invalid; explicit HTTP/top/choice errors => upstream-error; finish error => provider-error; filter/refusal => filtered. Preserve existing branch ordering, so a multiple-choice response rejected first for length is finish-not-stop, with unavailable single-choice finish projection.

- [x] Add targeted RED/GREEN cases for stop/length/tool_calls/error/filter/null/missing/non-string/unrecognized finish; valid/invalid/multiple choices; content and annotation rejection; malformed outer JSON/no outer object; callback sync throw and rejected Promise; unknown canary/Key-like/URL/body/metadata exclusion. Inject synthetic fetch only and assert one invocation/zero Repair. Include exact output/model/usage/charged comparisons with and without local callback, standard class unchanged, and unchanged request body/profile.
- [x] Cover missing/array/non-object usage; all numeric type/range cases already in Provider regression; missing cost/search; token mismatch vs individually invalid token values; valid decimal rounding and Repair absent-search behavior. Valid aggregate yields [] and original usage. Failed aggregate remains null; partial billed errors retain charged true exactly as before.
- [x] Run new test plus `tests/server/openrouter-provider.test.ts`, `tests/server/kimi-local-validation.test.ts`, `tests/server/provider-failure-diagnostic.test.ts`; run nonincremental TypeScript and targeted lint. Self-review changes, report commands/RED/GREEN/counts/file hashes. No commits.
- [x] Independent specification review; fix material gaps and re-review. Only then independent quality/security review. Root verifies source boundaries before Task 2 begins.

## Task 2: Summary receipt and internal quality projection

**Files:** Extend `app/server/research/result-diagnostic.ts`; modify `scripts/live-research/validation.ts`; create `tests/server/live-result-diagnostics.test.ts`. Task 1 files are otherwise sealed. Only update existing Summary assertions if strict full-object equality requires the additional fields.

- [x] Write integration RED through real runValidation, the existing synthetic safe-key fixture and a complete HTTP 200 fixture with missing usage and candidate content `{}`. Assert new fields are present:

```ts
expect(result.providerResultDiagnostic).toMatchObject({ outcome: "accepted", reason: null, usageIssueCodes: ["usage-shape"] });
expect(result.researchAttemptDiagnostic).toEqual({ status: "rejected", errorCode: "invalid-result", charged: true });
expect(result.researchRunDiagnostic).toMatchObject({ errorCode: "invalid-result", quality: { passed: false, issueCodes: ["invalid-schema"] } });
expect(result).toMatchObject({ runState: "failed", failureCategory: "invalid-result", usage: null, reservation: { status: "conservative-hold" }, planningGenerated: false, databaseDisposed: true });
```

Before source changes run `node node_modules/vitest/vitest.mjs run tests/server/live-result-diagnostics.test.ts`; expected RED is missing new fields. Use test-local structural casting if necessary, never change source just to let a RED test start.

- [x] Add nullable providerResultDiagnostic/researchAttemptDiagnostic/researchRunDiagnostic to ValidationSummary and initialize all to null. Local factory callback projects/checks the fixed diagnostic shape before assigning. The normal valid path copies only these fields, never spreads an untrusted callback object.
- [x] Implement `projectResearchAttemptDiagnostic(value)` in the pure helper: read only status/errorCode/charged, validate a newly built strict object against existing fixed receipt enums/null rules. Return null for missing/invalid data; retain no input container references. Existing receipt read remains one read and supplies actualModel/usage exactly as before; its new projection is separately caught so malformed observation cannot skip original behavior.
- [x] Implement `projectResearchRunDiagnostic(value)` in that helper: read errorCode and nullable quality only. Null/allowed error codes preserved; every other code maps to unrecognized. Validate quality with the existing complete researchQualityReportSchema, then return only passed, a fresh issueCodes array, skillCount/sourceCount/unitCount. Missing/invalid record/report returns null. Never pass through candidate, metadata, observedAt or arbitrary errors. Add a separate owner-bound read with this complete failure-isolation shape after normal run and receipt fields have been populated:

```ts
try {
  const record = await repository.getRun(OWNER, run.id);
  summary.researchRunDiagnostic = projectResearchRunDiagnostic(record);
} catch { /* Observation failure leaves null and preserves the original flow. */ }
```

This extra read must not alter domain state, budget settlement, later owner/repeat checks, activation/planning, or finally disposal. Do not expose the internal fields in public API types or persist them in production tables.

- [x] Add synthetic integration cases distinguishing null/length finish, content invalid, annotation invalid, candidate schema failure, normal Needs-review, Ready, only-missing-usage, explicit upstream error and malformed outer body. Assert one mock GET+POST/zero Repair, owner/second-request rejection and database disposal; compare original result fields against their baseline expectations.
- [x] Add pure projection cases: invalid/unknown statuses and error codes, out-of-range/malformed quality, unknown strings and canaries, fresh arrays/no input reference retention, result-too-large with quality null. Exercise an exception from only the extra diagnostic getRun read (not a required orchestrator read) and confirm Ready/planning/settlement/cleanup are unchanged. Do not add a runtime test-only API; use a call-qualified prototype spy and restore it after the test. For callbacks/receipts test throwing getters with safe projection/catch boundaries without allowing untrusted strings into output.
- [x] Run new file, provider-result-diagnostic, live-research-validation, live-research-failure-summary, openrouter-provider and kimi-local-validation; TypeScript and targeted lint. Report RED/GREEN/counts and any changes outside the declared files. No commits.
- [x] Independent specification review, then quality/security review; fix and re-review until no material findings remain.

## Root integration and handoff

- [x] Run all affected Provider/validation/failure-summary/diagnostic tests plus research-orchestrator, research-environment, research-budget, d1-research-budget-repository and research-planning-integration. Tests must use fixtures/SQLite only. A test harness with injected mock requests is not a new real validation.
- [x] Run `node node_modules/typescript/bin/tsc --noEmit --incremental false`; targeted ESLint for touched source/tests; `npm run build`; `git diff --check`. Investigate actual new failures, not historical line-ending notices. Repeat only after new changes/findings justify it.
- [x] Final independent integrated review. Check the body/profile/launcher/runner/contracts/orchestrator/repositories/budget/standard-factory and real Summary preservation against baseline hashes and task diffs. Save results and updated checkpoint. Runtime edits remain local and uncommitted as authorized.
- [x] Report local diagnostics complete only after evidence passes. Real invalid-result cause, trusted aggregate fee, first public release and online lifecycle gates remain unresolved. Any next paid attempt requires a separate concrete new authorization; do not repeat the seventh command.

## Baseline fingerprints

Task 1 implementer reported valid RED before runtime edits: `node node_modules/vitest/vitest.mjs run tests/server/provider-result-diagnostic.test.ts`, **1 file / 1 failed test / 893 ms**, expected finish-not-stop diagnostic but received `[]` at line 37. Initial sandbox spawn EPERM was not counted as RED; the same offline command ran with sanctioned escalation. Provider baseline hash was independently sealed by root and rechecked by implementer before runtime edits. Source-only `.before.txt` snapshots in ignored `outputs/local-result-diagnostics-20260910/` preserve the pre-task Provider and validation files for precise review; they contain no real response or Key and are excluded from TypeScript source discovery by their extension.

Task 1 implementation GREEN: 301/301 tests in four focused files; implementer nonincremental TypeScript and targeted ESLint exit 0. Root independently reran the same four-file suite at local 2026-09-10 03:08:03: **301/301 passed, 1.51 s**. Root verified all 17 sealed files unchanged, including validation, both real summaries, profile, launcher, runner, contracts and domain services. Independent specification review is in progress; quality/security review follows it. Extra RED evidence covered sorted usage issues, total-token mismatch and non-ordinary choice projection. No new live request or Git operation was performed.

Task 1 first specification review found one P2: a missing/invalid-type cost or search value prevents Zod's object-level refinement, so a simultaneously inconsistent but individually valid token total was not diagnosed. Root verified the mechanism and returned it to the implementer for a combined-error RED/GREEN fix before re-review. Original aggregate acceptance remains unchanged; quality/security review has not started.

Task 1 P2 resolution: combined RED 2 failed / 55 passed, 696 ms; four-file GREEN 303/303. Specification re-review READY (27 additional read-only assertions), followed by independent quality/security READY with no findings. Root fresh run at 03:15:23 passed 303/303 in 1.52 s. Provider fingerprint `9d73fcedf0d0050cdb510c469e33856dd9f7189e4e71d56e3e7692729ba8124f` and Task 1 test `ad4d1435bf994e9265fc471d7f70d6663fb7e9004fe0e8f9fd86bed720e2231b` are sealed for Task 2; helper baseline is `a9d7d6d2b4104c42d4d06dc8a9d4f3741a48fe8e242ef9222d5917716acb8321`.

Task 2 initial RED: one test failed exactly on absent new diagnostic fields, with original failure/hold/disposal expectations already matching; one synthetic GET and POST. Runtime edits started only after that evidence. Detailed rolling evidence is in `../../operations/v8-result-diagnostics-validation-2026-09-10.md`.

Provider `15c7fae64df7952eb81849e7331143c0853f5e85111a5024ab839af7ec83e5fa`; validation `e48b7a7c90671fab46a2db250ef32ccd402d8eb14aaa18a5a217ed37119e6e0b`. These two will change only within scope. Launcher `74a553f87f7e5a4878e1032c58fba13ec0b0929c5a9cd291b9088fcf61343f64`, runner `47305aa27df034bea1e669016bb8b2d83338425e4e67da476d050a2b4858a226`, profile `84b286701ac98a716255c5092d997bc153fa0f18152164416f7bc90af803b10d` stay unchanged. Seventh real Summary `24bad7859f8c9c0471881609961aa9dfe08ee83ea80ff571a7c40cc31a4a4821` and previous real Summary `4969ecaff86d720a54a99fe658afc1b4622655784d66e8ca1d90729fecf4a62b` remain immutable.
