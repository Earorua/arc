# Arc v8 Candidate Field Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking. User has selected this workflow; no new workflow approval is needed.

**Goal:** Explain candidate parsing failures and invalid search-count shapes using bounded, content-free local diagnostics while preserving every existing acceptance, billing, transport and cleanup result.

**Architecture:** Observe the existing candidate parser once at its real post-extractJson orchestration call. Reuse authoritative parsing/bounds/Zod outcomes; project only schema-owned paths and fixed codes. Extend the existing local Provider diagnostic with two search-shape enums. Production factories never connect observers.

**Tech Stack:** TypeScript, Zod 4, Vitest, existing in-memory SQLite validation, existing portable Sites build. No new dependencies.

**Approved design:** `../specs/2026-09-11-arc-v8-candidate-field-diagnostics-design.md`, explicitly approved 2026-09-11.

**Completion:** Both tasks completed on 2026-09-11. Task 1: 209 focused tests; Task 2: 303 focused tests. Both independent specification and quality/security reviews READY, all findings closed. Root final integration: 635 tests, types, scoped lint, build and 25 file fingerprints pass; final independent integrated review READY. Evidence: `../../operations/v8-candidate-field-diagnostics-validation-2026-09-11.md`. Do not repeat completed implementation or confuse local diagnostics with live Research success.

**Workspace:** `C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta`.
Branch `codex/v8-openrouter-research-beta`, HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`. Preserve the 42 pre-existing dirty files. Do not create another worktree, reset, stage, commit, push, merge, deploy, touch production, read keys/env, invoke a real Provider, or run the historical ExecuteOne launcher. Explicit scope overrides generic skill commit instructions.

**Comparison baseline:** root captured seven source/test files as `.before.txt` under ignored `outputs/local-candidate-diagnostics-20260911/`. The filename is the repository path with `/` replaced by `--`, followed by `.before.txt`. Use these snapshots to isolate this slice; HEAD diff includes earlier approved changes. No raw responses are in these snapshots.

## Task 1: Authoritative candidate-parser diagnostics

**Files:**
- Modify `app/server/research/provider.ts` — optional observer on the existing parser, no acceptance changes.
- Modify `app/server/research/orchestrator.ts` — optional dependency on only the initial post-extractJson parse.
- Modify `app/server/research/result-diagnostic.ts` — candidate diagnostic types, safe builder and strict copy projection.
- Modify `scripts/live-research/validation.ts` — nullable Summary field and local injection.
- Create `tests/server/research-candidate-diagnostic.test.ts` — parser, projection, bounds and hostile input tests.
- Create `tests/server/live-candidate-diagnostic.test.ts` — actual local orchestration/SQLite integration.

- [x] **1. Write and run the first behavioral RED.** Extend the public parser call through a typed test cast before its optional argument exists; assert the candidate still rejects, but now must report the exact schema-owned field. Use the existing fixture, not a mock parser:

```ts
const candidate = structuredClone(validResearchCandidate) as Record<string, unknown>;
delete candidate.evidence;
const observe = vi.fn();
const parse = candidateFromContent as (content: string, observer?: (value: unknown) => unknown) => unknown;
expect(parse(JSON.stringify(candidate), observe)).toBeNull();
expect(observe).toHaveBeenCalledExactlyOnceWith({
  outcome: "rejected", reason: "schema-rejected",
  issues: [{ path: "evidence", code: "invalid-type" }], truncated: false,
});
```

Import fixture from `tests/fixtures/research/valid-candidate.ts`. Run `node node_modules/vitest/vitest.mjs run tests/server/research-candidate-diagnostic.test.ts`; expected RED is missing observer call. A sandbox spawn error is not RED; use the same offline command through the allowed escalation mechanism if needed, never a live launcher.

- [x] **2. Implement the bounded diagnostic helper and parser observation; iterate RED/GREEN for branches.** Use these API contracts:

```ts
type CandidateDiagnosticReason = "content-limit" | "json-syntax" | "node-limit" | "depth-limit"
  | "string-limit" | "array-limit" | "object-limit" | "schema-rejected";
type CandidateDiagnosticCode = "invalid-type" | "invalid-value" | "invalid-format" | "too-small"
  | "too-big" | "unrecognized-keys" | "other";
type ResearchCandidateDiagnostic = {
  outcome: "accepted" | "rejected";
  reason: CandidateDiagnosticReason | null;
  issues: Array<{ path: string; code: CandidateDiagnosticCode }>;
  truncated: boolean;
};
type ResearchCandidateObserver = (diagnostic: ResearchCandidateDiagnostic) => unknown;
```

Add a pure builder for `(reason, zodIssues)` and a strict `projectValidationCandidateDiagnostic(unknown): ResearchCandidateDiagnostic | null`. Derive a trusted path tree/set lazily from `z.toJSONSchema(researchCandidateSchema, {target:"draft-7"})` when diagnostics are requested. Traverse only its own properties and array items; include root `$`, each known property and array wildcard. Resolve actual issue paths by following this tree; integers become `[]`, unknown segments stop at the nearest known parent, never echo arbitrary path members. Do not interpolate field values, Zod messages, unknown keys, expected/received values, URLs or content. Map known Zod issue codes to the fixed public codes; unknown codes become other. Deduplicate by path/code, sort lexically, take 16 unique entries; truncated is true iff more unique safe entries were omitted. Strict-copy validation must check path membership, enums, ordering/uniqueness, max16 and consistency (accepted iff reason null; issues/truncated only for schema-rejected).

Add optional observer to `candidateFromContent`. Keep original UTF-8 limit, JSON parse, node/depth/string/container bounds and Zod safeParse in the same order and using the same limits. Emit the matching reason immediately before each existing null return, schema-rejected from that same safeParse error, or accepted before returning the same parsed candidate. Distinguish array-limit/object-limit. Do not construct diagnostics without an observer. Observation and projection must be inside an independent try/catch; consume rejected promises without waiting:

```ts
try {
  const observed = observer(diagnostic);
  void Promise.resolve(observed).catch(() => undefined);
} catch { /* Observation cannot affect parsing. */ }
```

Enclose diagnostic construction in the same isolation. Do not misclassify diagnostic exceptions as JSON failures or change candidate returns. Do not change ordinary parser behavior for malformed content or the two observed trim/Unicode differences.

- [x] **3. Write integration RED, then wire the real call.** Extend `ResearchOrchestratorDependencies` with optional `onCandidateDiagnostic?: ResearchCandidateObserver`, and only change the existing first parse call to:

```ts
candidateFromContent(extractJson(first.result.content), this.dependencies.onCandidateDiagnostic)
```

Keep Repair call sites and the standard service factory untouched. Add nullable Summary field initialized to null and the local dependency:

```ts
onCandidateDiagnostic: diagnostic => {
  try { summary.researchCandidateDiagnostic = projectValidationCandidateDiagnostic(diagnostic); }
  catch { /* Observation only. */ }
},
```

Inject synthetic fetch like existing live-result-diagnostics tests: safe synthetic Key GET, fixtureResponse JSON for the one POST, no global network. A valid fenced fixture must produce candidate accepted and Ready, proving post-extractJson observation. Missing evidence must produce the field diagnosis plus the existing failed/invalid-schema/conservative-hold as appropriate. Key failure and key-check-only retain null. Test observer failure and failed projector injection separately from business exceptions; assert original outcome, usage, settlement, planning, owner/second-call rejection and disposal unchanged.

- [x] **4. Complete bounded behavior and security tests.** Cover all eight rejection reasons with boundary fixtures; unknown nested keys with canary values; wildcard nested field paths; first16 unique truncation; duplicate normalization; unknown code fallback; strict re-projection denial of arbitrary fields, getters/errors and invalid combinations; returned arrays are fresh. Include missing required field, numeric string, enum/length errors, golden, legal fence, trim/Unicode examples. Test no observer and thrown/rejected observer. Add no-opportunities cases where no parse occurs and standard factory no hookup. Tests must exercise actual parser/service, not simply copy implementation calculations.

- [x] **5. Run Task 1 focused verification and self-review.**

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-candidate-diagnostic.test.ts tests/server/live-candidate-diagnostic.test.ts tests/server/research-orchestrator.test.ts tests/server/live-result-diagnostics.test.ts tests/server/live-research-validation.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js app/server/research/provider.ts app/server/research/orchestrator.ts app/server/research/result-diagnostic.ts scripts/live-research/validation.ts tests/server/research-candidate-diagnostic.test.ts tests/server/live-candidate-diagnostic.test.ts
```

Expected all pass. Report actual RED and GREEN counts/commands, file list and residual concerns. No commit. Root then requests independent spec review; only after it passes request independent quality/security review. Fix any findings through the implementer with regression RED and re-review.

- [x] **6. Task 1 specification review READY.** Two initial test-coverage P2 findings closed by independent re-review; final implementer gate 209 tests, types and scoped lint pass.
- [x] **7. Task 1 quality/security review READY.** Independent read-only review found no P1/P2/P3 findings.

## Task 2: Search-count shape projection

**Files:**
- Modify `app/server/research/result-diagnostic.ts` — add webSearchUsage to ProviderResultDiagnostic and its strict projection.
- Modify `tests/server/provider-result-diagnostic.test.ts` and `tests/server/live-result-diagnostics.test.ts` — new expectations and actual local integration.
- Modify `app/server/research/openrouter-provider.ts` only if existing generic observer forwarding needs a change; do not alter request body or parser branches.

- [x] **1. Add a failing shape test against existing projection.** Start with otherwise-valid usage lacking server_tool_use; original usageIssueCodes must remain `["web-search-requests"]`, while the new field must equal:

```ts
{ container: "missing", requests: "unavailable" }
```

Run `node node_modules/vitest/vitest.mjs run tests/server/provider-result-diagnostic.test.ts`; expected RED is undefined webSearchUsage, not an import/type error.

- [x] **2. Implement shape-only projection, using this contract.**

```ts
type WebSearchUsageDiagnostic = {
  container: "unavailable" | "missing" | "null" | "object" | "invalid";
  requests: "unavailable" | "missing" | "null" | "non-number" | "non-finite"
    | "non-integer" | "out-of-range" | "valid";
};
```

Use current recordValue semantics: non-record usage => unavailable/unavailable; server_tool_use undefined => missing/unavailable; null => null/unavailable; non-record => invalid/unavailable. For object, inspect web_search_requests in this precedence: undefined, null, typeof!=number, !finite, !integer, current providerUsageSchema.shape.webSearchRequests.safeParse failure, valid. Do not output numbers. Reuse original authoritative 0..10 schema for range instead of maintaining a new limit. Extend ProviderResultDiagnostic strict schema, builder and local safe copy projection. Parent object requires requests other than unavailable; every other parent requires unavailable. Preserve original five fields, original usage parsing and charged/accounting decisions exactly, including Repair's existing absent-search default. Task1 must continue passing without edits to its behavior.

- [x] **3. Cover shapes and integration with RED/GREEN.** Test usage absent/null/primitive/array, server-tool absent/null/primitive/array/object, count absent/null/string/boolean/NaN/Infinity/fraction/negative/>10 and 0/10 valid. Assert both enums and original usage/issueCodes. Pure non-finite tests must not serialize NaN to null and claim non-finite coverage. Test hostile canaries/getters, callback/projector failure, no leaked values; use one real local Adapter/SQLite synthetic path for missing count to prove holding behavior unchanged and the new summary field delivered. Update exact expected diagnostics, not assertions weakened to any-object.

- [x] **4. Run focused tests, types and lint.** Implementer reports 303/303 in the required five files, nonincremental types and assigned-file lint passed.

```powershell
node node_modules/vitest/vitest.mjs run tests/server/provider-result-diagnostic.test.ts tests/server/live-result-diagnostics.test.ts tests/server/research-candidate-diagnostic.test.ts tests/server/live-candidate-diagnostic.test.ts tests/server/openrouter-provider.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js app/server/research/result-diagnostic.ts tests/server/provider-result-diagnostic.test.ts tests/server/live-result-diagnostics.test.ts
```

Report real RED/GREEN evidence and self-review. No commit.

- [x] **5. Task 2 specification review READY.** Independent read-only review found no P1/P2/P3 gaps.
- [x] **6. Task 2 quality/security review READY.** No P1/P2/P3 findings.

## Final integration and handoff

- [x] Run the two new files plus existing provider-result-diagnostic, openrouter-provider, kimi-local-validation, provider-failure-diagnostic, live-result-diagnostics, live-research-validation, live-research-failure-summary, research-orchestrator, research-environment, research-budget, d1-research-budget-repository and research-planning-integration tests. Verify types and targeted lint for all touched TS files, then `git diff --check`. Root: 14 files / 635 tests pass at 14:31:57 +08; types/lint/diff check exit 0.
- [x] Root uses the current installed Sites build helper: `node C:/Users/XF/.codex/plugins/cache/openai-bundled/sites/0.1.66/scripts/build-site.mjs` (updated installed path on resume; runs the same existing package build). Confirm Worker default fetch entrypoint and client/server artifact shape; no deployment. Five-stage build passed; default async fetch, 38 client files and 15 migration metadata files verified.
- [x] Compare protected profile, launcher, runner, service-factory, contracts, package/source validators, database/budget files and historical real Summary hashes to the frozen baseline. Record new modified-file hashes, no change to old receipt bytes. 25/25 match (8 candidate + 17 protected); adapter also matches its pre-task snapshot.
- [x] Independent integrated review READY. No substantive correctness, security, regression or scope findings; no source changes after the checks.
- [x] Update validation evidence, approved design/plan status, release gates and recovery checkpoint. Keep full real Research/public-release outcome unproven. This approval does not permit a ninth request or cloud logging changes; old output is unavailable. A separate next-run proposal is prepared but not authorized or executed.
