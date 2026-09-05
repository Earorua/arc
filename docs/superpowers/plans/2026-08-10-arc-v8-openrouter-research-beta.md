# Arc. v8 OpenRouter Research Beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a signed-in, source-backed Research Beta that turns a non-Flagship role into a validated, owner-bound research package and feeds it into Arc.'s existing deterministic path and planning engine without enabling production AI or deploying the site.

**Architecture:** Keep OpenRouter transport, research orchestration, validation, persistence, planning resolution, and Setup presentation behind separate interfaces. A request-driven orchestrator persists every state transition in D1, enforces idempotency and atomic cost reservations, validates citation-backed packages, and exposes only a bounded public run view; planning resolves a Ready package by authenticated owner and immutable package identity for both initial generation and later event replay. Existing Flagship planning, legacy custom-role setup, public `/intelligence`, Today, Proof, and Stack remain compatible.

**Tech Stack:** TypeScript 5.9, React 19, Vinext/Next-compatible App Router, Zod 4, Cloudflare Workers `fetch`, D1/SQLite via prepared statements, Drizzle migrations, Vitest, Testing Library, ESLint.

---

## Fixed boundaries

- Keep `OPENROUTER_API_KEY`, model names, routing controls, provider usage, and raw failures server-only.
- Do not activate a real key, paid call, production variable, feature flag, production D1/R2 operation, Sites version, or deployment in this plan.
- Keep `/api/intelligence/preview` and its deterministic mock contract intact for compatibility; the new Research Beta uses separate contracts and routes.
- Do not display confidence, model, provider, token, or cost. The server alone inserts `confidence: 0.75` while adapting validated research output to the existing `RoleBlueprint` wire type.
- Use D1 for authoritative research and budget state. Browser state may retain only a current run id for refresh recovery.
- Render all external text as React text. Do not use `dangerouslySetInnerHTML`, fetch citation pages, or persist full search excerpts, prompts, or provider error payloads.

## File map

- `app/contracts/research.ts`: strict domain and public API schemas for requests, run states, provider-neutral candidates, source evidence, quality reports, packages, and usage.
- `app/server/research/source-audit.ts`: canonicalize and bind citation annotations; reject unsafe or unreferenced URLs without crawling them.
- `app/server/research/package-validator.ts`: adapt provider candidates, inject compatibility confidence, run intelligence/registry invariants, and create an explainable hard-gate report.
- `app/server/research/repository.ts`: research-run, package, owner lookup, retry, and cache repository contracts.
- `app/server/research/d1-repository.ts`: owner-scoped D1 implementation, CAS transitions, active-run dedupe, immutable package persistence, and Ready package reads.
- `app/server/research/budget.ts`: cost-reservation policy and repository contracts using integer micros.
- `app/server/research/d1-budget-repository.ts`: atomic daily/monthly budget bucket reservations and idempotent settlement.
- `app/server/research/provider.ts`: provider-neutral research interface and typed transport errors.
- `app/server/research/openrouter-provider.ts`: the only OpenRouter-specific request/response module.
- `app/server/research/orchestrator.ts`: gate ordering, state machine, provider call, optional one-time repair, validation, quota/cost settlement, and retry semantics.
- `app/server/research/fake-provider.ts`: deterministic local/UAT provider with Ready, Needs review, Failed, and timeout modes.
- `app/server/research/service-factory.ts`: production dependency composition that fails closed unless explicitly configured.
- `app/server/http/research-route-factories.ts`: bounded body parsing, auth/rate/error mapping, and route telemetry.
- `app/api/intelligence/research/route.ts`, `app/api/intelligence/research/[id]/route.ts`, `app/api/intelligence/research/[id]/retry/route.ts`: thin App Router adapters.
- `app/server/planning/source-resolver.ts`: Flagship and owner-bound Ready package resolution for generation and replay.
- `app/server/planning/service.ts`, `app/server/planning/repository.ts`, `app/server/planning/d1-planning-repository.ts`, `app/contracts/planning-api.ts`: discriminated planning source and immutable source-reference persistence.
- `app/lib/research-client.ts`, `app/lib/use-role-research.ts`: safe client transport and refresh-resumable controller.
- `app/components/setup/role-research-panel.tsx`, `app/components/setup/setup-flow.tsx`, `app/components/setup/adaptive-setup-flow.tsx`, `app/setup/page.tsx`, `app/globals.css`: embedded, accessible Research Beta Setup experience.
- `db/schema.ts`, `drizzle/0005_openrouter_research_beta.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/0005_snapshot.json`: additive schema and generated migration artifacts. `db/index.ts` remains the runtime helper; `drizzle.config.ts` selects `db/schema.ts`.
- `.env.example`, `worker-configuration.d.ts`, `app/server/admin/*`, `app/api/admin/health/route.ts`: disabled-by-default runtime contract and aggregate operational health.
- `tests/fixtures/research/*`: provider-neutral golden and adversarial fixtures containing no secrets and no network dependency.

### Task 1: Define strict research contracts and fixtures

**Files:**
- Create: `app/contracts/research.ts`
- Create: `tests/fixtures/research/valid-candidate.ts`
- Create: `tests/fixtures/research/invalid-candidates.ts`
- Create: `tests/contracts/research-contracts.test.ts`

- [x] **Step 1: Write failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import {
  researchCandidateSchema,
  researchRequestSchema,
  researchRunPublicViewSchema,
} from "../../app/contracts/research";
import { validResearchCandidate } from "../fixtures/research/valid-candidate";

describe("research contracts", () => {
  it("accepts the bounded public request and rejects injected control fields", () => {
    expect(researchRequestSchema.parse({
      mutationId: "mutation-research-00000001",
      role: "数据产品经理",
      locale: "zh-CN",
    })).toEqual({ mutationId: "mutation-research-00000001", role: "数据产品经理", locale: "zh-CN" });
    expect(() => researchRequestSchema.parse({
      mutationId: "mutation-research-00000001", role: "数据产品经理", locale: "zh-CN", model: "attacker/model",
    })).toThrow();
  });

  it("forbids provider-authored confidence", () => {
    expect(researchCandidateSchema.parse(validResearchCandidate)).toEqual(validResearchCandidate);
    expect(() => researchCandidateSchema.parse({
      ...validResearchCandidate,
      skills: [{ ...validResearchCandidate.skills[0], confidence: 0.99 }],
    })).toThrow();
  });

  it("exposes status and explainable counts but no provider metadata", () => {
    const view = researchRunPublicViewSchema.parse({
      id: "research-run-1", state: "ready", role: "数据产品经理", locale: "zh-CN",
      retryable: false, observedAt: "2026-08-27", skillCount: 3, sourceCount: 4,
      quality: { passed: true, issueCodes: [] }, packageId: "research-package-1",
    });
    expect(view).not.toHaveProperty("provider");
    expect(view).not.toHaveProperty("costMicros");
  });
});
```

- [x] **Step 2: Run the contract test and verify RED**

Run: `npm run test:unit -- tests/contracts/research-contracts.test.ts`

Expected: FAIL because `app/contracts/research.ts` and fixtures do not exist.

- [x] **Step 3: Add complete bounded schemas and exported types**

Define these exact public unions and limits in `app/contracts/research.ts`:

```ts
export const researchStateSchema = z.enum([
  "queued", "researching", "validating", "ready", "needs-review", "failed",
]);
export const researchRequestSchema = z.object({
  mutationId: z.string().trim().min(8).max(128).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  role: z.string().trim().min(2).max(160),
  locale: z.enum(["zh-CN", "en-US"]),
}).strict();
export const researchQualityReportSchema = z.object({
  passed: z.boolean(),
  issueCodes: z.array(z.enum([
    "invalid-schema", "invalid-graph", "invalid-registry", "missing-skill-source",
    "missing-core-authority", "unsafe-url", "unreferenced-url", "missing-free-alternative",
    "missing-unit", "minute-mismatch", "unsafe-content",
  ])).max(64),
  skillCount: z.number().int().min(0).max(64),
  sourceCount: z.number().int().min(0).max(256),
  unitCount: z.number().int().min(0).max(512),
  observedAt: calendarDateSchema,
}).strict();
```

Add strict candidate schemas for role summary, 1–64 skills, prerequisite edges, 1–256 resources, 1–24 stages, 1–512 unit templates, and candidate evidence ids. Resource URLs must initially be bounded strings; URL safety belongs to source audit. Define `ResearchPackage` with canonical `RoleBlueprint`, `UnitRegistry`, source evidence, quality report, versions, `contentFingerprint`, `observedAt`, and `expiresAt`. Define `ResearchRunPublicView` as the discriminated public union: active states have no package; Ready exposes package summary/id; Needs review exposes only issue codes/counts; Failed exposes a stable public failure category and `retryable`.

Create one three-skill valid candidate fixture whose resource ids, skill ids, stage ids, and unit ids form a complete connected graph. Create named invalid fixture builders for confidence injection, missing citations, a dependency cycle, minute mismatch, paid-only primary, HTML payload, and oversized text.

- [x] **Step 4: Run the contract tests and type-check**

Run: `npm run test:unit -- tests/contracts/research-contracts.test.ts`

Expected: PASS with 3 or more tests.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [x] **Step 5: Commit**

```powershell
git add app/contracts/research.ts tests/contracts/research-contracts.test.ts tests/fixtures/research
git commit -m "feat: define research beta contracts"
```

**Task 1 evidence, 2026-08-30:** Implementation `2666662`, spec remediation `2b2e9f0`. Fresh controller verification: 19/19 focused tests, TypeScript exit 0, focused ESLint exit 0. Independent spec review passed; independent quality review reported Critical 0 / Important 0, with two nonblocking hardening notes assigned to Task 2: layer research-specific package bounds over inherited canonical schemas and add negative regression tests for existing quality/usage/collection guards. Task 1 commit step is complete.

### Task 2: Audit citations and validate research packages

**Files:**
- Create: `app/server/research/source-audit.ts`
- Create: `app/server/research/package-validator.ts`
- Create: `tests/server/research-source-audit.test.ts`
- Create: `tests/server/research-package-validator.test.ts`
- Modify: `tests/fixtures/research/valid-candidate.ts`
- Modify: `app/contracts/research.ts` (research-package bounds only)
- Modify: `tests/contracts/research-contracts.test.ts` (review hardening regressions)

**Integration constraint:** Task 1's fixture is structurally valid only. Before using it as the Ready golden sample, supply at least one learn, exactly one calibrate, and exactly one reinforce template for each skill, with globally unique step/checkpoint ids. Units over 60 minutes need contiguous, complete 30–60 minute checkpoints. These are existing `validateUnitRegistry` requirements; do not weaken them or synthesize missing learning content in the validator.

**Review hardening:** Add a failing package-boundary test for 65 inherited blueprint skills and enforce research-specific bounds without changing the canonical domain type. Add negative tests for duplicate quality issue codes, passed/issue contradictions, inconsistent token totals, candidate collection maxima, and empty Needs-review issue codes. Existing correct guards need coverage, not behavioral rewrites.

- [x] **Step 1: Write source policy and quality golden tests**

```ts
it("normalizes public HTTPS citations and rejects candidate URLs absent from annotations", () => {
  const annotations = [{ type: "url_citation", url: "https://Example.com/docs/?utm_source=x#intro", title: "Docs" }];
  expect(auditResearchSources(validResearchCandidate, annotations, "2026-08-27").sources[0].canonicalUrl)
    .toBe("https://example.com/docs/");
  expect(() => auditResearchSources(candidateWithResource("https://evil.example/course"), annotations, "2026-08-27"))
    .toThrowError(SourcePolicyError);
});

it.each([
  ["missing-skill-source", invalidResearchCandidates.missingSkillSource],
  ["invalid-graph", invalidResearchCandidates.dependencyCycle],
  ["minute-mismatch", invalidResearchCandidates.minuteMismatch],
  ["missing-free-alternative", invalidResearchCandidates.paidOnlyPrimary],
  ["unsafe-content", invalidResearchCandidates.htmlPayload],
])("reports %s without producing a Ready package", (code, candidate) => {
  const result = validateResearchCandidate(candidate, validAnnotations, validationContext);
  expect(result.ready).toBe(false);
  expect(result.quality.issueCodes).toContain(code);
});
```

- [x] **Step 2: Run focused tests and verify RED**

Run: `npm run test:unit -- tests/server/research-source-audit.test.ts tests/server/research-package-validator.test.ts`

Expected: FAIL because audit and validator modules do not exist.

- [x] **Step 3: Implement URL canonicalization and citation binding**

`canonicalizePublicCitationUrl(value)` must parse with `URL`, require `https:`, reject username/password, localhost, IP literals, `.local`, `.internal`, and hostnames without a dot, lower-case the host, remove fragments and tracking parameters `utm_*`, `gclid`, `fbclid`, sort remaining query params, and cap the canonical URL at 2048 characters. `auditResearchSources` must deduplicate by canonical URL, hash only the bounded annotation identity, and require every candidate resource URL to match an annotation URL. It must never call `fetch`.

Use the exact persisted projection:

```ts
export type AuditedSource = Readonly<{
  canonicalUrl: string;
  title: string;
  hostname: string;
  sourceTier: "primary" | "institutional" | "practitioner" | "community";
  observedAt: string;
  citationHash: string;
}>;
```

- [x] **Step 4: Implement deterministic package adaptation and hard gates**

`validateResearchCandidate(candidate, annotations, context)` must:

1. strict-parse the provider-neutral candidate;
2. audit citations;
3. create the existing `RoleBlueprint` with `confidence: 0.75` inserted for every skill;
4. create `UnitRegistry` and verify every step-minute sum equals `estimatedMinutes`;
5. run `validateRoleBlueprint` and `validateUnitRegistry`;
6. require at least one cited source per skill and a primary/institutional source per core skill;
7. require a free alternative for every paid/mixed primary resource;
8. reject HTML/control payload patterns while preserving ordinary comparison characters;
9. return sorted unique issue codes and counts;
10. compute the package fingerprint with the existing canonical JSON/fingerprint helpers.

The return type is exact and makes unsafe promotion impossible:

```ts
export type ResearchValidationResult =
  | { ready: true; package: ResearchPackage; quality: ResearchQualityReport }
  | { ready: false; quality: ResearchQualityReport; sanitizedCandidate: ResearchCandidate | null };
```

- [x] **Step 5: Run focused and Phase 1 validator regression tests**

Run: `npm run test:unit -- tests/server/research-source-audit.test.ts tests/server/research-package-validator.test.ts tests/lib/intelligence-validation.test.ts tests/lib/planning/registry-validation.test.ts`

Expected: all tests pass; no network call occurs.

- [x] **Step 6: Commit**

```powershell
git add app/server/research/source-audit.ts app/server/research/package-validator.ts tests/server/research-source-audit.test.ts tests/server/research-package-validator.test.ts tests/fixtures/research
git commit -m "feat: validate citation backed research packages"
```

**Task 2 evidence, 2026-08-30:** Implementation `380708b`; scoped review corrections `af31ae5`, `bf82f1f`, `89c803f`. Independent specification review passed. Quality review identified ordinary technical-text false positives and uncounted JSON property names; all were reproduced RED and fixed, including a slash-delimited executable-attribute regression found during re-review. Final quality verdict at `89c803f`: no outstanding Critical / Important / Minor findings. Fresh controller five-suite regression: 229/229. Full suite at `bf82f1f`: 111 files / 1395 tests; TypeScript and full lint passed. Earlier Task 2 baseline `380708b` also passed production build 5/5 and rendered HTML 3/3. These are per-revision evidence, not the final Goal 2 gate. Task 3 may now proceed.

### Task 3: Add the additive D1 research and budget schema

**Files:**
- Modify: `db/schema.ts`
- Create: `drizzle/0005_openrouter_research_beta.sql`
- Create: `drizzle/meta/0005_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Modify: `tests/db/schema.test.ts`
- Modify: `tests/db/migration-safety.test.ts`
- Create: `tests/db/research-migration.test.ts`

- [x] **Step 1: Add failing schema and migration assertions**

Assert that `db/schema.ts` exports `researchRuns`, `researchPackages`, `researchSourceAudits`, `aiBudgetBuckets`, and `aiBudgetReservations`. Assert SQL has owner+mutation and active-run uniqueness, package fingerprint/config uniqueness, source package+URL uniqueness, budget scope+period uniqueness, reservation request uniqueness, foreign keys, and query-driven indexes. Extend the safety test to expect exactly `0000` through `0005` and prove `0000`–`0004` hashes are unchanged.

```ts
expect(sql).toContain("CREATE TABLE `research_runs`");
expect(sql).toContain("CREATE UNIQUE INDEX `research_runs_owner_mutation_idx`");
expect(sql).toContain("CREATE UNIQUE INDEX `research_packages_fingerprint_idx`");
expect(sql).toContain("CREATE UNIQUE INDEX `ai_budget_bucket_period_idx`");
expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/iu);
```

- [x] **Step 2: Run migration tests and verify RED**

Run: `npm run test:unit -- tests/db/schema.test.ts tests/db/migration-safety.test.ts tests/db/research-migration.test.ts`

Expected: FAIL because the five tables and `0005` do not exist.

- [x] **Step 3: Define the five tables with integer-micro cost fields**

Use these state fields and constraints:

```ts
state: text("state", { enum: ["queued", "researching", "validating", "ready", "needs-review", "failed"] }).notNull(),
stateVersion: integer("state_version").notNull().default(0),
retryable: integer("retryable", { mode: "boolean" }).notNull().default(false),
reservedMicros: integer("reserved_micros").notNull(),
settledMicros: integer("settled_micros").notNull().default(0),
```

`research_runs` stores owner, mutation id, normalized role key, locale, input/config fingerprints, active slot, package id, sanitized error code, retryability, timestamps, and state version. `research_packages` stores immutable sanitized package JSON, quality JSON, blueprint/registry ids+versions, content/config fingerprints, observed/expiry timestamps. `research_source_audits` stores no excerpt. Budget rows use UTC day/month period starts and status `reserved | settled | conservative-hold | released`.

- [x] **Step 4: Generate and inspect migration artifacts**

Run: `npm run db:generate -- --name=openrouter_research_beta`

Expected: Drizzle creates `drizzle/0005_openrouter_research_beta.sql`, snapshot `0005`, and one journal entry without rewriting prior migrations.

Open the generated SQL and verify every `prepare`-time query in Tasks 4–5 has a matching index. Keep generated SQL; do not hand-edit old migrations.

- [x] **Step 5: Run migration tests and SQLite smoke**

Run: `npm run test:unit -- tests/db/schema.test.ts tests/db/migration-safety.test.ts tests/db/research-migration.test.ts`

Expected: PASS, sequential temporary database migration succeeds, `PRAGMA foreign_key_check` returns zero rows, and representative owner/cache/budget queries report their intended indexes under `EXPLAIN QUERY PLAN`.

- [x] **Step 6: Commit**

```powershell
git add db/schema.ts drizzle/0005_openrouter_research_beta.sql drizzle/meta/0005_snapshot.json drizzle/meta/_journal.json tests/db/schema.test.ts tests/db/migration-safety.test.ts tests/db/research-migration.test.ts
git commit -m "feat: add research beta persistence schema"
```


**Task 3 evidence, 2026-08-30:** Implementation `9cf3ca5`, binary error-code type-guard fix `33cb78d`. Independent specification review passed; quality re-review of `33cb78d` has no outstanding findings. Focused SQLite/schema/migration regression: controller 95/95; TypeScript and diff-check passed after the fix. At `9cf3ca5`, controller full suite 112 files / 1451 tests, full lint, build 5/5, rendered HTML 3/3 passed. The fix regenerated unpublished `0005` from unchanged `0004` metadata; no `0006`, old-migration edit, or production migration. Task 4 may proceed.

### Task 4: Implement owner-scoped research persistence and Ready resolution

**Files:**
- Create: `app/server/research/repository.ts`
- Create: `app/server/research/d1-repository.ts`
- Create: `tests/server/d1-research-repository.test.ts`
- Create: `tests/helpers/sqlite-d1.ts`

- [x] **Step 1: Write failing repository tests**

Cover create-or-replay by owner+mutation, active-run dedupe by owner+normalized role+locale+config, CAS transition conflict, immutable package fingerprint replay, TTL cache hit/miss, owner isolation, retry lineage, and Ready-only resolution.

Use a test-only `node:sqlite` D1 adapter that actually executes prepared SQL and wraps `batch` in a transaction with rollback on failure. Apply `0000`–`0005` to an in-memory database. SQL substring mocks alone cannot prove ownership, CAS, rollback, or budget concurrency. Reuse this bounded adapter in Task 5, without changing production repository APIs.

```ts
await expect(repository.getPublicRun("owner-b", run.id)).resolves.toBeNull();
await expect(repository.resolveReadyPackage("owner-a", run.id)).rejects.toMatchObject({ code: "NOT_READY" });
expect(await repository.transition({ id: run.id, ownerId: "owner-a", expectedVersion: 0, from: "queued", to: "researching" }))
  .toMatchObject({ state: "researching", stateVersion: 1 });
await expect(repository.transition({ id: run.id, ownerId: "owner-a", expectedVersion: 0, from: "queued", to: "researching" }))
  .rejects.toMatchObject({ code: "CONFLICT" });
```

- [x] **Step 2: Run repository tests and verify RED**

Run: `npm run test:unit -- tests/server/d1-research-repository.test.ts`

Expected: FAIL because the repository contracts and D1 implementation do not exist.

- [x] **Step 3: Define repository commands and typed errors**

```ts
export interface ResearchRepository {
  createOrReplay(command: CreateResearchRunCommand): Promise<{ run: ResearchRunRecord; replayed: boolean }>;
  getRun(ownerId: string, runId: string): Promise<ResearchRunRecord | null>;
  findFreshPackage(input: ResearchCacheLookup): Promise<ResearchPackage | null>;
  attachCachedPackage(command: AttachCachedPackageCommand): Promise<ResearchRunRecord>;
  transition(command: TransitionResearchRunCommand): Promise<ResearchRunRecord>;
  saveValidation(command: SaveResearchValidationCommand): Promise<ResearchRunRecord>;
  getPublicRun(ownerId: string, runId: string): Promise<ResearchRunPublicView | null>;
  createRetry(command: CreateResearchRetryCommand): Promise<{ run: ResearchRunRecord; replayed: boolean }>;
  resolveReadyPackage(ownerId: string, runId: string): Promise<ResearchPackage>;
}
```

All commands carry the session-derived owner. The D1 implementation must bind `user_id` in every owner operation, serialize through contract schemas with byte limits, clear `active_slot` only on terminal transition, and use `UPDATE ... WHERE state_version = ? AND state = ?` plus a follow-up read to detect CAS failure. Save package, audits, normalized role-intelligence rows, and terminal run state in one `db.batch`.

`getRun` is server-internal only (never an HTTP response) so Task 7 can identify and safely finalize expired attempts before offering explicit retry. Preserve run/request ids, state version and active expiry in the internal record. A mutation replay with conflicting input must return a typed conflict, not a second call. Shared cached packages remain nonpersonal; every attachment still belongs to an authenticated run owner.

When a different mutation id deduplicates onto an already-active run, persist that alias in the existing owner-scoped `idempotency_records` table under a research-specific scope. The alias must include a bounded run id and input fingerprint, not a copied private/provider payload. Replaying that second mutation after the shared run becomes terminal must still return the same run rather than creating another paid attempt. Test this lifecycle and conflicting reuse explicitly; no additional table is needed.

For terminal batch writes, a stale CAS must not leave orphan packages or normalized rows. Gate every insert/update on the same owner/state/version predicate until the final state update, or enforce rollback with a constraint-backed guard. Test the real SQL under stale versions and injected mid-batch failures, then verify package/audit/intelligence counts and run state are unchanged. Namespace normalized research role/version row ids to avoid overwriting existing Flagship or another immutable package; canonical domain ids inside package JSON remain unchanged.

**D1 execution and shared-resource constraints (verified 2026-08-30):** Do not issue one statement per skill/edge/resource/link: the contract permits enough records to exceed an invocation's query limit. Use bounded JSON arrays with `json_each` and `INSERT ... SELECT` to write each normalized table in a constant-size transaction, still applying the same owner/state/version guard to every write. Keep each statement below 100 bound parameters and 100,000 SQL-text bytes; keep bound JSON and full rows below the 2,000,000-byte D1 ceiling. The package's existing 1,900,000-byte cap reserves row-metadata headroom. The real-SQLite adapter must reject oversized statement text/parameter counts; add a valid high-fan-out fixture that asserts a constant batch statement count, rather than only testing the small golden fixture. Reference: [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [transactional batch semantics](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).

`learning_resources.canonical_url` is already globally unique. Reuse the row identity for an existing canonical URL without updating its metadata; preserve each research package's exact resource metadata inside immutable package/blueprint JSON and its own source audit. New role IDs, slugs, version IDs, skill/edge/link IDs must be namespaced independently of canonical domain IDs. Test two packages with the same canonical role and URL, plus a seeded preexisting resource with different metadata: both packages resolve unchanged, the old resource remains unchanged, and links reference the actual URL-matched resource ID. Do not change the old schema or silently overwrite global resource records.

- [x] **Step 4: Run repository tests**

Run: `npm run test:unit -- tests/server/d1-research-repository.test.ts`

Expected: PASS including concurrent replay and cross-owner cases.

- [x] **Step 5: Commit**

```powershell
git add app/server/research/repository.ts app/server/research/d1-repository.ts tests/server/d1-research-repository.test.ts tests/helpers/sqlite-d1.ts
git commit -m "feat: persist owner bound research runs"
```

**Task 4 evidence, 2026-08-31:** Initial implementation `986d43a`; invariant repairs `e1b4083`; same-canonical-role package coverage `26e55b4`; formatting-only readability fix `a7b18f5`. Specification review passed at `26e55b4`; quality re-review at `a7b18f5` has no outstanding findings. Controller focused persistence 100/100 at `26e55b4`, final full suite **113 files / 1553 tests** at `a7b18f5`, exit 0. At `e1b4083`, TypeScript, full lint, build 5/5 and rendered HTML 3/3 passed; the first CPU-contended full run had one large-fixture timeout, followed by unchanged standalone 1552/1552. Final test count increases by one from the same-role coverage addition. No timeout increase, real provider call, merge, push, or deployment. Task 5 may proceed.

### Task 5: Enforce atomic cost budgets separately from accepted-user quota

**Files:**
- Create: `app/server/research/budget.ts`
- Create: `app/server/research/d1-budget-repository.ts`
- Create: `tests/server/research-budget.test.ts`
- Create: `tests/server/d1-research-budget-repository.test.ts`
- Modify: `app/server/entitlements/policy.ts`
- Modify: `app/server/entitlements/repository.ts`
- Modify: `app/server/entitlements/d1-entitlement-repository.ts`
- Modify: `tests/server/entitlements.test.ts`
- Modify: `tests/server/d1-entitlement-repository.test.ts`

**Quota integration constraint:** The existing entitlement path reads accepted units and then reserves in a separate statement. That is insufficient for concurrent Research requests for different roles. Add a research-safe atomic admission operation over `quota_ledger`: count accepted results plus outstanding reservations, admit only within the user-day limit, and replay the same reservation without a second charge. Keep accepted-unit reporting separate from outstanding capacity. A single conditional `INSERT ... SELECT` may supply the SQLite atomic boundary; a read-then-unconditional-insert may not. Preserve existing preview behavior and use the atomic path for Research. Add SQLite-backed tests for two different roles racing for the last quota slot, release on Failed/Needs-review, same-key replay, and conflicting terminal settlements. Do not modify migrations `0000`-`0004`.

- [x] **Step 1: Write failing policy, concurrency, and settlement tests**

```ts
it("cannot oversell a site budget under concurrent reservations", async () => {
  const results = await Promise.all([
    repository.reserve(request({ requestId: "request-a", maxMicros: 700 })),
    repository.reserve(request({ requestId: "request-b", maxMicros: 700 })),
  ]);
  expect(results.filter((result) => result.allowed)).toHaveLength(1);
});

it("charges site cost on a failed paid response but not accepted-user quota", async () => {
  await repository.settle("reservation-a", { kind: "actual", actualMicros: 430 });
  expect(await repository.readBucket(dayScope)).toMatchObject({ reservedMicros: 0, settledMicros: 430 });
  expect(entitlements.finalize).toHaveBeenCalledWith("quota-a", "failed", 0);
});

it("keeps a conservative hold when actual provider cost is unknown", async () => {
  await repository.settle("reservation-a", { kind: "unknown" });
  expect(await repository.readReservation("reservation-a")).toMatchObject({ status: "conservative-hold" });
});
```

- [x] **Step 2: Run focused tests and verify RED**

Run: `npm run test:unit -- tests/server/research-budget.test.ts tests/server/d1-research-budget-repository.test.ts tests/server/entitlements.test.ts`

Expected: FAIL because cost budgets are not modeled.

- [x] **Step 3: Implement fail-closed environment parsing and two-period reservations**

Parse `ARC_AI_SITE_DAILY_BUDGET_MICROS`, `ARC_AI_SITE_MONTHLY_BUDGET_MICROS`, `ARC_AI_RESEARCH_MAX_COST_MICROS`, and `ARC_AI_REPAIR_MAX_COST_MICROS` as safe non-negative integers. Reserve the combined maximum against UTC day and month buckets in a single D1 batch guarded by versioned conditional updates. Replays return the original reservation. A denied update returns `{ allowed: false, reason: "budget" }` and creates no provider-call authority.

A conditional UPDATE that affects zero rows does not itself roll back a D1 batch. Include a constraint-backed final reservation guard, or an equivalently atomic SQL construction, so a day/month partial success cannot leak reserved funds or grant call authority. Prove this by exhausting only one bucket in the SQLite-backed test, and verify both bucket balances and reservation count remain unchanged on denial.

The guard must prove this attempt obtained both reservations, not merely that bucket versions/balances now equal values predicted from a prior read: another equal-sized concurrent request can produce those same values. Include a stale-read/equal-amount concurrency regression. A conditional insert that atomically checks both bucket capacities within the same transaction is also valid if subsequent writes occur only for that newly inserted reservation and replays cannot increment either bucket again.

Settlement must be idempotent:

```ts
export type BudgetSettlement =
  | { kind: "actual"; actualMicros: number }
  | { kind: "not-charged" }
  | { kind: "unknown" };
```

Actual settlement removes reserved micros and adds actual micros; not-charged releases; unknown retains the reservation in `conservative-hold`. Extend `EntitlementGate` only so accepted quota is finalized when a new run becomes Ready; do not use quota units as currency.

- [x] **Step 4: Run focused tests**

Run: `npm run test:unit -- tests/server/research-budget.test.ts tests/server/d1-research-budget-repository.test.ts tests/server/entitlements.test.ts tests/server/d1-entitlement-repository.test.ts`

Expected: PASS; quota and cost assertions remain independent.

- [x] **Step 5: Commit**

```powershell
git add app/server/research/budget.ts app/server/research/d1-budget-repository.ts app/server/entitlements/policy.ts tests/server/research-budget.test.ts tests/server/d1-research-budget-repository.test.ts tests/server/entitlements.test.ts
git commit -m "feat: enforce research cost budgets"
```

**Task 5 review gate closed (2026-08-31):** Implementation `68ec17e`, relationship/identifier repair `8bdf2d1`, type and rollover hardening `870a207`. Independent specification and quality reviews both pass at `870a207`, with no remaining findings. Root verified 115 files / 1679 unit tests, TypeScript, full lint, build 5/5, rendered HTML 3/3, and diff-check. Actual repositories also passed isolated, non-persistent Miniflare D1 smoke tests (migrations 0000–0005, budget/quota concurrency, replay, settlement and corrupt-row rejection; foreign-key violations zero). These are Task 5 evidence, not final Goal 2 acceptance; no live model, production write, merge, push or deployment occurred.

### Task 6: Build the server-only OpenRouter adapter

**Transport-to-orchestrator boundary (2026-08-31 source inspection):** The exported candidate Zod schema is `researchCandidateSchema` in `app/contracts/research.ts`; derive the request JSON Schema from that export inside the provider module and test its required keys/bounds rather than maintaining a second hand-written schema. A malformed outer HTTP JSON envelope is a transport failure; bounded assistant content with invalid candidate JSON/schema must remain available to Task 7's one-repair decision. Do not reject all inner JSON errors inside the transport and thereby make the approved repair path unreachable. Conversely, incomplete output stopped by a token limit is not evidence that missing facts can be mechanically recovered.

OpenRouter may report errors within a non-streaming HTTP 200 response, including `choices[].error` and `finish_reason: "error"`; inspect these before accepting content. Also handle content filtering, refusal, empty output, and truncation. Error messages and metadata never pass through. Preserve only a bounded provider-neutral audit summary (actual model and validated usage, when present) on both results and typed errors, so Task 7 can audit and settle a charged-but-failed response. Empty output does not prove zero charge. [Error envelope and empty-content behavior](https://openrouter.ai/docs/api_reference/errors-and-debugging).

Map nested wire annotations from `message.annotations[].url_citation` to the existing flat `{ type, url, title }` contract; omit excerpts, indices, raw metadata, and other annotation kinds. [Annotation wire shape](https://openrouter.ai/docs/guides/features/plugins/web-search#parsing-web-search-results). This shape reference does not authorize use of the deprecated plugin. The existing `providerUsageSchema` requires bounded token counts, consistent totals, integer cost micros, and a search count. Preserve explicit unknown usage when a trustworthy summary cannot be formed; never synthesize a zero cost from absent/invalid `usage.cost`. Test sub-micro currency rounding without undercount, nonfinite/unsafe values, missing usage, and known charges on invalid content. [Usage and cost fields](https://openrouter.ai/docs/api_reference/overview#completionsresponse-format).

Keep one abort deadline alive through response-body reading, not just receipt of headers; cap actual UTF-8 bytes even with a missing or misleading Content-Length, cancel oversized streams, and reject redirects instead of forwarding the secret. Stubbed-fetch tests cover stalled headers, stalled/chunked bodies, multibyte limits, and cleanup. These are implementation requirements for the already-approved bounded, server-only transport; no actual key or network model request is authorized.

**Official interface check, 2026-08-30:** Pin web search to `engine: "exa"`, `mode: "fast"`, `max_results: 5`, `max_uses: 2`, `max_total_results: 10`, and `max_characters: 2000`, with top-level `max_tool_calls: 2`. Do not leave engine selection on `auto`: native providers other than Anthropic ignore `max_uses`, and native search ignores result-size controls. Do not add `stop_server_tools_when` alongside the tool-call limit, because it overrides that limit. Sources: [web search controls](https://openrouter.ai/docs/guides/features/server-tools/web-search), [server-tool limits](https://openrouter.ai/docs/guides/features/server-tools).

**Billing boundary:** A D1 reservation is application accounting, not proof that an external bill cannot exceed it. Task 6 must bound request/response bytes and output tokens; any real-request gate must additionally verify fixed-model pricing, search charges, and provider/account spending controls against the authorized maximum. Never claim a hard external cost cap based on `ARC_AI_RESEARCH_MAX_COST_MICROS` alone. Unknown usage retains the conservative hold; actual usage is recorded even if it exceeds the reservation. [Provider price filters](https://openrouter.ai/docs/guides/routing/provider-selection) filter unit prices, not the total request bill.

**Files:**
- Create: `app/server/research/provider.ts`
- Create: `app/server/research/openrouter-provider.ts`
- Create: `app/server/research/fake-provider.ts`
- Create: `tests/server/openrouter-provider.test.ts`
- Create: `tests/server/fake-research-provider.test.ts`

- [x] **Step 1: Write exact request and error-mapping tests**

Use a stubbed `fetch` and assert URL `https://openrouter.ai/api/v1/chat/completions`, Bearer header, server-fixed model, non-streaming strict JSON Schema, `openrouter:web_search`, `max_uses: 2`, `max_total_results: 10`, bounded top-level tool calls, `require_parameters: true`, `data_collection: "deny"`, `zdr: true`, and AbortSignal timeout. Assert the repair request uses the Economy model, strict schema, no tools, and no web search. Assert missing key performs zero fetches.

```ts
expect(body).toMatchObject({
  stream: false,
  response_format: { type: "json_schema", json_schema: { strict: true } },
  tools: [{ type: "openrouter:web_search", parameters: {
    engine: "exa", mode: "fast", max_results: 5, max_uses: 2,
    max_total_results: 10, max_characters: 2000,
  } }],
  max_tool_calls: 2,
  provider: { require_parameters: true, data_collection: "deny", zdr: true },
});
expect(repairBody.tools).toBeUndefined();
```

Map timeout, 429, insufficient balance, 5xx, content filter, empty choice, invalid JSON, and oversized body to typed `ResearchProviderError` values with `retryable`, `charged: true | false | "unknown"`, and sanitized code. Parse only bounded content, annotation URL/title, actual model, and usage `{promptTokens, completionTokens, totalTokens, costMicros, webSearchRequests}`.

- [x] **Step 2: Run provider tests and verify RED**

Run: `npm run test:unit -- tests/server/openrouter-provider.test.ts tests/server/fake-research-provider.test.ts`

Expected: FAIL because provider modules do not exist.

- [x] **Step 3: Implement provider-neutral and OpenRouter transports**

```ts
export interface ResearchProvider {
  research(request: ProviderResearchRequest): Promise<ProviderResearchResult>;
  repair(request: ProviderRepairRequest): Promise<ProviderResearchResult>;
}

export class ResearchProviderError extends Error {
  constructor(
    readonly code: "missing-key" | "timeout" | "rate" | "balance" | "unavailable" | "filtered" | "invalid-transport",
    readonly retryable: boolean,
    readonly charged: boolean | "unknown",
  ) { super(code); this.name = "ResearchProviderError"; }
}
```

Build prompts from normalized role, locale, fixed policy, version strings, and the exported JSON Schema only. Do not include owner or learner state. Use `AbortController`, a bounded response reader, and dependency-injected fetch/timeouts for tests. Implement `FakeResearchProvider` with deterministic modes selected in server composition, never by a public client field.

- [x] **Step 4: Run provider and secret-boundary tests**

Run: `npm run test:unit -- tests/server/openrouter-provider.test.ts tests/server/fake-research-provider.test.ts tests/server/ai-gateway.test.ts`

Expected: PASS and existing deterministic preview remains green.

- [x] **Step 5: Commit**

```powershell
git add app/server/research/provider.ts app/server/research/openrouter-provider.ts app/server/research/fake-provider.ts tests/server/openrouter-provider.test.ts tests/server/fake-research-provider.test.ts
git commit -m "feat: add bounded OpenRouter research adapter"
```

### Task 7: Orchestrate idempotent research, repair, validation, and settlement

**Files:**
- Create: `app/server/research/orchestrator.ts`
- Create: `tests/server/research-orchestrator.test.ts`
- Modify: `app/server/ai/gateway.ts` (run-record contract only; preserve preview behavior)
- Modify: `app/server/ai/d1-run-recorder.ts`
- Create: `tests/server/d1-research-run-recorder.test.ts`
- Modify: `app/server/entitlements/repository.ts` (owner-bound Research reservation recovery contract)
- Modify: `app/server/entitlements/d1-entitlement-repository.ts` (read-only lookup using the existing integrity guards)
- Modify: `app/server/entitlements/policy.ts` (server-only recovery lookup forwarding, without granting admission)
- Modify: `tests/server/d1-entitlement-repository.test.ts`
- Modify: `tests/server/entitlements.test.ts`

**Durable recovery integration (2026-08-31 source inspection):** Task 4 persists run/request IDs and expiry, but the current entitlement interface exposes no reservation lookup, and `AiRunSink` only writes records. An in-memory reservation ID or call-result variable is not recoverable after a Worker ends. Extend these existing interfaces for narrowly scoped, owner-bound reads in Task 7; do not add another migration or use raw SQL in the orchestrator. Keep legacy preview mocks compatible through an optional repository method, but require the recovery capability when composing Research.

The quota lookup takes the authenticated owner and the deterministic Research quota key derived from the stored run/request IDs, returns only the original reservation ID, creation time and terminal status (or null), validates purpose/units and the complete relevant parent/terminal relationship, and never reserves capacity or calls a provider. Recovery must not re-run a now-disabled cohort/rate/admission gate to discover an old reservation. Add a distinct Research audit reader on the D1 sink/contract that reads only the owner's exact deterministic Research/Repair attempt IDs, validates the allowlisted record, and returns null for absence; never expose these records in the public run view.

```ts
export type ResearchQuotaReservation = {
  reservationId: string;
  createdAt: number;
  finalStatus: EntitlementFinalStatus | null;
};

// Optional only for old preview-only adapters. Research composition requires it.
readResearchReservation?(
  userId: string,
  idempotencyKey: string,
): Promise<ResearchQuotaReservation | null>;

// AiRunRecord gains the strict Research variant described below in this task.
export interface ResearchAiRunReader {
  readResearchAttempt(
    userId: string,
    requestId: string,
  ): Promise<Extract<AiRunRecord, {
    purpose: "role-research" | "role-research-repair";
  }> | null>;
}
```

For an expired active run, win the state-version CAS to Failed before releasing its user quota; do not reclaim a live run or allow a stale original request to call the provider after losing that CAS. A queued run never passed the Researching transition and may release a cost reservation as not charged. An interrupted Researching/Validating attempt may already have incurred a Research or Repair charge: incomplete receipts must retain a conservative hold rather than summing a known first call and assuming the missing second call cost zero. GET/start replay/explicit retry may reconcile durable state and ledgers, but never invoke Research/Repair implicitly. Retry creates a new request and reservation only after old-run recovery, with no call authority reused.

Terminal reconciliation must survive a crash between terminal persistence and settlement. Ready/Needs-review publication is preceded by durable records for every completed provider attempt, so their validated records can support exact cost summation; missing or inconsistent records make the result unavailable and preserve cost conservatively. Repair-disabled/no-repair and cache paths must remain distinguishable by the persisted run state and exact audit records, not by a new process's mutable configuration. A failed attempt or storage error with uncertain attempt completeness cannot be treated as a zero-charge run. Finalizing accepted quota for Ready and zero quota for Failed/Needs-review is idempotent; a foreign owner, conflicting terminal ledger or unreadable storage fails closed. Existing settled/released reservations must not be overwritten with a different recovery guess.

Write fault-injection tests with fresh orchestrator/dependency instances over the same real SQLite database, not shared JS maps: interrupt after quota admission, cost reservation, Researching, Research/Repair receipt, terminal persistence and before each settlement; recover/retry without provider replay, verify original quota/bucket IDs and totals, preserve unknown holds, and prove a losing/stale request cannot publish Ready or grant a call. Include expired versus still-live runs, prior UTC-day quota, missing audit data, audit storage failure and owner isolation. Extend the entitlement test commands below to include both policy and D1 recovery tests.

**Configuration identity on retry:** The existing `createRetry` deliberately inherits the source run's configuration fingerprint. Before using it, the orchestrator must compare that fingerprint with the current trusted provider/prompt/schema/quality configuration. A mismatch rejects the retry without a provider call and requires an explicit fresh research start; never run a new model under an old cache identity. The Task 8 factory computes the stable fingerprint from validated, nonsecret model/policy/schema settings, including actual fixed task model IDs and prompt/tool/output-policy versions. Do not include a key, owner or learner state, and do not rely on a constant model-version label alone while ignoring changed model IDs. Test a model/config change between creation and retry, proving no misleading cache attachment, no new quota/cost reservation and no provider call.

**Model-audit integration requirement:** Source inspection found that the existing `AiRunRecord` supports only `role-research-preview` and `D1AiRunSink` always writes `'{}'` to `usage_json`. Reusing it unchanged would omit the approved model/usage audit. Extend the run-record contract and recorder with a strict research-specific record variant for `role-research` and `role-research-repair`, while keeping old preview records compatible. Store the bounded actual model returned by the adapter, provider identifier, prompt/input/output versions, sanitized terminal code/status, latency, and an allowlisted usage summary (token counts, integer cost micros, bounded search count, or explicit unknown-usage state). Do not store input text, prompts, annotations, candidate JSON, raw provider errors, credentials, or routing configuration in this record.

Use a deterministic, bounded attempt request ID derived from the parent run/request and `research` or `repair`; the existing `(user_id, request_id)` unique index must make retries of audit persistence idempotent without conflating the two paid calls. Research and repair usage settle against the original combined cost reservation exactly once; do not ignore the first call's charge when repair also runs. Cache hits must create neither a provider-call audit nor a new cost charge. Persist the necessary audit successfully before publishing Ready; do not copy the legacy gateway's best-effort `.catch(() => undefined)` behavior for research success. Audit-storage failures must leave the result unavailable and preserve/reconcile cost conservatively, never trigger a hidden second provider call.

Write a real-SQLite recorder test using the Task 4 helper: research and repair rows coexist, same-attempt replay does not duplicate rows, conflicting reuse is rejected rather than silently accepted, usage is bounded/allowlisted, and the old preview record still works. Orchestrator tests inject audit failure before Ready and assert no usable package is exposed, accepted quota is not falsely charged, and provider calls are not replayed. Also test successful research, repair, invalid-domain response, timeout with unknown cost, and cached replay for the exact audit/settlement counts. Run `tests/server/d1-research-run-recorder.test.ts` and `tests/server/ai-gateway.test.ts` with the Task 7 focused regressions.

- [x] **Step 1: Write state-machine tests before implementation**

Cover exact order: create/replay -> cache -> cohort/quota/rate decision passed in -> cost reserve -> Researching -> provider -> Validating -> validator -> terminal -> settlements. Assert duplicate mutation and concurrent active requests call provider once. Assert a fresh shared package creates an owner-bound Ready run without provider cost or duplicate accepted quota. Assert repair occurs once only for repairable transport/schema failure and never for missing citation/domain/source-policy failure. Assert every error terminal is sanitized.

```ts
expect(repository.transition.mock.calls.map(([command]) => command.to))
  .toEqual(["researching", "validating"]);
expect(provider.repair).toHaveBeenCalledTimes(1);
expect(entitlements.finalize).toHaveBeenCalledWith(expect.any(String), "accepted", 1);
expect(budget.settle).toHaveBeenCalledWith(expect.any(String), { kind: "actual", actualMicros: 410 });
```

- [x] **Step 2: Run orchestrator tests and verify RED**

Run: `npm run test:unit -- tests/server/research-orchestrator.test.ts`

Expected: FAIL because `ResearchOrchestrator` does not exist.

- [x] **Step 3: Implement the bounded orchestration state machine**

Expose only three methods:

```ts
export class ResearchOrchestrator {
  start(ownerId: string, input: unknown, context: ResearchGateContext): Promise<ResearchRunPublicView>;
  get(ownerId: string, runId: string): Promise<ResearchRunPublicView | null>;
  retry(ownerId: string, runId: string, mutationId: string, context: ResearchGateContext): Promise<ResearchRunPublicView>;
}
```

`start` validates first, normalizes role with Unicode NFKC/lowercase/space collapse, creates/replays, checks fresh cache, reserves quota and cost only for a new provider attempt, executes one request stage, then persists one terminal. A repair is permitted only when the initial result contains bounded candidate content and fails JSON/schema structure; the repair input includes that content plus original annotation metadata, disables tools, and may not introduce a URL absent from the original annotations. On Ready, settle accepted quota once and cost by actual usage. On Needs review, accepted quota is zero while actual cost is settled. On provider failure, use `charged` to settle actual/not-charged/unknown without exposing provider detail.

- [x] **Step 4: Run orchestrator and dependency regressions**

Run: `npm run test:unit -- tests/server/research-orchestrator.test.ts tests/server/research-package-validator.test.ts tests/server/d1-research-repository.test.ts tests/server/d1-research-budget-repository.test.ts tests/server/d1-research-run-recorder.test.ts tests/server/d1-entitlement-repository.test.ts tests/server/entitlements.test.ts tests/server/ai-gateway.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```powershell
git add app/server/research/orchestrator.ts tests/server/research-orchestrator.test.ts app/server/ai/gateway.ts app/server/ai/d1-run-recorder.ts tests/server/d1-research-run-recorder.test.ts app/server/entitlements/repository.ts app/server/entitlements/d1-entitlement-repository.ts app/server/entitlements/policy.ts tests/server/d1-entitlement-repository.test.ts tests/server/entitlements.test.ts
git commit -m "feat: orchestrate recoverable role research"
```

### Task 8: Expose authenticated Research Beta HTTP routes

**Composition constraints from current source inspection (2026-08-31):** The existing `D1RateLimiter` hashes scope + subject without a secret; production Research composition must derive its IP subject using the configured `ARC_AI_IP_HASH_SALT` before passing it to the limiter. Trust Cloudflare's `cf-connecting-ip` only in its edge runtime; do not add a client-controlled `x-forwarded-for` fallback. Missing/invalid IP or salt cannot silently bypass the IP gate. Local Fake composition supplies explicit test dependencies, not a public identity/IP override. State-changing browser requests must reject a mismatching Origin/cross-site fetch context and non-JSON media types before creating a run, reservation, or provider call; add request-security regressions for those cases.

The shared `apiError` helper currently lacks Research error codes and uses `error.action`/nested request ID. Keep the new Research error envelope explicit and typed in this route factory, matching its documented `error.recovery` and top-level request ID, while reusing `apiJson`/`applyResponseSafety`; do not cast unsupported codes into the legacy helper or change existing route responses. Add the optional string Worker declarations needed by the new factory in Task 8 (no values or secrets). Task 12 still owns disabled examples, full runtime/health checks, and removal of obsolete bindings after consumer inspection. Production composition requires BOTH AI and Research enable flags plus all validated model, timeout, budget, quota, cache and salt values; missing configuration never selects Fake implicitly.

**Recovery versus new-call authority:** The production enabled/configuration check above governs new provider attempts, not access to the authenticated owner's already-persisted run. Keep GET status and Task 7's original-ledger reconciliation available when the AI/Research kill switch is off, the cohort changes, or the provider key is absent; these paths must never require new provider authority, substitute Fake, or call Research/Repair. Preserve authentication, owner isolation, response safety and a bounded non-provider read-rate policy. Invalid/unreadable D1 still fails closed. Test GET after disabling flags/removing the synthetic key with a provider stub that throws if invoked, and verify recovery uses the original quota/audit/budget IDs. Start/retry with new-call authority disabled must remain denied. The legacy preview composition lives inline in `app/api/intelligence/preview/route.ts`; do not import that route as the new service factory or change its existing behavior.

**Terminal run response continuity:** Task 1's `researchRunPublicViewSchema` already carries the run ID, retryability and Needs-review issue codes, but there is not yet a shared HTTP envelope. Define the Research-only envelope alongside that contract and test it in `tests/contracts/research-contracts.test.ts`; do not reuse or change legacy Preview/Planning error shapes. A successful GET of an owned persisted run returns HTTP 200 `{ run, requestId }`, including a safely readable Needs-review or Failed terminal. POST start/retry retains the mapped 422/503/429 outcome when applicable, but if orchestration returned a persisted terminal, include its validated public `run` alongside the stable `error` and top-level `requestId`. Admission/authentication/storage failures without a safely readable run must not invent one. No raw candidate or audit fields may be added. Tests must cover initial Needs-review/Failed POST -> capture run ID -> GET after refresh -> explicit retry, plus contradictory or malformed envelope rejection. Task 10 must consume these same envelopes instead of dropping every non-2xx result into a generic connection error.

**Files:**
- Create: `app/server/research/service-factory.ts`
- Create: `app/server/http/research-route-factories.ts`
- Create: `app/api/intelligence/research/route.ts`
- Create: `app/api/intelligence/research/[id]/route.ts`
- Create: `app/api/intelligence/research/[id]/retry/route.ts`
- Create: `tests/api/research-routes.test.ts`
- Modify: `tests/server/planning-security.test.ts`
- Modify: `worker-configuration.d.ts` (optional Research binding declarations only; runtime documentation and health remain Task 12)
- Modify: `app/contracts/research.ts` (shared Research HTTP envelopes; preserve existing run/package schemas)
- Modify: `tests/contracts/research-contracts.test.ts`

- [x] **Step 1: Write route security, gate-order, and public-error tests**

Test unauthenticated 401, malformed/oversized body 400 before provider, account and salted-IP 429 with bounded `Retry-After`, cohort/quota/budget denial as `ALLOWANCE_REACHED`, owner-only GET/retry 404, CAS 409, Needs review 422, unavailable 503, and unknown 500. Assert response safety headers and Request ID. Assert client fields `ownerId`, `model`, `package`, `provider`, and `maxCost` are rejected.

```ts
expect(await response.json()).toMatchObject({
  error: { code: "RESEARCH_UNAVAILABLE", recovery: "retry" },
  requestId: "request-test-1",
});
expect(response.headers.get("cache-control")).toContain("no-store");
expect(provider.research).not.toHaveBeenCalled();
```

- [x] **Step 2: Run route tests and verify RED**

Run: `npm run test:unit -- tests/api/research-routes.test.ts tests/server/planning-security.test.ts`

Expected: FAIL because the route factory and routes do not exist.

- [x] **Step 3: Implement route factories and fail-closed production composition**

Use `requireArcUser`, D1 endpoint rate buckets, a server-derived salted IP subject, bounded JSON readers, Zod contracts, and operational events. The production factory must return disabled behavior unless all required values parse and `ARC_AI_ENABLED === "true"`; missing key must never instantiate call authority. Public mappings are exactly:

```ts
const publicResearchErrors = {
  unauthenticated: ["UNAUTHENTICATED", 401, "sign-in"],
  invalid: ["INVALID_INPUT", 400, undefined],
  notFound: ["NOT_FOUND", 404, undefined],
  conflict: ["CONFLICT", 409, "refresh"],
  rate: ["RATE_LIMITED", 429, "retry"],
  allowance: ["ALLOWANCE_REACHED", 429, "use-flagship"],
  needsReview: ["RESEARCH_NEEDS_REVIEW", 422, "retry-or-flagship"],
  unavailable: ["RESEARCH_UNAVAILABLE", 503, "retry-or-flagship"],
} as const;
```

Thin route files export `dynamic = "force-dynamic"` and delegate to one production dependency composition. GET reads the dynamic id from route params but never accepts owner identity from URL/query/body.

- [x] **Step 4: Run API and security tests**

Run: `npm run test:unit -- tests/api/research-routes.test.ts tests/contracts/research-contracts.test.ts tests/server/planning-security.test.ts tests/server/auth-policy.test.ts tests/server/rate-limit.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```powershell
git add app/server/research/service-factory.ts app/server/http/research-route-factories.ts app/api/intelligence/research tests/api/research-routes.test.ts tests/server/planning-security.test.ts worker-configuration.d.ts app/contracts/research.ts tests/contracts/research-contracts.test.ts
git commit -m "feat: expose protected role research routes"
```

### Task 9: Connect Ready packages to deterministic planning and replay

**Cross-flow closure found by source inspection, 2026-08-30:** Merely changing `PlanningService.generate` does not satisfy the approved Research -> Audit -> Build -> Path -> Today flow. `app/path/page.tsx` and `app/today/page.tsx` currently select adaptive rendering only when the legacy role equals Flagship; their adaptive components otherwise receive default Flagship sources. Stack, Proof, the workspace heading, Proof client projections, and the production Proof service also have fixed Flagship inputs. Tasks 9 and 11 must remove those assumptions for an authenticated, owner-bound research workspace, while retaining the exact existing Guest/Flagship/legacy behavior. This is required integration within Goal 2, not a new product goal or AI Proof review feature.

**Historical-expiry decision resolved (2026-09-04, option A):** Cache expiry prevents cache attachment and new-plan generation only. An existing plan continues completing, delaying, and replanning from its immutable owner-bound locked package after expiry. `resolveForGenerate` must require a currently valid Ready package. `resolveForReplay` must revalidate owner, exact package / blueprint / registry IDs and versions, content/config identity, fingerprints, and domain integrity, but deliberately must not reapply the current cache-expiry check. Missing, corrupt, cross-owner, mismatched, or substituted data fails closed with no Flagship fallback. This exception grants no new-plan, source-switch, Research retry, or cross-owner authority.

**Files:**
- Modify: `app/contracts/planning-api.ts`
- Modify: `app/contracts/planning.ts`
- Create: `app/server/planning/source-resolver.ts`
- Modify: `app/server/planning/repository.ts`
- Modify: `app/server/planning/service.ts`
- Modify: `app/server/planning/d1-planning-repository.ts`
- Modify: `app/server/http/planning-route-factories.ts`
- Modify: `tests/server/planning-service.test.ts`
- Modify: `tests/server/d1-planning-repository.test.ts`
- Modify: `tests/server/planning-security.test.ts`
- Create: `tests/server/research-planning-integration.test.ts`
- Modify: `app/contracts/research.ts`
- Modify: `app/server/research/d1-repository.ts`
- Modify: `app/lib/planning-client.ts`
- Modify: `app/lib/use-planning-workspace.ts`
- Modify: `app/server/http/proof-route-factories.ts`
- Modify: `app/server/proof/service.ts` (only if per-request source injection requires it)
- Modify: `tests/contracts/research-contracts.test.ts`
- Modify: `tests/lib/planning-client.test.ts`
- Modify: `tests/lib/use-planning-workspace.test.tsx`
- Modify: `tests/server/proof-service.test.ts`
- Modify: `tests/server/d1-research-repository.test.ts`

- [x] **Step 1: Write compatibility, ownership, and replay tests**

Keep the historical flagship request accepted by normalization, and accept the new explicit source union:

```ts
const flagshipSourceSchema = z.object({
  source: z.literal("flagship"), roleId: z.literal("ai-native-full-stack-engineer"),
}).strict();
const researchSourceSchema = z.object({
  source: z.literal("research"), researchRunId: idSchema,
}).strict();
```

Test owner Ready generation; Needs review/Failed/cross-owner rejection; expired package rejection for every new-plan path; deterministic equality for identical validated inputs; and event replay after a fresh service/repository instance. The replay tests must advance time beyond package expiry and prove `Complete`, `Delay`, and replan still use the exact locked research registry rather than Flagship templates. Also prove an expired locked package that is missing, corrupt, cross-owner, or mismatched by package / blueprint / registry identity, version, config/content fingerprint, or domain integrity fails closed with no Flagship fallback and no new-plan authority.

- [x] **Step 2: Run focused planning tests and verify RED**

Run: `npm run test:unit -- tests/server/planning-service.test.ts tests/server/d1-planning-repository.test.ts tests/server/research-planning-integration.test.ts`

Expected: FAIL because planning only resolves the Flagship source.

- [x] **Step 3: Add immutable source references and a resolver**

Add an immutable source reference to the planning repository envelope, not to the current `PlanningWorkspace` schema:

```ts
export const planningSourceReferenceSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("flagship"), roleId: z.literal("ai-native-full-stack-engineer") }).strict(),
  z.object({
    source: z.literal("research"), researchRunId: idSchema, packageId: idSchema,
    blueprintId: idSchema, blueprintVersion: z.string().min(1).max(64),
    registryId: idSchema, registryVersion: z.string().min(1).max(64),
  }).strict(),
]);
```

`PlanningSourceResolver.resolveForGenerate(ownerId, request.source)` returns `{reference, blueprint, registry}` and resolves research only through `ResearchRepository.resolveReadyPackage` with current-expiry enforcement. `resolveForReplay(ownerId, sourceReference)` uses a separate owner-bound repository read that permits an expired package only for the exact persisted source reference, then validates package / blueprint / registry identity and version, config/content fingerprints, and domain integrity again for event/replan. It must not fall back to Flagship when research resolution fails, and the replay-only read must not be callable as a new-plan resolver.

Extend `PlanningRepositoryPayload`, `SavePlanningGenerationCommand`, and `SavePlanningEventCommand` with `sourceReference`. Store it inside the bounded `storedGenerationSchema` envelope and return it on every repository load/mutation replay. Make the envelope field optional only while reading historical generations; derive the Flagship reference only when the stored workspace has the exact Flagship blueprint and registry ids. New writes always include the explicit reference. This avoids changing `PLANNING_SCHEMA_VERSION`, nested planning fingerprints, or canonical workspace snapshots.

Change `D1PlanningRepository` from constructor-fixed blueprint/registry to an injected `PlanningSourceResolver`; every `replayHistory`, `replayPlanningEvents`, and `applyPlanningEvent` call resolves by authenticated owner plus the generation envelope reference. Research resolution failure must surface as unavailable/version-mismatch and must never fall back to Flagship. `PlanningService.generate` resolves the public request source before building and passes the returned reference into `saveGeneration`; append/replan methods reuse the reference returned by `repository.load`.

Expose only the existing validated domain data required for the approved client-side audit and deterministic preview. Add this strict projection in `app/contracts/research.ts` and include it in the owner-only Ready view; do not expose the full internal ResearchPackage:

```ts
export const researchPlanningDataSchema = researchPackageSchema.pick({
  id: true, blueprint: true, registry: true,
});
```

Add `sourceContext` to the planning HTTP response envelopes (not `PlanningWorkspace`), carrying the immutable source reference plus the validated blueprint/registry. Preserve reading of historical Flagship-only response fixtures, but permit inferred defaults only when both stored blueprint and registry identities are exactly Flagship. A research workspace with missing or mismatched source context must be unavailable, never implicitly Flagship. Extend the planning client/controller to retain this context in memory, obtain it again from the authenticated workspace response after navigation or reload, and clear it under the same identity/generation guards as the workspace. No research package or context is persisted in browser storage. Add wire-response byte limits that account for both workspace and source context, and strict response parsing. Keep old response/workspace fingerprints intact.

Inject the same authenticated goal's resolved source into the production Proof service. Research skill IDs must be accepted for that goal, arbitrary foreign skill IDs rejected, and existing structural/deterministic review rules unchanged. Add an integration test for a Research plan's completed unit -> Proof submission -> demonstrated projection -> withdrawal, alongside the existing Flagship Proof regressions. Never use a package from a client request as Proof validation authority.

- [x] **Step 4: Run planning, Today, and proof regressions**

Run: `npm run test:unit -- tests/server/planning-service.test.ts tests/server/d1-planning-repository.test.ts tests/server/research-planning-integration.test.ts tests/components/adaptive-setup-flow.test.tsx tests/components/adaptive-today-session.test.tsx tests/server/proof-service.test.ts`

Expected: PASS; research events replay across repository instances and Flagship tests remain unchanged.

- [x] **Step 5: Commit**

```powershell
git add app/contracts/planning-api.ts app/contracts/planning.ts app/server/planning/source-resolver.ts app/server/planning/repository.ts app/server/planning/service.ts app/server/planning/d1-planning-repository.ts app/server/http/planning-route-factories.ts tests/server/planning-service.test.ts tests/server/d1-planning-repository.test.ts tests/server/planning-security.test.ts tests/server/research-planning-integration.test.ts
git commit -m "feat: plan from owner bound research packages"
```

**Closure evidence (2026-09-05):** Task 9 was implemented in `4ab6790` and repaired through `9b599dc`, `767a0bf`, `cc0e9a2`, and `f97ca80`. Fresh independent specification and quality/security reviews on the final code both reported Critical 0 / Important 0 / Minor 0 / READY YES. Root verification on `f97ca80` passed the 12-file relevant suite (343 tests), full unit suite (123 files / 2012 tests), TypeScript, full ESLint, production build (5/5), rendered HTML (3/3), diff-check, and secret/production-boundary scans. No live Provider call, real key, production flag/configuration, production D1/R2 operation, merge, push, candidate save, or deployment was performed. Continue with Task 10.

### Task 10: Add the refresh-resumable Research Beta client controller

**Files:**
- Create: `app/lib/research-client.ts`
- Create: `app/lib/use-role-research.ts`
- Create: `tests/lib/research-client.test.ts`
- Create: `tests/lib/use-role-research.test.tsx`

- [x] **Step 1: Write failing client and controller tests**

Cover safe response parsing, Request ID preservation, stable recovery actions, submit, refresh by run id, retry with a fresh mutation id, clearing stale errors, abort on unmount, and no timer polling after a terminal state. Browser storage may contain only `{runId, role, locale}` under one versioned key and is not authoritative.

```tsx
expect(result.current.state).toMatchObject({ kind: "researching", runId: "research-run-1" });
await act(() => result.current.refresh());
expect(result.current.state).toMatchObject({ kind: "ready", runId: "research-run-1" });
expect(localStorage.getItem("arc:role-research:v1")).not.toContain("package");
```

- [x] **Step 2: Run client tests and verify RED**

Run: `npm run test:unit -- tests/lib/research-client.test.ts tests/lib/use-role-research.test.tsx`

Expected: FAIL because client modules do not exist.

- [x] **Step 3: Implement bounded client parsing and state controller**

`research-client.ts` exposes `startResearch`, `getResearch`, and `retryResearch`, each requiring an AbortSignal and parsing the public contract or stable Arc error envelope. `useRoleResearch` owns the state union `idle | submitting | queued | researching | validating | ready | needs-review | failed`, persists only recovery identity, refreshes on mount, and exposes `start`, `refresh`, `retry`, and `reset`. Active status refresh uses one bounded timer with exponential delays capped at 5 seconds and stops on terminal state, hidden/inactive Setup, unmount, or AbortSignal.

Use Task 8's shared Research HTTP envelope: a valid persisted terminal returned with non-2xx POST status is a recoverable `needs-review`/`failed` run, not a lost connection. Preserve its run ID and issue/retry state; a subsequent GET can restore it without another provider call. Reject malformed or contradictory envelopes and never trust a browser-stored status/package over the server. Errors with no run remain ordinary stable Arc errors. Add explicit initial 422 Needs-review and 503 Failed response tests through refresh and retry so the panel can render the approved recovery actions.

- [x] **Step 4: Run client tests**

Run: `npm run test:unit -- tests/lib/research-client.test.ts tests/lib/use-role-research.test.tsx`

Expected: PASS with fake timers fully drained.

- [x] **Step 5: Commit**

```powershell
git add app/lib/research-client.ts app/lib/use-role-research.ts tests/lib/research-client.test.ts tests/lib/use-role-research.test.tsx
git commit -m "feat: recover role research in setup"
```

**Closure evidence (2026-09-05):** Task 10 implementation `ad58a3e` was repaired in `a06adf7` and final code `0cdfe0ac565d5e15da9c6d16730ed38fe27105a4`. TDD covered strict terminal envelopes, bounded streaming and cancellation, one capped polling timer, identity masking, recovery-only browser storage, and idempotent explicit retry. Specification review found a passive-effect authorization race; 15 discriminating failures led to commit-phase lifecycle synchronization with retained/current command and abandoned-render coverage. Quality review found interrupted initial submissions stranded in `submitting`; three RED interruption cases led to idle recovery with the original mutation retained and no automatic POST. Both independent final reviews reported Critical 0 / Important 0 / Minor 0 / READY YES and independently passed 92 focused tests. Root verification on clean `cebb22e` (only a plan note above identical final code) passed all 125 files / 2104 tests, TypeScript without incremental caching, full ESLint, build 5/5, rendered HTML 3/3, diff-check, and client/production-boundary scans. Windows Vite/build/render subprocesses used the approved sandbox escalation. No real credentials, Provider requests, production changes, merge, push, Sites candidate, or deployment occurred. Continue with Task 11; Task 13 acceptance remains pending.

### Task 11: Embed Research Beta in Setup without breaking existing paths

**Setup eligibility integration (2026-09-05 source inspection):** The existing client has no Research cohort capability read. Add a minimal authenticated, no-store `GET /api/intelligence/research/eligibility` returning only a strict `{ eligible: boolean, requestId }` view. Reuse the existing full Research configuration validator and `role-research-beta` cohort reader; fail closed on unavailable configuration/storage. This is a UI capability hint, never permission to start Research: the existing POST gates remain authoritative. The read must not construct a Provider, start/recover a run, reserve quota/cost, or expose configuration, cohort membership lists, owner IDs, or denial details. Apply a bounded account read-rate policy and existing response safety. The Setup client must abort and discard stale eligibility on session change, default to ineligible while unresolved, and retain owner-run recovery separately from new-call eligibility. Include contract/route and client lifecycle tests. Keep this small integration within Task 11; do not reopen Tasks 8 or 12.

**Files:**
- Create: `app/components/setup/role-research-panel.tsx`
- Modify: `app/components/setup/setup-flow.tsx`
- Modify: `app/components/setup/adaptive-setup-flow.tsx`
- Modify: `app/setup/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/components/role-research-panel.test.tsx`
- Modify: `tests/components/setup-flow.test.tsx`
- Modify: `tests/components/adaptive-setup-flow.test.tsx`
- Modify: `tests/components/accessibility-contracts.test.tsx`
- Modify: `app/path/page.tsx`
- Modify: `app/today/page.tsx`
- Modify: `app/stack/page.tsx`
- Modify: `app/proof/page.tsx`
- Modify: `app/components/workspace/workspace-shell.tsx`
- Modify: `app/lib/use-proof-ledger.ts`
- Modify: `app/components/proof/proof-profile.tsx`
- Modify: `app/components/proof/proof-workspace.tsx`
- Modify: `app/components/proof/proof-editor.tsx` (skill input type only if needed)
- Create: `tests/components/research-workspace-pages.test.tsx`
- Modify: `tests/lib/use-proof-ledger.test.tsx`
- Create: `app/api/intelligence/research/eligibility/route.ts`
- Create: `app/server/http/research-eligibility-route.ts`
- Create: `app/lib/use-research-eligibility.ts`
- Modify: `app/contracts/research.ts` (eligibility view only)
- Create: `tests/api/research-eligibility.test.ts`
- Create: `tests/lib/use-research-eligibility.test.tsx`

- [ ] **Step 1: Write failing Setup state and accessibility tests**

Test Guest Flagship and legacy custom-role paths unchanged; signed-in/cohort non-Flagship exposes `Research this role`; active states use a polite live region and no fake percent; Ready shows role summary, skill/source counts, observed date, `Quality checks passed`, and `Use this research`; Needs review/Failed show stable issue copy and only valid Retry/fallback actions. Test keyboard order, focus after state changes, 44px controls via class contract, reduced motion, no provider/cost/confidence copy, and no `dangerouslySetInnerHTML`.

```tsx
expect(screen.getByRole("status")).toHaveTextContent("Validating sources and learning units");
expect(screen.queryByText(/%|confidence|OpenRouter|token|cost/i)).not.toBeInTheDocument();
await user.click(screen.getByRole("button", { name: "Use this research" }));
expect(onUse).toHaveBeenCalledWith("research-run-1");
```

- [ ] **Step 2: Run Setup tests and verify RED**

Run: `npm run test:unit -- tests/components/role-research-panel.test.tsx tests/components/setup-flow.test.tsx tests/components/adaptive-setup-flow.test.tsx tests/components/accessibility-contracts.test.tsx`

Expected: FAIL because the Research Beta panel and source-aware adaptive flow do not exist.

- [ ] **Step 3: Implement the Editorial Precision Setup flow**

Visual thesis: a calm editorial decision point that reads as one continuous Setup sequence, with the research state expressed through typography and rules rather than cards.

Content plan: existing role question; one inline Beta explanation/action for an eligible custom role; factual live state; a compact Ready summary and single primary continuation; always-visible Flagship fallback.

Interaction thesis: move focus to the status heading on state transition; reveal the Ready facts with the existing restrained opacity/translate treatment; use only the existing button hover/focus language and disable motion under `prefers-reduced-motion`.

`RoleResearchPanel` receives the controller state and callbacks as props, renders external text only in text nodes, and uses `aria-live="polite"`, `aria-busy`, and explicit alert semantics. `SetupFlow` receives signed-in/cohort eligibility and a `renderResearch` slot so it stays presentational. `AdaptiveSetupFlow` accepts `{source:"flagship",roleId}` or `{source:"research",researchRunId}` and builds the discriminated planning request. `app/setup/page.tsx` wires session/cohort state, research controller, and the source-aware adaptive connector. Keep the old custom role disclosure and proportional v7 completion route when Research Beta is unavailable or declined.

Use Ready `planningData` for the actual skill audit and target preview; submit only `researchRunId` plus learner answers, never the displayed package. After saving, Path and Today must select the adaptive workspace by its resolved source context rather than a legacy `setup.roleId === flagshipRole.id` test, and pass its explicit blueprint/registry into `AdaptivePath` and `AdaptiveTodaySession`. Stack and Proof must use that same source's skills for rendering and evidence projection; the workspace heading shows that role's name. Narrow Proof presentation skill props to the fields actually used instead of inventing legacy SkillNode metadata for researched skills. Keep the legacy sample banner only for the real legacy-custom fallback. Missing context shows a loading/recovery boundary, not Flagship content masquerading as the researched role.

`research-workspace-pages.test.tsx` must mount the real page adapters with a non-Flagship validated package and workspace, assert researched phase/skill/resource/step/minute content and heading, refresh with a new controller instance and empty research recovery storage, then exercise Complete/Delay/Keep/Accept. Verify no fixed Flagship content leaks into researched pages; preserve existing Flagship and legacy custom regressions. `use-proof-ledger` must project researched skill IDs and clear source-derived data on account change. Fake-provider browser UAT covers this whole path, not just the Ready panel.

CSS must reuse existing variables/typefaces/accent, remain cardless, collapse to one column at 320px, enforce `min-height: 44px` for actions, and add no gradient or second accent color.

- [ ] **Step 4: Run focused UI and route integration tests**

Run: `npm run test:unit -- tests/components/role-research-panel.test.tsx tests/components/setup-flow.test.tsx tests/components/adaptive-setup-flow.test.tsx tests/components/accessibility-contracts.test.tsx tests/server/research-planning-integration.test.ts`

Expected: PASS for Guest, Flagship, legacy custom, Ready, Needs review, Failed, refresh, retry, and use flows.

- [ ] **Step 5: Commit**

```powershell
git add app/components/setup/role-research-panel.tsx app/components/setup/setup-flow.tsx app/components/setup/adaptive-setup-flow.tsx app/setup/page.tsx app/globals.css tests/components/role-research-panel.test.tsx tests/components/setup-flow.test.tsx tests/components/adaptive-setup-flow.test.tsx tests/components/accessibility-contracts.test.tsx
git commit -m "feat: embed research beta in setup"
```

### Task 12: Extend disabled-by-default runtime and admin health

**Files:**
- Modify: `.env.example`
- Modify: `worker-configuration.d.ts`
- Modify: `app/server/admin/policy.ts`
- Modify: `app/server/admin/repository.ts`
- Modify: `app/server/admin/d1-admin-repository.ts`
- Modify: `app/api/admin/health/route.ts`
- Modify: `db/schema.ts`
- Create: `drizzle/0006_research_health_indexes.sql`
- Create: `drizzle/meta/0006_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Modify: `tests/server/admin-policy.test.ts`
- Create: `tests/server/research-environment.test.ts`
- Create: `tests/server/d1-admin-research-health.test.ts`
- Modify: `tests/api/admin-health.test.ts`
- Modify: `tests/pages/admin.test.tsx`
- Modify: `tests/helpers/sqlite-d1.ts`
- Modify: `tests/db/schema.test.ts`
- Modify: `tests/db/migration-safety.test.ts`
- Modify: `tests/db/research-migration.test.ts`

- [x] **Step 1: Write failing environment and aggregate-health tests**

Assert missing/invalid AI values fail closed, model fields are never returned by admin health, and health includes counts by research state plus reserved/settled/conservative-hold micros. Admin output remains aggregate and reveals no owner, role, URL, request body, or secret.

```ts
expect(snapshot.research).toEqual({
  queued: 1, researching: 0, validating: 1, ready: 2, needsReview: 1, failed: 1,
  reservedMicros: 1200, settledMicros: 430, conservativeHoldMicros: 700,
});
expect(JSON.stringify(snapshot)).not.toMatch(/owner-a|sk-or-|openrouter\//iu);
```

- [x] **Step 2: Run admin/runtime tests and verify RED**

Run: `npm run test:unit -- tests/server/admin-policy.test.ts tests/server/research-environment.test.ts tests/server/d1-admin-research-health.test.ts`

Expected: FAIL because Research Beta environment and health fields do not exist.

- [x] **Step 3: Add documented disabled examples and server-only bindings**

Add empty or false values only:

```dotenv
ARC_AI_RESEARCH_ENABLED=false
ARC_AI_MODEL_RESEARCH=
ARC_AI_MODEL_ECONOMY=
ARC_AI_SITE_DAILY_BUDGET_MICROS=0
ARC_AI_SITE_MONTHLY_BUDGET_MICROS=0
ARC_AI_RESEARCH_MAX_COST_MICROS=0
ARC_AI_REPAIR_MAX_COST_MICROS=0
ARC_AI_RESEARCH_TIMEOUT_MS=20000
ARC_AI_REPAIR_TIMEOUT_MS=10000
ARC_AI_RESEARCH_CACHE_DAYS=14
ARC_AI_IP_HASH_SALT=
OPENROUTER_API_KEY=
```

Remove the obsolete `OPENAI_API_KEY` example only if `rg` proves no supported route consumes it; otherwise keep it separately labeled. Extend Worker bindings with optional strings, never with values. Update health queries to aggregate new D1 tables by UTC ranges and return the bounded research snapshot. Effective enablement requires both existing AI kill switch and Research Beta flag/config validity.

- [x] **Step 4: Run admin/runtime tests**

Run: `npm run test:unit -- tests/server/admin-policy.test.ts tests/server/research-environment.test.ts tests/server/d1-admin-research-health.test.ts tests/server/operational-events.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```powershell
git add .env.example worker-configuration.d.ts app/server/admin/policy.ts app/server/admin/repository.ts app/server/admin/d1-admin-repository.ts app/api/admin/health/route.ts tests/server/admin-policy.test.ts tests/server/research-environment.test.ts tests/server/d1-admin-research-health.test.ts
git commit -m "feat: expose research beta operational health"
```

Execution evidence (2026-09-03): Task 12 was implemented in `2518b68`, then hardened in `5d3b26e` and `e35c4d7`. The final implementation uses the real `role-research-beta` cohort flag, requires the complete Task 8 runtime policy before publishing effective enablement, returns only strict aggregate health, and fails closed on malformed current-window D1 values. Research state counts and reservation exposure are bounded to the current UTC day. Additive migration `0006` contributes only `research_runs_updated_state_idx` and `ai_budget_reservations_day_status_idx`; production-SQL `EXPLAIN QUERY PLAN` tests verify those indexes plus the existing bucket-period index and reject full historical scans. The same specification reviewer and quality reviewer both approved the final source; the quality result was Critical 0 / Important 0 / Minor 0. Fresh controller verification at `e35c4d7` passed 9 focused files / 181 tests, all 122 files / 1963 tests, TypeScript, full ESLint, vinext build 5/5, rendered HTML 3/3, complete Task 12 diff-check, and a clean worktree. No real credential, provider request, production value, flag change, D1/R2 mutation, merge, push, or deployment occurred.

### Task 13: Run offline acceptance gates, reviews, and checkpoint documentation

**Current execution boundary (user instruction, 2026-09-05):** Complete the authorized offline gates and checkpoint only. Do not create/read real keys, make real/paid Provider requests, alter production variables/flags, operate production D1/R2, merge into `master`, push, save a Sites candidate, or deploy. This explicitly supersedes the historical live-request and integration actions in Steps 5–6 and 8 below: record them as not performed under the current authorization, and do not request permission to perform them during this run. Agent-assisted browser UAT is engineering evidence; user acceptance remains pending until the user explicitly accepts it.

**Offline browser composition (2026-09-05 preflight):** Add a test-only harness under `tests/offline-uat/` when executing Step 4. Mount the actual Setup/Path/Today/Stack/Proof page adapters, hooks, clients, and route factory handlers through an isolated loopback Vite entry; do not load the normal Vite configuration, environment files, OAuth, Sites lifecycle, or production bindings. Compose the real services/repositories with `FakeResearchProvider` and disposable SQLite using the existing D1-interface test helper; label this accurately as SQLite implementing the D1 interface. Separately verify the same storage path with an isolated, nonpersistent Miniflare/workerd D1 binding. Keep harness-only session/scenario controls outside product routes, enforce same-origin control writes, reject unknown API routes, and block outbound application requests. For Researching/Validating refresh evidence, prestart a real owner-bound run and pause its provider/committed validation transition, then use the ordinary Research action to recover that active run ID before reload. This tests active-run replay and refresh recovery; it does not claim an initial POST without a returned run ID survives a reload. Production build/render gates remain separate from this browser harness.

**Files:**
- Create: `tests/offline-uat/` (isolated browser harness and disposable local D1 verification)
- Create: `docs/operations/v8-goal2-local-uat.md`
- Modify: `docs/operations/v8-resume-checkpoint.md`
- Modify: `docs/superpowers/plans/2026-08-10-arc-v8-openrouter-research-beta.md`

- [ ] **Step 1: Run the complete automated gate from a clean feature worktree**

```powershell
npm run test:unit
npm run lint
npx tsc --noEmit
npm run build
node --test tests/rendered-html.test.mjs
git diff --check
```

Expected: every command exits 0. Record fresh file/test counts and build route output.

- [ ] **Step 2: Run explicit migration and security gates**

```powershell
npm run test:unit -- tests/db/migration-safety.test.ts tests/db/research-migration.test.ts tests/server/planning-security.test.ts tests/server/openrouter-provider.test.ts tests/api/research-routes.test.ts
rg -n --hidden -g '!node_modules/**' -g '!dist/**' -g '!.git/**' "OPENROUTER_API_KEY\s*=\s*[^[:space:]]+|sk-or-v1-|Authorization:\s*Bearer\s+[A-Za-z0-9]" .
rg -n -g 'app/**' "dangerouslySetInnerHTML|OPENROUTER_API_KEY|ARC_AI_MODEL_RESEARCH|costMicros|promptTokens|completionTokens"
```

Expected: focused tests pass; secret scan has no committed value; client/app surface scan shows no secret usage and provider/cost identifiers occur only in server modules or explicitly reviewed admin aggregate types.

- [ ] **Step 3: Perform two-stage review per implementation task and remediate**

For each Task 1–12 commit, run a specification-compliance review against the approved design and this plan, then a code-quality review covering correctness, owner isolation, concurrency, bounded parsing, Worker compatibility, test quality, accessibility, and scope. Fix every critical/high issue with a new failing regression test, rerun the focused suite, and commit the remediation. Record reviewer commit ids and findings in the plan.

- [ ] **Step 4: Start local Fake Provider preview and perform user-visible UAT**

Run the development server with only local fake mode and local D1; keep all paid/production settings disabled. Validate these exact flows without external network:

1. Guest -> Flagship -> Build -> Path -> Today remains functional.
2. Signed-in eligible user -> non-Flagship role -> Research -> Ready -> Use -> audit -> availability -> target -> Build -> Path -> Today.
3. Refresh while Researching/Validating recovers by run id.
4. Needs review cannot be used and offers Retry/Flagship.
5. Failed distinguishes retryable/non-retryable actions.
6. AI disabled and budget exhausted preserve Flagship and any existing plan.
7. Complete/Delay/replan persist and replay with the research unit registry.
8. At 320px the Setup research region is one column; at 1440px hierarchy remains clear; keyboard/focus/live region and reduced-motion behavior pass.

Record each result and any user observations in `docs/operations/v8-goal2-local-uat.md`.

- [ ] **Step 5: Stop at the real-request approval gate**

Do not request, store, or use a real key automatically. Present the verified offline evidence and ask for a separate authorization for one minimal, fixed-model, maximum-cost-bounded real request using an ephemeral server secret. If authorization is not granted, record exactly: “Offline Research Beta complete; no live OpenRouter evidence claimed.” Goal 2 remains at the live-evidence gate and is not described as fully complete.

- [ ] **Step 6: If separately authorized, run one minimal live request and sanitize evidence**

Use only the separately approved ephemeral secret mechanism and bounded Research model/config. Verify HTTP success, strict structured output, citation annotations, reported usage/cost, Ready/Needs review state, and no secret/client/log leakage. Immediately remove the ephemeral local secret after the request. Record only provider-neutral result category, request time, citation count, usage totals, actual cost micros, and secret-scan result; do not record the key, raw prompt, raw result, or source excerpts.

- [ ] **Step 7: Update the recovery checkpoint and commit Goal 2 evidence**

Update `docs/operations/v8-resume-checkpoint.md` with feature branch/head, worktree, completed tasks, exact verification counts, local UAT status, live-request status, and the explicit remaining gates: local merge, GitHub push, production variables/secret/flags, production D1/R2, Sites candidate, and deployment. Mark completed checkboxes in this plan.

```powershell
git add docs/operations/v8-goal2-local-uat.md docs/operations/v8-resume-checkpoint.md docs/superpowers/plans/2026-08-10-arc-v8-openrouter-research-beta.md
git commit -m "docs: record research beta acceptance"
```

- [ ] **Step 8: Finish the branch without deploying**

After all authorized acceptance evidence is green, use `superpowers:finishing-a-development-branch`. The already-approved optimal route is local merge into `master`, followed by a normal GitHub backup only after verifying local/remote refs and obtaining any network permission required by the environment. Re-run the complete automated gate on merged `master`, push only the reviewed commits, verify remote `master` equals local `HEAD`, and update the checkpoint. Do not call Sites hosting, create a candidate version, apply production migrations, configure runtime values, or deploy.

## Completion definition

The offline implementation is complete only when Tasks 1–12 are committed, two-stage reviews are resolved, all unit/lint/type/build/render/migration/security gates pass from a clean tree, and Fake Provider UAT covers Ready, Needs review, Failed, disabled, budget, refresh, owner isolation, and research-backed planning replay. Full Goal 2 completion additionally requires the separately authorized minimal live request; without that authorization the checkpoint must preserve the precise live-evidence gate rather than implying production readiness.
