# Arc v8 Response Preflight Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking. User already chose this workflow; do not re-ask.

**Goal:** Collect bounded annotation failure classes and independent candidate schema diagnostics in local validation without changing authoritative acceptance, billing or quality.

**Architecture:** Optional local-provider callback runs only after complete stop/content framing gates. Two pure modules classify annotations and project combined preflight metadata, reusing the existing candidate parser and URL/schema checks. Local Summary receives a separate field; standard/Repair and existing business diagnostics retain their meaning.

**Tech Stack:** TypeScript, existing Zod4, Vitest, injected synthetic fetch, temporary SQLite; no new dependencies.

---

Approved design: `docs/superpowers/specs/2026-09-12-arc-v8-response-preflight-diagnostics-design.md` (user approved 2026-09-12). Work only in the existing authoritative v8 worktree, branch codex/v8-openrouter-research-beta, HEAD7090153b4acad7b12df6a7ee4d675b46c41871dc. Preserve dirty progress; no Git writes/commit despite generic skill defaults. No real keys/env/raw bodies, network Provider/probes, production data/config, Sites save/deploy. Attempt13 consumed; no attempt14 permission.

Evidence directory: `outputs/local-response-preflight-20260912/`. Initial54 hashes match; protected52 excludes only existing adapter and validation.ts. Those two have before snapshots. New modules/tests are additions, not exceptions to protected files. Record RED/GREEN actual outputs and stage hashes. Default sandbox spawn EPERM is infrastructure failure, not RED; use a narrowly scoped offline command escalation if necessary.

## Task 1: Pure diagnostics and optional local adapter observation

**Create:** `app/server/research/annotation-diagnostic.ts`, `app/server/research/response-preflight-diagnostic.ts`, `tests/server/research-annotation-diagnostic.test.ts`, `tests/server/research-response-preflight.test.ts`, `tests/server/openrouter-response-preflight.test.ts`.

**Modify:** `app/server/research/openrouter-provider.ts` only. Do not modify provider.ts, result-diagnostic.ts, source-audit.ts or contracts.

- [x] **Step 1: Write behavioral RED through the existing local factory before adding modules.** Inject a stop response containing validResearchCandidate and nested title:null, safe usage0.1 and search count2. Pass a new onResponsePreflightDiagnostic spy (temporarily cast options in RED so missing callback, rather than import failure, is the observed failure).

```ts
expect(preflight).toHaveBeenCalledOnce();
expect(preflight.mock.calls[0]?.[0]).toMatchObject({
  version: "response-preflight-v1", stage: "complete-content-preflight",
  annotations: { state: "incompatible", issues: [{ index: 0, code: "title-null" }] },
  candidateSchema: { outcome: "accepted", reason: null },
});
expect(error).toMatchObject({ code: "invalid-transport", charged: true });
```

Use valid-candidate fixture plus Response.json; global fetch denied, only injected fetch answers. Run `node node_modules/vitest/vitest.mjs run tests/server/openrouter-response-preflight.test.ts`; expected missing callback assertion. Preserve actual RED output before source changes.

- [x] **Step 2: Implement bounded annotation observation and safe projection.** Public functions: `buildAnnotationDiagnostic(annotations: unknown): AnnotationDiagnostic | null` and `projectAnnotationDiagnostic(input: unknown): AnnotationDiagnostic | null`. Implement the approved15 codes and exact fields/limits in the spec, keeping checks on actual validator rules. Container missing/null compatible0; other incompatible/null counts; >256 count257 without reading entries. Normal arrays scan all up to256; ignored+recognized=count. Nested missing/nonobject/flat classifications exclude redundant child issues; valid nested objects independently report URL/title problems. Missing-title-only fallback uses existing canonicalizer; provided titles do not prematurely trigger URL security. Sort unique issues by index then declared code order, cap16, truncated only if extra distinct issues. Strict projection validates container/count/state/issue consistency and creates fresh finite data, avoiding getter/toJSON invocation and rejecting unsafe input. Internal reflection faults returnnull; no arbitrary values or keys retained.

- [x] **Step 3: Implement combined preflight.** API: `buildResponsePreflightDiagnostic(content: string, annotations: unknown): ResearchResponsePreflightDiagnostic | null`; `projectResponsePreflightDiagnostic(input: unknown): ResearchResponsePreflightDiagnostic | null`. Type has fixed version/stage, annotations nullable, candidateSchema nullable. Each builder isolated from the other. Reuse candidateFromContent and projectValidationCandidateDiagnostic, discard candidate return; do not normalize content in this observer or weaken parser bounds. A legal fenced JSON may fail this raw-content preflight yet later succeed through existing orchestrator normalization: explicitly test the distinction, not override business behavior.

```ts
let candidateSchema: ResearchCandidateDiagnostic | null = null;
try {
  candidateFromContent(content, (diagnostic) => {
    candidateSchema = projectValidationCandidateDiagnostic(diagnostic);
  });
} catch { /* Independent observation only. */ }
```

Safe projection first inspects own data descriptors, rejects accessors/unknown keys and invalid nested metadata, then serializes only freshly projected values to enforce8192 UTF8 bytes. Candidate projection rules and16 canonical paths are inherited; do not stringify untrusted input. No logs, files, fetch, DB, raw error/body values or IDs.

- [x] **Step 4: Wire local-only callback after existing framing, before annotations gate.** Add optional onResponsePreflightDiagnostic to local options/private dependencies/readResponse only. Standard class does not expose or forward it; Repair never invokes. At complete-stop/nonblank/bounded-content point:

```ts
if (!repair && onResponsePreflightDiagnostic) {
  try {
    const diagnostic = buildResponsePreflightDiagnostic(content, message?.annotations);
    if (diagnostic) void Promise.resolve(onResponsePreflightDiagnostic(diagnostic)).catch(() => undefined);
  } catch { /* Observation must not change the provider result. */ }
}
```

Keep old authoritative annotation block, candidate parsing and audit/fail mapping unchanged. Do not use preflight candidate as cache. Do not await callbacks; emit at most once per call, fresh values across calls. HTTP/error/choice/refusal/length/content-size/transport gates remain before preflight.

- [x] **Step 5: Expand RED/GREEN matrix.** All10 synthetic failures from prior investigation, missing/null/valid title, URL/title string type/trim/min/max (Unicode length semantics), missing/null/empty containers,256/257 arrays, ignored types, mixed multiple entries, two bad fields, issue ordering/dedup/truncation, invalid candidate syntax/schema/limits and valid candidate. Exercise getter/toJSON/canary projection, malformed finite fields, suspicious URLs with provided versus missing title, projection/builder throw, observer throw/reject/pending, fresh per-call state and cap8192. Parameterize observed/unobserved result and audit equality, byte-for-byte request body equality, standard/Repair dormant and no extra calls. Use actual old adapter fixtures/contracts, not a duplicate mock validator.

- [x] **Step 6: Run Task1 regression and checks.** `node node_modules/vitest/vitest.mjs run tests/server/research-annotation-diagnostic.test.ts tests/server/research-response-preflight.test.ts tests/server/openrouter-response-preflight.test.ts tests/server/openrouter-response-compatibility.test.ts tests/server/openrouter-provider.test.ts tests/server/kimi-local-validation.test.ts tests/server/provider-result-diagnostic.test.ts tests/server/research-candidate-diagnostic.test.ts tests/server/research-request-contract.test.ts tests/server/research-search-policy.test.ts`; nonincremental `node node_modules/typescript/bin/tsc --noEmit --incremental false`; eslint six changed files. Expected exit0. Record outputs/hashes, self-review, report DONE/concerns; no commit.
- [x] **Step 7: Independent SPEC then QUALITY/SAFETY.** Root freezes six files; fresh reviewers inspect actual changes/evidence. Original implementer fixes findings with focused RED/GREEN and reviewer rechecks. Only after both READY begin Task2.

## Task 2: Separate safe Summary field and actual service integration

**Modify:** `scripts/live-research/validation.ts`. **Create:** `tests/server/live-response-preflight.test.ts`. Task1 frozen; report any demonstrated dependency before changing it.

- [x] **Step 1: Summary RED.** Use actual runValidation executeOne with synthetic Key GET policy and injected POST fixture. Make annotation title:null and remove candidate.evidence. Global real fetch denied. Expect both diagnostic dimensions while old candidate observation remainsnull:

```ts
expect(summary).toMatchObject({ outcome: "incomplete", reason: "research-failed",
  researchResponsePreflightDiagnostic: {
    annotations: { state: "incompatible", issues: [{ index: 0, code: "title-null" }] },
    candidateSchema: { outcome: "rejected", reason: "schema-rejected" },
  },
  researchCandidateDiagnostic: null, researchRunDiagnostic: { quality: null },
  reservation: { status: "settled", settledMicros: 100_000 },
  freshAccountActivated: false, planningGenerated: false, repairRequestCount: 0,
  ownerWrongReadRejected: true, secondResearchRejected: true, databaseDisposed: true,
});
```

Run `node node_modules/vitest/vitest.mjs run tests/server/live-response-preflight.test.ts`; expected missing Summary field RED, not startup failure. Preserve output before editing validation.ts.

- [x] **Step 2: Add type/default/local callback only.** Import Task1 combined type/projector; add `researchResponsePreflightDiagnostic: ResearchResponsePreflightDiagnostic | null` to type and initialize null. Callback in local factory projects inside try/catch to this separate field. Never assign researchCandidateDiagnostic or run quality from preflight. Key-only, early rejection and modes with no local Research observer remainnull. Default offline fixture actually runs local adapter, so emits preflight metadata without real requests; minimal/account-check/other independent script Summary shapes remain unchanged.
- [x] **Step 3: Cross-product GREEN.** Cover bad annotations+good candidate, bad+bad, good+bad, good+good. Include legal fenced JSON distinction (raw preflight syntax rejected, actual normalized business candidate accepted); complete synthetic good data must still produce ready/quality/settlement/activation/planning/owner/second-call guard/disposal. Explicitly test source-unsafe but structurally valid data cannot be rescued by preflight. Check payment unknown/missing usage remains existing conservative hold, not fabricated success.
- [x] **Step 4: Fault/privacy/boundary tests.** Safe projector failures leave successful or failed business outcome intact; unknown keys/getters/canaries cannot enter field. Missing Key/key-check-only/length/content/transport rejection keepnull; repeated runs cannot retain last preflight. Observe exact GET1/POST1/Repair0 in synthetic executeOne, default0 external calls, approved profile/fingerprint unchanged, existing diagnostics independent.
- [x] **Step 5: Regression/static/double review.** Run `node node_modules/vitest/vitest.mjs run tests/server/live-response-preflight.test.ts tests/server/live-research-validation.test.ts tests/server/live-candidate-diagnostic.test.ts tests/server/live-result-diagnostics.test.ts tests/server/live-research-failure-summary.test.ts tests/server/live-output-budget.test.ts tests/server/live-transport-diagnostics.test.ts tests/server/openrouter-response-preflight.test.ts`; nonincrementaltsc, eslint two changed files. Freeze evidence, independent SPEC then QUALITY/SAFETY; fix findings and re-review before finalization.

## Root final validation and handoff

- [x] Run union of new and affected adapter/result/candidate/validation/request/profile/runner/native/transport tests once on final code, using prior31-file final set plus four new suites and existing live-candidate-diagnostic.test.ts for the normalized-versus-preflight distinction (36 suites). Add tests only for specific uncovered risks; do not sum stage counts as unique tests.
- [x] Nonincrementaltsc and lint final eight changed files. Use current Sites portable skill's existing project build, inspect Worker defaultfetch, hosting/client/migration hashes. Execution-profile configured:false means preserve existing scripts; it does not mean Vite configFile:false. This project's build loads vite.config.ts; filename-only check found only .env.example, no runtime .env or .dev.vars. No publish. Root owns build and defaultPowerShell zero-real-request rehearsal, records fresh safe Summary and actualexit.
- [x] Check protected52 (including historical real summaries) and final eight file hashes, then independent final integration review. Preserve actual failure evidence, fix findings, rerun only affected checks when justified.
- [x] Update implementation record, checkpoint, goal and gates. Local diagnostics passed does not establish actual annotation root cause or full Research success. Prepare next concrete candidate if needed; no new live command/request without specific new permission. Do not merge/push/save/deploy.

Root self-review: both independent observation dimensions, projection/privacy bounds, parser/normalization distinction, all framing and old acceptance/billing rules, default-offline versus other modes, error isolation, phased double review and final local build are covered. Existing worktree and SDD already authorized; no workflow choice or Git commit confirmation needed.

Final result: 2026-09-12 all local tasks complete; FINAL READY by preflight_final_integration. Root 36 suites/1341 tests, types, lint8, local build/artifacts and default offline terminal exit0. Candidate68 frozen. No attempt14 permission; concrete live proposal awaits separate authorization. See the implementation record for fresh evidence and limitations.
