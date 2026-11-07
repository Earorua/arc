# Materials Product Projection Observation Collector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement the collector; perform specification review before code quality review. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect reproducible offline observations from the actual extraction projection and course mapper, preserving missing capabilities and rejected inputs as evidence without fabricating a complete candidate evaluation.

**Architecture:** A JSON-only collector calls the existing `validateDocumentExtraction`, then the existing `mapMaterialItemTerms` and `mapMaterialItems` with the published flagship objects. It records raw candidate input, projected items, removed labels, hints, review points and native mapping outputs. It never imports expected course/planning answers, generates task coverage, persists confirmations or claims that a component call proves the user-facing workflow. An independent planning audit separately records why the existing 14 abstract cases need native state bindings.

**Tech Stack:** Node, TypeScript via the installed `tsx` loader, `node:test`, existing Zod contracts, SHA-256, local offline verification wrapper. No network, model provider, remote database or deployment.

## Boundaries and observed reason for this work

The previous source/course references and candidate evaluator are frozen at `f9bd733`. They remain unchanged. Existing component probes found 138 topic differences among 256 authored finite relations, but these include adoption, alias-basis and empty-list representation differences. All 256 positions lack a native task-coverage result. None of these counts is a model quality score.

The new collector observes **constructed synthetic candidates** only. Source records are explicit fixture inputs, not authenticated repository records. Calling the projection does not confirm facts on behalf of a user. Explicit learning-intent options are component stimuli, not evidence of service eligibility or successful adoption. Current historical totals remain 30 real inferences / USD 0.547151 / unsettled 0. This plan authorizes no real model call.

## Task 1: JSON-only actual-product projection collector

**Files:**
- Create `docs/verification/materials-product-observations/collect-projections.ts`.
- Create `docs/verification/materials-product-observations/collect-projections.test.ts`.
- Create `docs/verification/materials-product-observations/collector-protocol.md`.
- Read actual product implementations in `app/server/documents/extraction-validator.ts`, `app/lib/materials/skill-mapper.ts`, their contracts, `flagship-blueprint.ts` and `flagship-unit-registry.ts`.
- Do not modify `app/`, `worker/`, original fixtures, or any frozen `materials-quality-v2` asset.

- [x] **Step 1: Add the failing API and CLI tests.** Export `collectProjectionObservations(inputJson: string)` and guard CLI entry with `import.meta.url`. Tests call the real production functions through the collector; do not substitute a mapper returning an expected answer. Start with an empty API implementation and a real assertion failure, not a missing-module exception.

Input contract (all objects strict; only JSON text accepted):

```ts
type CollectionInput = {
  schemaVersion: "materials-product-projection-input-1";
  provenance: { kind: "constructed-control"; description: string };
  scenarios: Array<{
    id: string;
    ownerId: string;
    reference: {
      ownerId: string; documentId: string; documentVersionId: string;
      textVersionId: string; lifecycle: "active" | "revoked";
      text: string; segments: Array<{ id: string; start: number; end: number }>;
    };
    extraction: unknown; // Preserved JSON. Production validates canonical candidate shape.
    learningIntentItemIds: string[];
  }>;
};
```

Bound the JSON at 8 MiB, 512 scenarios, a nonempty bounded description, unique scenario IDs and unique intent IDs; reject unexpected wrapper/reference/segment keys. Validate reference IDs, owner syntax, text and segment boundaries using explicit bounded contracts before projection; reject duplicate segment IDs and split-surrogate offsets. Intent IDs must name actual submitted candidate IDs, but the collector must not invent service adoption eligibility. Preserve malformed extraction JSON for a production rejection observation when it fits the outer bounds. No caller-supplied provider policy, blueprint, registry, alias, scorer answer or expected coverage option is accepted.

Minimum tests include: SQL literal output; genuinely grounded contextual output; filtered hallucinated label with original candidate unchanged; empty labels with no invented null mapping; a constraint with and without explicit intent; source-bound hint retained separately from item; invalid quote/owner/revoked source rejected; malformed canonical extraction rejected; malformed and oversized outer JSON rejected; duplicate scenario/segment/intent and unknown keys rejected; deterministic collection; no mutation or use of caller-supplied expected outputs; and CLI invalid UTF-8/oversize/argument handling.

- [x] **Step 2: Record the Red run.**

```powershell
node work/grounded-verification/run.mjs product-projections-author-red-20261107 --import tsx --test docs/verification/materials-product-observations/collect-projections.test.ts
```

Expected: genuine assertion failure for missing observed output. Preserve the log.

- [x] **Step 3: Implement the observations without interpreting them as truth.** Use the fixed `KIMI_GROUNDED_TERMS_POLICY_ID`; call production projection once per scenario. On success record the exact projection, native term and item mappings, and label removals by candidate ID. Record empty-term candidates and native coverage absence as explicit gaps. On a known product content rejection record the stable error code, with no invented outputs. Unexpected implementation exceptions must fail the collection instead of masquerading as a normal rejection.

Output must include input SHA-256, ordered scenario input hashes, raw extraction copies, source fixture metadata, product mapping version, blueprint/registry IDs/versions and canonical object hashes. Record declared relevant code-file hashes as partial code evidence, explicitly not a complete runtime attestation. Freeze full runtime/file provenance separately in the report. Preserve `actualModelQualityEvaluated:false`, `actualProductIntegrationVerified:false`, `qualificationApproved:false`, `realModelCalls:0`, and a permanently incomplete candidate-evaluation status. Do not produce `courseObservations` populated from the independent reference or `planObservations` constructed from constraints.

CLI accepts exactly one JSON file, reads at most 8 MiB + 1 bytes with fatal UTF-8 decoding, emits the result to stdout, and exits 1 for a collected but incomplete evaluation; input/implementation errors exit 2 with a short stable message. It must not open output files, overwrite evidence or read environment credentials. Keep the file interface local and JSON-only.

- [x] **Step 4: Run Green and targeted lint.** Use fresh wrapper labels (never overwrite a Red/Green record). Run the same `node --import tsx --test` command and ESLint on the new files. Resolve observed failures rather than weakening expectations.
- [x] **Step 5: Independent specification review, repairs, then quality review.** Reviewers verify no expected answer reaches production and no component result is labeled as service/model/Gate success. Keep review memos and any failing tests. Root commits after both reviews pass.

## Task 2: Run source-authored synthetic observations and freeze gaps

**Files:**
- Add reproducible observation input/results and review evidence under `docs/verification/materials-product-observations/`.
- Create `docs/verification/2026-11-07-materials-product-observation-gaps.md`.
- Update existing recovery/progress documents with an accurate latest checkpoint.

- [x] **Step 1: Generate fixture inputs in a separate driver.** Read frozen source annotations and the finite term enumeration; derive candidate source quotes and fact text from the authored source control. Never read topic, basis, skill IDs, task coverage or planning expected changes while generating collector inputs. Label the source as authored synthetic controls. Preserve the existing 256-position component audit, and state whether any new input uses 255 unique positions or 256 ledger relations. Shared facets must not inflate quality denominators.
- [x] **Step 2: Run the final collector under the offline wrapper.** The collector output file must have a distinct `*-results.json` name; the wrapper owns `<run-label>.json`. Exit 1 means collection succeeded with intentionally incomplete quality evidence. Record exact input/output/script/run/log hashes and all failures separately.
- [x] **Step 3: Archive independent course and native-planning audits.** Preserve group counts and per-case native binding limits. In particular document document/workspace/selection revisions separately, the native Proof ledger, legal target duration, one primary JD, explicit preview acceptance and absence of integrated self-adoption if confirmed by audit.
- [x] **Step 4: Validate evidence and report.** Recheck frozen source/course/scorer and product manifest digests, new tests and evidence links. Distinguish component observations, actual local service probes and unimplemented full fixed-case collection. Never relabel prior failing model runs or infer a new Gate pass.
- [x] **Step 5: Save local commits and recovery instructions.** Keep the current branch/worktree; no push, merge, deploy or remote migration in this batch. Continue later with the native planning binding correction and separately justified product changes.

## Plan review

This is a bounded offline continuation of the approved v2.1 design and the completed independent evaluation work. The result is executable observation tooling and concrete missing-capability evidence; it is not a replacement for the required integration, model-quality or publication steps. Existing user authorization covers the local implementation. No additional approval is needed for this offline batch.

## Execution record — 2026-11-07

Collector commit `c50badd632e8b6cc73072d2b18c9876d07e34a12`: root 36/36, targeted TypeScript and ESLint pass; independent specification 17 groups and code quality 7 groups pass. Collected 267 synthetic component scenarios, preserving three filtered terms and absent native coverage. Independent audits classified the 138 direct-mapper differences and all 14 native planning bindings, including an actual context-only adoption gap. Original product, source/course reference and scorer bytes remain unchanged.

Report: `docs/verification/2026-11-07-materials-product-observation-gaps.md`. Evidence: `docs/verification/materials-product-observations/observation-verification.json` (`5bd943b91de1860435c04bce0790fd9ed1d19d13ff59f7fb871addae90d0f0e6`). Local branch/worktree retained. The specification review records this plan at `59df723`; completion only checks off steps and appends this execution record, without changing the implementation requirements. Full product/model/Gate qualification remains false.
