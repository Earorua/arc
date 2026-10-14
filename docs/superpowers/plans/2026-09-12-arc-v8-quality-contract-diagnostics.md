# Arc v8 Local Quality Contract and Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (already selected by user) to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make the local Kimi request accurately state existing quality rules and retain bounded semantic failure diagnostics without changing acceptance, fees or production behavior.

**Architecture:** Preserve the standard Research/Repair request contract while versioning only the local profile. Reuse real semantic validation results before aggregation, publish a bounded observation to the first local Research Summary, and isolate diagnostics from all business outcomes.

**Tech Stack:** TypeScript, Zod, Vitest, Node24, PowerShell, existing SQLite D1 fixture and Sites portable build.

---

## Approved scope and baseline

User approved the independently reviewed design on this turn. Specification: `../specs/2026-09-12-arc-v8-quality-contract-diagnostics-design.md`. Existing isolated worktree is authoritative; branch codex/v8-openrouter-research-beta, HEAD7090153b4acad7b12df6a7ee4d675b46c41871dc.88 pre-approval handoff fingerprints match; preserve intentional dirty work. Existing baseline1341 is historical evidence, not a new candidate pass.

Local only. No real Keys/env/raw Provider bodies, paid requests/probes/Repair/retries, production flags/variables/D1/R2, Git writes, Sites candidate save or deployment. User's established boundaries supersede generic skill commit/cleanup instructions. Existing subagent workflow is already approved: do not ask again. The goal tool may retain old blocked metadata; design approval resolves that old blocker and local work continues without redefining or recreating the full goal.

Root owns plan/checkpoints/evidence, implementers own only task paths. Before changes, copy identified source/test files to `outputs/local-quality-contract-20260912/before/`, freeze baseline manifest, and keep unrelated source/migrations/hosting/real Summaries protected. Tests may use subprocesses with scoped local sandbox escalation, never live transport. Independent reviews compare against before snapshots because HEAD does not contain recent uncommitted work.

Snapshot storage correction: TypeScript snapshots now use a `.ts.snapshot` suffix so the existing root `**/*.ts` include cannot compile evidence copies. `before/manifest.json` maps all14 original paths to snapshot paths and unchanged SHA256. Root tsconfig remains unchanged; a temporary task-only tsconfig was diagnostic evidence, not a replacement for full-project type checking.

### Task 1: 本地质量规则与 profile v3
**Files:** Modify `app/server/research/openrouter-provider.ts`, `app/server/research/local-validation-profile.json`, `scripts/live-research/run.ps1`; create `tests/server/research-quality-contract.test.ts`. Update current-profile assertions in `tests/server/kimi-launcher-policy.test.ts`, `kimi-output-budget.test.ts`, `kimi-local-validation.test.ts`, `live-output-budget.test.ts`, `live-research-failure-summary.test.ts`, `live-research-validation.test.ts`, `live-response-preflight.test.ts`, `research-request-contract.test.ts` as necessary. Historical-profile rejection cases must remain meaningful.

- [x] Freeze the existing standard Research and Repair request bodies with synthetic arguments and injected mock fetch before editing implementation; store capture/hash evidence under outputs/local-quality-contract-20260912/task1. Preserve both complete bodies and their SHA256, excluding headers/credential values. Use immutable expected hashes in a regression test.
- [x] Write RED assertions for exact new profile and precise local policy, capturing the actual constructed request through injected fetch. A minimal profile RED:
```ts
expect(getKimiLocalValidationProfile()).toMatchObject({
  profileId: "kimi-low-output32k-v3",
  outputPolicyVersion: "kimi-complete-quality-v2",
  maxOutputTokens: 32768,
});
```
Add assertions for reciprocal resource links, exactly-once stage coverage, globally unique step/checkpoint IDs, both free-alternative layers, valid authority evidence, <=60/>60 checkpoint rules applying to all kinds, and absence of the old atomic-calibrate/reinforce clause in local requests. Run `node node_modules/vitest/vitest.mjs run tests/server/research-quality-contract.test.ts`; save actual RED output and explain missing behavior.
- [x] Update the JSON profile to:
```json
{"profileId":"kimi-low-output32k-v3","model":"moonshotai/kimi-k3","reasoningEffort":"low","maxOutputTokens":32768,"outputPolicyVersion":"kimi-complete-quality-v2","researchTimeoutMs":1200000,"activeTtlMs":1260000,"launcherTimeoutMs":1320000}
```
Update exact TypeScript and PowerShell admission literals/console profile. No model/search/budget/time/privacy changes; native and launcher must still consume strict validated profile. Reject old/mixed profiles before credential input or transport.
- [x] Compose local v2 from shared security/output rules plus a dedicated exact-quality section. Preserve standard and Repair bodies byte-for-byte. Do not use runtime string replacement to remove conflicting text. Local rules must cover approved spec section 3 items 1–8 in full, including necessary skill scope/no hidden cap, at least one learn/exactly one calibrate/exactly one reinforce/max8 templates per skill, uniqueness, links, evidence, honest tiers, both free-alternative layers, all-kind duration/checkpoint rules, criteria/rubric uniqueness, real pedagogy, JSON-only self-check without chain-of-thought or extra fields.
- [x] Run new focused test and eight affected existing suites. Capture changed local request size (no arbitrary old size assertion), unchanged standard/Repair hashes, fingerprint change and stale-profile rejection; do not relax invariant assertions. Run non-incremental tsc and targeted ESLint on changed TS files.
- [x] Self-review and hand off exact changed paths plus RED/GREEN logs. Root dispatches independent SPEC then independent QUALITY/security review, resolves each finding and re-reviews before Task 2. No Git staging/commit.

### Task 2: 在原质量校验点建立有限诊断
**Files:** Create `app/server/research/quality-diagnostic.ts`, `tests/server/research-quality-diagnostic.test.ts`, `tests/server/research-quality-observation.test.ts`; modify `app/server/research/package-validator.ts`. Keep `app/contracts/*`, `app/lib/intelligence-validation.ts`, `app/lib/planning/registry-validation.ts` unchanged.

- [x] Write failing tests using actual `validateResearchCandidate` and golden/invalid fixtures. The new optional fourth argument is `{ onQualityDiagnostic?: ResearchQualityDiagnosticObserver }`. Test observation count and unchanged result:
```ts
const seen: unknown[] = [];
const baseline = validateResearchCandidate(validResearchCandidate, validAnnotations, context);
const observed = validateResearchCandidate(validResearchCandidate, validAnnotations, context, {
  onQualityDiagnostic: value => seen.push(value),
});
expect(observed).toEqual(baseline);
expect(seen).toHaveLength(1);
expect(seen[0]).toMatchObject({
  version: "quality-diagnostic-v1", stage: "semantic-validation",
  blueprintSchema: { outcome: "accepted", issues: [], truncated: false },
  registrySchema: { outcome: "accepted", issues: [], truncated: false },
  blueprintIssueCodes: [], registryIssueCodes: [], evidenceIssueCodes: [],
});
```
Use a temporary empty observational stub only if required for import/type harness; first behavior failure must show missing diagnostic, not a syntax or import error. Record RED before implementation.
- [x] Export `ResearchQualityDiagnostic`, `ResearchQualityDiagnosticObserver`, `buildResearchQualityDiagnostic`, `projectResearchQualityDiagnostic`, and `observeResearchQualityDiagnostic` from the new isolated module. Define builder input as already observed results:
```ts
type SchemaObservation = Readonly<{ success: boolean; issues: readonly z.core.$ZodIssue[] }>;
type ResearchQualityDiagnosticInput = Readonly<{
  blueprintSchema: SchemaObservation; registrySchema: SchemaObservation;
  blueprintIssueCodes: readonly IntelligenceIssueCode[];
  registryIssueCodes: readonly RegistryIssueCode[];
  evidenceIssueCodes: readonly EvidenceQualityIssueCode[];
}>;
type ResearchQualityDiagnosticObserver = (diagnostic: Readonly<ResearchQualityDiagnostic>) => unknown;
```
The concrete diagnostic uses version/stage, two schema outcomes with capped fixed scope/code pairs, and three unique sorted enum lists exactly as approved spec section 5. Export EvidenceQualityIssueCode for validator helper instrumentation. Freeze explicit 13/10/9 enum allowlists; Zod issues use existing candidate 7-code vocabulary, unknown Zod code becomes other.
- [x] Build by projecting trusted schema path shapes into fixed scopes (blueprint root/skill/resource/stage/unknown; registry root/track/template/alternative-resource-ids/step/checkpoint/checkpoint-step-ids/completion-criteria/rubric/unknown). Validate path edges and numeric array positions; never use dynamic text as scope. Deduplicate/sort pairs then cap16 each, exact truncated semantics. Project unknown diagnostic into new own-data plain objects after descriptor/prototype/key validation. Reject extra/symbol keys, getters, unsafe prototype, toJSON, bad enums, unsorted/duplicate lists, oversized arrays and inconsistent accepted/truncated shapes. Enforce8192 UTF-8 bytes. Invalid projects to null, no raw message/path/IDs/content copied.
- [x] Reuse each existing schema/blueprint/registry call once in package-validator. Capture their results before code aggregation, preserving original returned results, sanitized candidate, package fingerprint, all conditions and exception behavior. Only when optional observer exists, collect the nine evidence categories corresponding to existing predicates. Preserve short-circuit behavior when observation is off; collect all simultaneous duplicate categories when on without changing business codes. Invoke safe builder/observer once after all semantic checks and before aggregate failure/package-schema branch. Early candidate/source/context failures emit nothing. Do not catch business exceptions inside observational isolation.
- [x] Verify direct quality outcomes for ten investigation scenarios, additional enum branches, meaningful 60/61/minutes boundaries and a legal long calibrate/reinforce; invalid cases must remain invalid. Cover duplicate short-circuit categories, schema refinements, every scope/code, caps, sorting/dedup, malicious IDs/paths/canaries/getters/prototypes/toJSON, observer mutation, sync throw, rejecting and never-settled Promise. Callback must not be awaited and rejection must be handled; no claim of isolating synchronous infinite loops.
- [x] Run `node node_modules/vitest/vitest.mjs run tests/server/research-quality-diagnostic.test.ts tests/server/research-quality-observation.test.ts tests/server/research-package-validator.test.ts tests/server/research-source-audit.test.ts`; then non-incremental tsc and targeted lint. Save actual commands/counts/logs.
- [x] Self-review; Root independently checks diffs and evidence, dispatches SPEC then QUALITY/security reviews and resolves findings. Do not integrate runner/orchestrator yet. No Git staging/commit.

### Task 3: 首次正式校验观察与安全 Summary
**Files:** Modify `app/server/research/orchestrator.ts`, `scripts/live-research/validation.ts`; create `tests/server/research-quality-orchestrator.test.ts`, `tests/server/live-quality-diagnostic.test.ts`. Adjust existing exact Summary-key expectations only where required. No production factory, route, D1, cache, package or UI contract modifications.

- [x] Write RED for default offline Summary exposing semantic diagnostic and local successful/rejected first Research retaining existing state/budget/guard behavior:
```ts
const summary = await runValidation();
expect(summary.researchQualityDiagnostic).toMatchObject({
  version: "quality-diagnostic-v1", stage: "semantic-validation",
  blueprintIssueCodes: [], registryIssueCodes: [], evidenceIssueCodes: [],
});
expect(summary).toMatchObject({
  outcome: "passed", realRequestCount: 0, repairRequestCount: 0,
  runState: "ready", freshAccountActivated: true, planningGenerated: true,
  ownerWrongReadRejected: true, secondResearchRejected: true, databaseDisposed: true,
});
```
Record the expected missing-field failure. Synthetic executeOne tests must inject mock fetch, use dummy Key and reject global fetch.
- [x] Add optional orchestrator dependency `onQualityDiagnostic?: ResearchQualityDiagnosticObserver` and pass it only to first actual `validateResearchCandidate` call:
```ts
let validation = validateResearchCandidate(candidateFromContent(
  extractJson(first.result.content), this.dependencies.onCandidateDiagnostic,
), first.result.annotations, context, { onQualityDiagnostic: this.dependencies.onQualityDiagnostic });
```
Repair, mechanicallyRepairable, cache/read/replay calls stay three-argument and cannot emit. Existing production factory never provides the observer.
- [x] Add `researchQualityDiagnostic: ResearchQualityDiagnostic | null` to ValidationSummary; initialize null and hook local orchestrator:
```ts
onQualityDiagnostic: diagnostic => {
  try { summary.researchQualityDiagnostic = projectResearchQualityDiagnostic(diagnostic); }
  catch { /* Observation only. */ }
},
```
Keep original quality/attempt/usage fields authoritative. No historical Summary rewrite, no public schema changes. Early key/provider/transport/annotations/candidate/source failures stay null. Semantic stage completed then receipt/current/saveValidation failure or lease expiry retains observed diagnostic without claiming Ready.
- [x] Verify first-validation-only invocation, zero cache/replay/Repair/mechanical observations, post-semantic storage/lease failure, before-semantic failure null, output privacy, projector throw/null, sync throw/rejection/pending observer, observer on/off result equivalence, request count/fees/owner/repeated-call/cleanup equivalence. Raw payload fixture is synthetic, never read real content.
- [x] Run new two suites plus research-orchestrator, live-research-validation, live-response-preflight and live-research-failure-summary; non-incremental tsc and targeted lint. Root verifies and dispatches SPEC then QUALITY/security review; fix and re-review all findings. No Git staging/commit.

### Task 4: Root verification and candidate handoff
**Files:** Root updates `docs/operations/v8-quality-contract-validation-2026-09-12.md`, checkpoints, evidence in outputs/local-quality-contract-20260912; may prepare `docs/operations/v8-quality-contract-live-validation-2026-09-12.md` only after the candidate passes.

- [x] Inspect each implementation diff against before snapshots and confirm every spec section maps to Tasks1–3 and tests. Record SPEC then QUALITY verdicts in order.
- [x] Run the exact42-suite list in `outputs/local-quality-contract-20260912/root-suite-plan.json`: five new suites plus37 discovered Research/provider/runner/API/shared-validator suites. The prior36-suite dot-reporter log does not enumerate paths, so use the current explicit discovery rather than invent a historical list. Run `node node_modules/typescript/bin/tsc --noEmit --incremental false` and targeted ESLint on the changed TS path list captured for each task. Record actual new counts; expand beyond this scope only for changed shared behavior or unresolved failures.
- [x] Read current Sites building/hosting local-build instructions before building. Use the installed portable build command from prior successful evidence, reverify Worker exports, hosting metadata and all15 migration artifacts/38 client files using the existing read-only verifier after checking its assumptions. Build creates only local artifacts.
- [x] Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/live-research/run.ps1` with no mode switch. This is default offline, no Key, zero actual requests. Inspect new Summary for profilev3, quality diagnostic, accepted full synthetic lifecycle, authoritative usage, owner/repetition guards, DB cleanup and actual exit0.
- [x] Freeze final candidate and unaffected/historical fingerprints. Dispatch independent final integration review after local gates pass; resolve all findings and verify impacted checks again. Use finishing-a-development-branch only to preserve the user's requested local branch; do not offer unsolicited merge/push choices or perform integration.
- [x] Update checkpoints with candidate source/test counts and limitations. Full real Research still unproved; attempt14 consumed. Prepare a concrete attempt15 proposal with same32k/10/50/USD5/20-21-22min only if all gates pass, then ask only for its new single-call authorization.

## Self-review
All seven approved design sections map to tasks: factual boundary/global exclusions to baseline+Task4; request rules/profile toTask1; diagnostic hook and vocabulary/privacy toTask2; first-call-only and stage-vs-final semantics toTask3; TDD/double review/build/offline toall tasks+Task4; no new real permission tobaseline+Task4. Signatures are fixed above and must remain consistent. No task adds a public field, weakens quality, or alters standard request/Repair. No implementation requires user to repeat existing workflow approval.

## Root completion record
All four local tasks complete. Exact42 files1529/1529, full original nonincremental tsc,18TS lint, Sites localbuild/artifacts and default offline PowerShell exit0. Final independent integration FINAL READY.108 candidate/55 artifact hashes frozen;70 protected and16 historical safe Summaries unchanged. Keep branch/worktree as user instructed; no Git/production/Sites writes. Attempt15 proposal is prepared but unauthorized; full real Research/public release remains incomplete. See docs/operations/v8-quality-contract-validation-2026-09-12.md and outputs/local-quality-contract-20260912/root-final-validation.json.
