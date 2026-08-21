# Arc. v8 Adaptive Planning Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify Arc. v8 Phase 2: a deterministic, event-sourced Flagship learning planner that turns a per-skill audit and real weekly availability into a complete path, one outcome-driven Today unit, a rolling seven-day plan, and reviewable replans for both guests and signed-in learners.

**Architecture:** Add a pure TypeScript planning kernel that consumes the already-validated Phase 1 `RoleBlueprint` plus a versioned, hand-curated Flagship Unit Registry. Keep all time, identity, persistence, and request metadata outside the kernel; adapters persist immutable versions and append-only events either in a new local envelope or additive D1 tables. Existing v7 state, custom-role proportional paths, OAuth, device migration, Proof privacy, and the Phase 1 Stack remain compatibility surfaces and are not rewritten.

**Tech Stack:** TypeScript 5.9, React 19, Vinext/Next 16 routes, Zod 4 strict contracts, Vitest + Testing Library, Drizzle ORM + Cloudflare D1, browser `Intl` date/time-zone support, existing Motion and authored CSS tokens.

**Plan authored:** 2026-08-12

---

## Plan boundary

This plan implements the approved specification at `docs/superpowers/specs/2026-08-11-arc-v8-adaptive-planning-design.md`. It does **not** authorize production D1 migration, feature-flag changes, remote push, Sites deployment, R2 writes, OpenRouter calls, Phase 3 Proof state work, or Phase 4 custom-role research.

Before Task 1, create an isolated `codex/v8-adaptive-planning` worktree using `superpowers:using-git-worktrees`. Every task follows RED → GREEN → refactor → focused verification → commit. Do not reuse test output from an earlier task as evidence for a later checkpoint.

### Locked behavior

- Only the published `ai-native-full-stack-engineer` Flagship blueprint receives the complete Phase 2 flow.
- A custom role keeps the v7 `level`, weekly total, and proportional route, with an explicit limitation notice.
- `independent` selects a calibration unit; it never removes the skill or grants `Verified`.
- The full-scope path is always the source of truth. A target-date alternative may defer only eligible `advantage` and non-prerequisite `strong` skills.
- One date has at most one required primary unit and one optional stretch. A stretch never contributes to the promised completion date.
- `completed` automatically rolls the active plan. `delayed`, `skipped`, `too_hard`, `already_known`, and `availability_changed` create a proposed plan plus diff; only an accept event changes the active pointer.
- The pure kernel reads no session, storage, database, network, environment variable, clock, random source, or request ID.
- Phase 2 completion events never write `proof_items.verified = true` and never call the legacy `completeDemoUnit` path.

## Locked file structure

### New domain and data files

| Path | Responsibility |
|---|---|
| `app/contracts/planning.ts` | Strict public schemas and inferred planning types. |
| `app/contracts/planning-api.ts` | Strict authenticated request/response schemas. |
| `app/data/flagship-unit-registry.ts` | Versioned, hand-curated templates for all 16 Flagship skills. |
| `app/lib/planning/fingerprint.ts` | Canonical JSON and deterministic IDs/fingerprints. |
| `app/lib/planning/calendar.ts` | Calendar-date arithmetic, weekday budgets, time-zone validation. |
| `app/lib/planning/registry-validation.ts` | Registry coverage, reference, checkpoint, and uniqueness policy. |
| `app/lib/planning/path-builder.ts` | Stable prerequisite order, audit substitution, full/target-date alternatives. |
| `app/lib/planning/scheduler.ts` | Completion estimate and rolling seven-calendar-day allocation. |
| `app/lib/planning/plan-diff.ts` | Stable added/moved/removed/unchanged comparison. |
| `app/lib/planning/event-reducer.ts` | Replay, candidate generation, completion roll-forward, decision state. |
| `app/lib/planning/local-repository.ts` | Versioned `arc-planning-state-v2` guest envelope and guarded v7 upgrade. |
| `app/lib/planning-client.ts` | Authenticated planning API client; no planning rules. |
| `app/lib/use-planning-workspace.ts` | Guest/cloud orchestration and recoverable UI state. |

### New server and route files

| Path | Responsibility |
|---|---|
| `app/server/planning/repository.ts` | Owner-scoped repository commands/results. |
| `app/server/planning/d1-planning-repository.ts` | D1 reads, immutable writes, idempotency, sequence and revision guards. |
| `app/server/planning/service.ts` | Re-parse repository output, load Flagship intelligence, invoke pure kernel. |
| `app/server/http/planning-route-factories.ts` | Auth, rate limits, safe errors, request telemetry. |
| `app/api/planning/workspace/route.ts` | Authenticated workspace read. |
| `app/api/planning/generate/route.ts` | Authenticated initial generation. |
| `app/api/planning/events/route.ts` | Authenticated learning event append. |
| `app/api/planning/replans/accept/route.ts` | Atomic candidate acceptance. |
| `app/api/planning/replans/discard/route.ts` | Candidate discard without pointer replacement. |

### New UI files

| Path | Responsibility |
|---|---|
| `app/components/setup/skill-audit-step.tsx` | Category-grouped four-state audit and optional evidence metadata. |
| `app/components/setup/availability-step.tsx` | IANA zone, weekday minutes, rest days, date exceptions. |
| `app/components/setup/target-step.tsx` | Target weeks and conflict alternatives. |
| `app/components/setup/adaptive-setup-flow.tsx` | Five-stage Flagship flow and build state. |
| `app/components/workspace/adaptive-path.tsx` | Full scope, prerequisites, calibration, Later and estimate. |
| `app/components/workspace/seven-day-timeline.tsx` | Continuous seven-day timeline with explicit Rest. |
| `app/components/workspace/plan-diff-review.tsx` | Complete diff, accept and discard controls. |
| `app/components/today/adaptive-today-session.tsx` | One primary unit, optional stretch and contextual event actions. |

### Existing files changed deliberately

- `app/contracts/intelligence.ts`: export the already-reviewed calendar-date and public-HTTPS primitives.
- `db/schema.ts` plus generated `drizzle/0003_adaptive_planning.sql` and metadata.
- `app/components/setup/setup-flow.tsx` and `app/setup/page.tsx`: route Flagship to Phase 2 while preserving custom-role v7.
- `app/today/page.tsx`, `app/path/page.tsx`, `app/components/workspace/workspace-shell.tsx`, and `app/globals.css`: render adaptive state only when one exists.
- `app/lib/use-arc-state.ts`, `app/lib/demo-store.ts`, and existing cloud files only where compatibility tests require an adapter; do not merge planning rules into them.
- `README.md`, the v8 roadmap, and `docs/operations/v8-resume-checkpoint.md`: truthful engineering status after the final gate.

---

### Task 1: Shared validation primitives and strict Phase 2 contracts

**Files:**
- Modify: `app/contracts/intelligence.ts`
- Create: `app/contracts/planning.ts`
- Create: `app/contracts/planning-api.ts`
- Create: `tests/contracts/planning.test.ts`
- Create: `tests/contracts/planning-api.test.ts`
- Modify: `tests/contracts/intelligence.test.ts`

- [ ] **Step 1: Write failing contract tests**

Add table-driven tests that prove strict parsing, all array/string caps, exact weekday keys, real ISO calendar dates, runtime-supported IANA zones, duplicate audit/evidence/exception rejection, public HTTPS evidence, `weeklyMinutes` derivation, exactly seven plan days, at most one primary/stretch per date, and discriminated event payloads.

```ts
it.each(["unseen", "conceptual", "guided", "independent"] as const)(
  "accepts the %s self-assessment level",
  (level) => {
    const audit = validAudit();
    audit.answers[0] = { ...audit.answers[0]!, level };
    expect(skillAuditVersionSchema.parse(audit).answers[0]?.level).toBe(level);
  },
);

it("rejects a weekly total that disagrees with the seven-day template", () => {
  expect(() => availabilityVersionSchema.parse({
    ...validAvailability(),
    weeklyMinutes: 999,
  })).toThrow();
});

it("rejects a plan with two required primary units on one date", () => {
  expect(() => planVersionSchema.parse(planWithDuplicatePrimary())).toThrow();
});
```

- [ ] **Step 2: Run the contract test to verify RED**

Run: `npx vitest run tests/contracts/planning.test.ts tests/contracts/planning-api.test.ts tests/contracts/intelligence.test.ts`

Expected: FAIL because the planning contract modules and exported shared primitives do not exist.

- [ ] **Step 3: Export shared Phase 1 primitives without changing their rules**

Rename the private constants and keep existing resource behavior byte-for-byte:

```ts
export const calendarDateSchema = z.string()
  .refine(isCalendarDate, "Invalid calendar date");

export const publicHttpsUrlSchema = z.string().url()
  .refine(isPublicHttpsUrl, "Public HTTPS URL required");
```

Update `learningResourceSchema` and `roleBlueprintSchema` to consume these exports. Do not relax credentials, IP literal, dotless host, localhost, `.local`, or special-use suffix rejection.

- [ ] **Step 4: Implement the strict planning contracts**

Use `.strict()` on every object and explicit maximums on every array/string. Export these exact schema/type names:

```ts
export const PLANNING_SCHEMA_VERSION = "2026.08.1" as const;
export const skillSelfLevelSchema = z.enum([
  "unseen", "conceptual", "guided", "independent",
]);
export const evidenceKindSchema = z.enum([
  "repository", "deployment", "project", "document", "other",
]);
export const unitKindSchema = z.enum(["learn", "calibrate", "reinforce"]);
export const planGenerationSchema = z.enum(["initial", "automatic", "proposed"]);
export const learningEventKindSchema = z.enum([
  "completed", "delayed", "skipped", "too_hard", "already_known",
  "availability_changed", "replan_accepted", "replan_discarded",
]);
```

The schemas must define and export:

```ts
skillEvidenceSchema
skillAuditAnswerSchema
skillAuditVersionSchema
weekdayMinutesSchema
availabilityExceptionSchema
availabilityVersionSchema
planningTargetSchema
unitStepSchema
unitCheckpointSchema
unitTemplateSchema
skillUnitTrackSchema
unitRegistrySchema
pathUnitSchema
learningPathPhaseSchema
deferredSkillSchema
learningPathVersionSchema
pathBuildResultSchema
dailyUnitSchema
planDaySchema
planVersionSchema
planDiffItemSchema
planDiffSchema
planningEventSchema
planningEventInputSchema
planningWorkspaceSchema
```

Lock these maximums so untrusted repository/API data cannot create unbounded parse or planning work:

| Collection/text | Maximum |
|---|---:|
| Blueprint audit answers | 64 (service later requires exactly the 16 Flagship skills) |
| Evidence records per audit | 192; referenced evidence per skill | 3 |
| Evidence note | 300 characters |
| Availability exceptions | 90 |
| Registry tracks / templates per track | 64 / 8 |
| Unit steps / checkpoints / completion criteria / rubric rows | 12 / 8 / 8 / 6 |
| Path units / Daily Units / plan versions in a workspace | 2,000 / 2,000 / 500 |
| Events in a workspace | 5,000 |
| Mutation-result cache in the local envelope | 500 |
| Human-facing title/objective/why/build/proof/summary strings | 180 / 500 / 500 / 800 / 800 / 1,000 characters |
| Event payload after JSON serialization | 32 KiB |

`planVersionSchema` requires exactly seven `PlanDay` records with unique dates. `planningWorkspaceSchema` requires all active/pending/path/unit/event references to resolve within the same parsed workspace and caps serialized workspace input to 4 MiB before parsing at repository boundaries.

Use this exact aggregate shape so later repository, API, and UI tasks share one vocabulary:

```ts
type PlanningTarget = {
  id: string;
  schemaVersion: "2026.08.1";
  targetWeeks: number;
  inputFingerprint: string;
};

type PathUnit = {
  id: string;
  templateId: string;
  templateVersion: string;
  checkpointId: string | null;
  skillId: string;
  kind: "learn" | "calibrate" | "reinforce";
  estimatedMinutes: number;
  prerequisiteUnitIds: string[];
};

type LearningPathVersion = {
  id: string;
  schemaVersion: "2026.08.1";
  blueprintId: string;
  blueprintVersion: string;
  registryId: string;
  registryVersion: string;
  auditVersionId: string;
  availabilityVersionId: string;
  targetId: string;
  scopeMode: "full-scope" | "target-date";
  phases: Array<{ phaseId: string; name: string; outcome: string; unitIds: string[] }>;
  units: PathUnit[];
  deferredSkills: Array<{
    skillId: string;
    reason: "target-date-advantage" | "target-date-strong";
  }>;
  estimatedStartDate: string;
  estimatedCompletionDate: string;
  inputFingerprint: string;
};

type DailyUnit = {
  id: string;
  templateId: string;
  templateVersion: string;
  checkpointId: string | null;
  skillId: string;
  kind: "learn" | "calibrate" | "reinforce";
  scheduledDate: string;
  slot: "primary" | "stretch";
  required: boolean;
  objective: string;
  whyNow: string;
  primaryResourceId: string;
  alternativeResourceIds: string[];
  steps: Array<{ id: string; label: string; minutes: number }>;
  buildTask: string;
  completionCriteria: string[];
  proofRequirement: string;
  rubric: string[];
  estimatedMinutes: number;
};

type PlanVersion = {
  id: string;
  schemaVersion: "2026.08.1";
  generation: "initial" | "automatic" | "proposed";
  baseVersionId: string | null;
  replanReason: LearningEventKind | null;
  planningDate: string;
  pathVersionId: string;
  days: PlanDay[];
  dailyUnitIds: string[];
  estimatedCompletionDate: string;
  inputFingerprint: string;
  summary: string;
};

type PlanningWorkspace = {
  id: string;
  goalId: string;
  revision: number;
  lastSequence: number;
  audit: SkillAuditVersion;
  availability: AvailabilityVersion;
  target: PlanningTarget;
  pathVersions: LearningPathVersion[];
  planVersions: PlanVersion[];
  dailyUnits: DailyUnit[];
  events: PlanningEvent[];
  activePathVersionId: string;
  activePlanVersionId: string;
  pendingPlanVersionId: string | null;
};

type PlanningEventInput =
  | { kind: "completed"; unitId: string; actualMinutes: number | null; planningDate: string }
  | { kind: "delayed" | "skipped" | "too_hard" | "already_known"; unitId: string; planningDate: string }
  | { kind: "availability_changed"; availability: AvailabilityVersion; planningDate: string };

type PlanningMutationResult = {
  outcome: "active" | "proposed" | "accepted" | "discarded";
  workspace: PlanningWorkspace;
  diff: PlanDiff | null;
};
```

`planningEventSchema` adds repository-assigned `eventId`, `mutationId`, `sequence`, `targetPlanVersionId`, `occurredAt`, and the two decision-event payload variants. `planning-api.ts` must export strict schemas and inferred types for `GeneratePlanningRequest`, `PlanningEventRequest`, `ReplanDecisionRequest`, `PlanningWorkspaceResponse`, and `PlanningMutationResponse`, using the exact request shapes locked in Task 10. An idempotent replay returns the originally stored `PlanningMutationResult` byte-for-byte; it does not change the public `outcome` merely to label the replay.

Lock these semantic fields:

```ts
type SkillEvidence = {
  id: string;
  skillId: string;
  kind: "repository" | "deployment" | "project" | "document" | "other";
  url: string;
  note: string;
};

type AvailabilityVersion = {
  id: string;
  schemaVersion: "2026.08.1";
  timeZone: string;
  weekdays: WeekdayMinutes;
  exceptions: Array<{ date: string; minutes: number; reason: string | null }>;
  weeklyMinutes: number;
  inputFingerprint: string;
};

type PlanDay = {
  date: string;
  budgetMinutes: number;
  status: "scheduled" | "rest" | "open";
  primaryUnitId: string | null;
  stretchUnitId: string | null;
};
```

Use `superRefine` for uniqueness and cross-field limits: exactly one audit answer per Flagship skill is enforced later against the blueprint; contract-level uniqueness rejects repeated IDs and references. Availability accepts only integer `0` or `15..720`, sums to `30..2400`, caps exceptions at 90, and rejects duplicate dates. Validate time zones by constructing `new Intl.DateTimeFormat("en", { timeZone })` inside a safe predicate.

- [ ] **Step 5: Run focused contracts and typecheck**

Run: `npx vitest run tests/contracts/planning.test.ts tests/contracts/planning-api.test.ts tests/contracts/intelligence.test.ts`

Expected: PASS, including malformed dates, zones, URLs, duplicates, unknown fields, and size limits.

Run: `npx tsc --noEmit`

Expected: exit `0`.

- [ ] **Step 6: Commit**

```powershell
git add app/contracts/intelligence.ts app/contracts/planning.ts app/contracts/planning-api.ts tests/contracts/intelligence.test.ts tests/contracts/planning.test.ts tests/contracts/planning-api.test.ts
git commit -m "feat: define adaptive planning contracts"
```

---

### Task 2: Versioned Flagship Unit Registry and integrity policy

**Files:**
- Create: `app/data/flagship-unit-registry.ts`
- Create: `app/lib/planning/registry-validation.ts`
- Create: `tests/data/flagship-unit-registry.test.ts`
- Create: `tests/lib/planning/registry-validation.test.ts`

- [ ] **Step 1: Write failing Registry coverage tests**

Test exact 16-skill coverage, one-or-more `learn`, exactly one `calibrate`, one `reinforce` fallback per skill, unique stable IDs, `15..180` estimates, step-minute totals, checkpoint coverage, and resource IDs resolvable in `flagshipBlueprint`.

```ts
it("covers every reviewed Flagship skill with learn, calibrate and reinforce", () => {
  const tracks = new Map(flagshipUnitRegistry.tracks.map((track) => [track.skillId, track]));
  expect([...tracks.keys()].sort()).toEqual(
    flagshipBlueprint.skills.map((skill) => skill.id).sort(),
  );
  for (const skill of flagshipBlueprint.skills) {
    const track = tracks.get(skill.id)!;
    expect(track.templates.some((unit) => unit.kind === "learn")).toBe(true);
    expect(track.templates.filter((unit) => unit.kind === "calibrate")).toHaveLength(1);
    expect(track.templates.filter((unit) => unit.kind === "reinforce")).toHaveLength(1);
  }
});
```

Add one mutation test for each issue code: `duplicate-template`, `missing-skill`, `missing-resource`, `missing-kind`, `minute-mismatch`, `invalid-checkpoint`, and `registry-version-mismatch`.

- [ ] **Step 2: Run Registry tests to verify RED**

Run: `npx vitest run tests/data/flagship-unit-registry.test.ts tests/lib/planning/registry-validation.test.ts`

Expected: FAIL because the Registry and validator do not exist.

- [ ] **Step 3: Implement the pure Registry validator**

Export:

```ts
export type RegistryIssueCode =
  | "duplicate-track"
  | "duplicate-template"
  | "duplicate-step"
  | "duplicate-checkpoint"
  | "missing-skill"
  | "missing-resource"
  | "missing-kind"
  | "minute-mismatch"
  | "invalid-checkpoint"
  | "registry-version-mismatch";

export function validateUnitRegistry(
  registry: UnitRegistry,
  blueprint: RoleBlueprint,
): { valid: boolean; issues: RegistryIssue[] };
```

Build skill/resource maps once, funnel issues through a de-duplicating `addIssue`, compare blueprint ID/version exactly, verify template/track skill identity, sum step minutes, and require checkpoint step IDs to be unique, resolvable, contiguous in source order, and total to the template estimate when checkpoints are present. Sort by `code`, then semantic `path`; never include array indexes.

- [ ] **Step 4: Author the reviewed Registry data**

Parse once at export:

```ts
export const flagshipUnitRegistry = unitRegistrySchema.parse({
  id: "ai-native-full-stack-engineer-units",
  version: "2026.08.1",
  blueprintId: flagshipBlueprint.id,
  blueprintVersion: flagshipBlueprint.version,
  tracks: flagshipUnitTracks,
});
```

Define `flagshipUnitTracks` in the same module as a literal `UnitRegistry["tracks"]` array; do not export a factory that manufactures instructional copy at runtime.

Use this locked content matrix. Each ID is `<skill>-learn-01`, `<skill>-calibrate-01`, or `<skill>-reinforce-01`; every template uses the matching `<skill>-official` Phase 1 resource. The implementation must write concrete objective, `whyNow`, timed steps, build task, two-or-more completion criteria, proof requirement, and three-level rubric for every row—never generate these strings at runtime from the skill name.

| Skill | Learn title / min | Calibrate title / min | Reinforce title / min | Required build artifact |
|---|---|---|---|---|
| `web-platform` | Trace a browser interaction end to end / 75 | Explain the browser-runtime boundary / 30 | Rebuild semantic HTML and event flow / 30 | Accessible form with a documented request/event trace |
| `typescript` | Model one UI-to-API contract / 90 | Repair an unsafe typed boundary / 35 | Practice unions, narrowing and inference / 30 | Strict schema plus inferred request/result types |
| `react` | Build an accessible async React flow / 90 | Diagnose state ownership and rendering / 35 | Rehearse state, events and effects / 30 | Tested form with loading, success and recovery states |
| `design-systems` | Author a keyboard-safe component state model / 75 | Audit semantics, focus and contrast / 30 | Rebuild focus and error relationships / 30 | Reusable component with visible focus and state text |
| `http-apis` | Design a typed idempotent write endpoint / 75 | Review an HTTP failure contract / 30 | Rehearse methods, status and retry semantics / 30 | Request/response contract with safe error cases |
| `edge-runtime` | Ship a Worker-compatible route boundary / 90 | Explain edge constraints and bindings / 35 | Rebuild the isolate execution model / 30 | Edge handler with injected bindings and no Node-only leak |
| `sql` | Model immutable versions and relations / 90 | Review keys, cardinality and delete actions / 35 | Rehearse joins and integrity constraints / 30 | Additive relational schema with ownership boundaries |
| `object-storage` | Design private object metadata and compensation / 60 | Threat-model an object access path / 30 | Rehearse database-versus-object boundaries / 30 | Put/get/cleanup sequence with private object keys |
| `testing` | Drive one behavior from RED to GREEN / 75 | Strengthen a weak regression test / 30 | Rehearse boundary and mutation tests / 30 | Focused test proving a meaningful failure before implementation |
| `security` | Enforce session, ownership and secret boundaries / 90 | Audit one authorization path / 35 | Separate authentication from authorization / 30 | Threat model plus owner-scoped negative tests |
| `cloud-delivery` | Build a reversible delivery runbook / 90 | Diagnose a failed build or release / 35 | Rehearse environment and rollback boundaries / 30 | Build, smoke-check and rollback checklist |
| `observability` | Emit useful telemetry without private data / 60 | Audit signal quality and redaction / 30 | Rehearse metrics, logs and traces / 30 | Structured event contract with allowed counters only |
| `llm-contracts` | Validate a mocked structured-model boundary / 90 | Reject malformed model output safely / 35 | Separate prompt text from output contracts / 30 | Provider-independent schema gate with malformed fixtures |
| `retrieval` | Rank attributable evidence without fetching / 90 | Audit provenance, recency and coverage / 35 | Rehearse source attribution decisions / 30 | Evidence registry with explicit source-quality rationale |
| `product-thinking` | Turn a user outcome into acceptance criteria / 60 | Defend one scope trade-off / 30 | Separate outcomes from feature output / 30 | One-page product slice with goals, non-goals and gates |
| `proof-of-work` | Package a reviewable implementation artifact / 60 | Assess whether a claim is inspectable / 30 | Rehearse claim-to-evidence mapping / 30 | Commit or note with reproduction and verification evidence |

Templates longer than 60 minutes must contain explicit, contiguous checkpoints of 30–60 minutes whose step IDs cover the full template exactly. Shorter templates remain atomic.

- [ ] **Step 5: Capture mutation REDs, then make Registry GREEN**

For each validator rule, temporarily mutate one valid Registry fixture, run the focused test, record the expected single failure, restore the fixture immediately, and implement the minimum rule. Do not weaken `unitRegistrySchema` to accommodate the data.

Run: `npx vitest run tests/data/flagship-unit-registry.test.ts tests/lib/planning/registry-validation.test.ts tests/data/flagship-blueprint.test.ts`

Expected: PASS with all 16 tracks, 48+ templates, exact resource backlinks, and no network use.

- [ ] **Step 6: Commit**

```powershell
git add app/data/flagship-unit-registry.ts app/lib/planning/registry-validation.ts tests/data/flagship-unit-registry.test.ts tests/lib/planning/registry-validation.test.ts
git commit -m "feat: curate flagship learning units"
```

---

### Task 3: Deterministic fingerprint and calendar primitives

**Files:**
- Create: `app/lib/planning/fingerprint.ts`
- Create: `app/lib/planning/calendar.ts`
- Create: `tests/lib/planning/fingerprint.test.ts`
- Create: `tests/lib/planning/calendar.test.ts`

- [ ] **Step 1: Write failing deterministic primitive tests**

Cover recursively sorted object keys, preserved array order, excluded runtime metadata, identical IDs for identical domain input, different IDs for material input, real-date arithmetic across month/year/leap boundaries, weekday mapping, exception override, explicit Rest, IANA validation, and `planningDateForInstant` around DST transitions.

```ts
expect(fingerprint({ b: 2, a: 1 })).toBe(fingerprint({ a: 1, b: 2 }));
expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
expect(addCalendarDays("2028-02-29", 1)).toBe("2028-03-01");
expect(calendarDates("2026-12-29", 7)).toEqual([
  "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01",
  "2027-01-02", "2027-01-03", "2027-01-04",
]);
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npx vitest run tests/lib/planning/fingerprint.test.ts tests/lib/planning/calendar.test.ts`

Expected: FAIL with missing planning primitive modules.

- [ ] **Step 3: Implement canonical fingerprints**

Export these exact functions:

```ts
export function canonicalJson(value: unknown): string;
export function fingerprint(value: unknown): string;
export function deterministicId(prefix: string, value: unknown): string;
```

`canonicalJson` sorts object keys recursively, preserves array order, rejects unsupported values (`undefined`, function, symbol, bigint, non-finite number), and serializes plain JSON only. `fingerprint` uses four independently seeded synchronous FNV-style 32-bit lanes over the canonical string and concatenates them as `p2-<32 lowercase hex>`. `deterministicId` validates a lowercase kebab prefix and returns `<prefix>-<fingerprint suffix>`. Never read `crypto`, time, random state, or environment values.

- [ ] **Step 4: Implement calendar helpers without time-zone offset arithmetic**

Export:

```ts
export function addCalendarDays(date: string, days: number): string;
export function compareCalendarDates(left: string, right: string): number;
export function calendarDates(start: string, count: number): string[];
export function weekdayForDate(date: string): keyof WeekdayMinutes;
export function minutesForDate(availability: AvailabilityVersion, date: string): number;
export function planningDateForInstant(instant: string, timeZone: string): string;
export function validateAvailabilityHorizon(
  availability: AvailabilityVersion,
  planningDate: string,
): void;
```

Use UTC only as an internal carrier for calendar parts in `addCalendarDays`; never convert a local midnight through an offset. `planningDateForInstant` uses `Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(...)`. Horizon validation permits dates from `planningDate` through `planningDate + 365`, rejects past/out-of-range exceptions, and does not mutate input.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npx vitest run tests/lib/planning/fingerprint.test.ts tests/lib/planning/calendar.test.ts tests/contracts/planning.test.ts`

Expected: PASS, including `America/New_York` spring/fall DST and `Asia/Shanghai` controls.

Run: `npx tsc --noEmit`

Expected: exit `0`.

- [ ] **Step 6: Commit**

```powershell
git add app/lib/planning/fingerprint.ts app/lib/planning/calendar.ts tests/lib/planning/fingerprint.test.ts tests/lib/planning/calendar.test.ts
git commit -m "feat: add deterministic planning primitives"
```

---

### Task 4: Stable path builder and honest scope alternatives

**Files:**
- Create: `app/lib/planning/path-builder.ts`
- Create: `tests/lib/planning/path-builder.test.ts`

- [ ] **Step 1: Write failing path-builder tests**

Create compact blueprints/registries to prove:

- all non-`independent` answers select every ordered `learn` template;
- `independent` selects only the skill's calibration template;
- prerequisite units precede dependent units;
- stable ties use phase index, blueprint skill index, then skill ID;
- full scope includes all 16 skills;
- target-date defers `advantage` before eligible `strong`;
- core and transitive prerequisites never move to Later;
- impossible target dates return `target-date: null` plus an explicit infeasible reason;
- input objects remain unchanged;
- identical inputs produce byte-identical path result and IDs.

```ts
expect(buildPath(inputWithIndependent("typescript")).fullScope.units)
  .toEqual(expect.arrayContaining([
    expect.objectContaining({
      skillId: "typescript",
      kind: "calibrate",
      templateId: "typescript-calibrate-01",
    }),
  ]));
expect(result.targetDate?.deferredSkills.map((item) => item.skillId))
  .not.toContain("typescript");
```

- [ ] **Step 2: Run the focused test to verify RED**

Run: `npx vitest run tests/lib/planning/path-builder.test.ts`

Expected: FAIL because `buildLearningPaths` does not exist.

- [ ] **Step 3: Implement validation and stable topological ordering**

Export:

```ts
export type PathBuildInput = {
  blueprint: RoleBlueprint;
  registry: UnitRegistry;
  audit: SkillAuditVersion;
  availability: AvailabilityVersion;
  target: PlanningTarget;
  planningDate: string;
};

export function buildLearningPaths(input: PathBuildInput): PathBuildResult;
```

At entry, strict-parse every contract, run `validateRoleBlueprint`, run `validateUnitRegistry`, verify exactly one audit answer for every blueprint skill and no extra skill, and call `validateAvailabilityHorizon`. Throw a typed `PlanningInputError` containing sorted public issue codes/semantic paths but not evidence notes or URLs.

Use iterative Kahn topological ordering. The ready queue comparator is:

```ts
(left, right) =>
  phaseIndex(left) - phaseIndex(right)
  || blueprintIndex(left) - blueprintIndex(right)
  || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
```

Expand ordered skill templates into immutable `PathUnit` records. For a checkpointed template, create one path unit per checkpoint with a stable ID derived from blueprint, Registry, template, and checkpoint versions; otherwise create one atomic path unit. Chain checkpoints and multiple learn templates within a skill, then make the first unit of a dependent skill reference the final required unit of every prerequisite skill. This preserves both intra-skill sequence and cross-skill dependencies.

- [ ] **Step 4: Implement full-scope and target-date selection**

Compute the target deadline as `planningDate + targetWeeks * 7 - 1`. Ask the scheduler's estimate-only helper from Task 5 through a small injected dependency so Task 4 tests can supply a deterministic estimator before Task 5 exists:

```ts
export type CompletionEstimator = (
  units: readonly PathUnit[],
  availability: AvailabilityVersion,
  planningDate: string,
) => string;
```

The production export uses `estimateCompletionDate` after Task 5. Until then, the constructor-style export accepts the estimator:

```ts
export function createPathBuilder(estimate: CompletionEstimator) {
  return (input: PathBuildInput): PathBuildResult =>
    buildValidatedPathAlternatives(input, estimate);
}
```

`buildValidatedPathAlternatives` is a private function in the same file implementing the complete parsing, topological ordering, scope selection, estimate, ID, and fingerprint rules in Steps 3–4.

For a conflict, build a protected skill closure starting from every `core` skill. A defer candidate is eligible only when it is `advantage`, or `strong` and not in the transitive prerequisite closure of any retained skill. Sort candidates by importance rank (`advantage` first), phase index, blueprint index, and ID. Remove one candidate at a time, recompute the retained prerequisite closure, and stop at the first honest schedule that fits. Never shorten unit minutes.

- [ ] **Step 5: Verify path behavior**

Run: `npx vitest run tests/lib/planning/path-builder.test.ts tests/lib/planning/registry-validation.test.ts tests/lib/intelligence-validation.test.ts`

Expected: PASS with deterministic full scope, truthful alternatives, no cycle/owner/network behavior.

- [ ] **Step 6: Commit**

```powershell
git add app/lib/planning/path-builder.ts tests/lib/planning/path-builder.test.ts
git commit -m "feat: build deterministic learning paths"
```

---

### Task 5: Completion estimator and rolling seven-day scheduler

**Files:**
- Create: `app/lib/planning/scheduler.ts`
- Create: `tests/lib/planning/scheduler.test.ts`
- Modify: `app/lib/planning/path-builder.ts`
- Modify: `tests/lib/planning/path-builder.test.ts`

- [ ] **Step 1: Write failing scheduler tests**

Test exact seven-date coverage, exception precedence, Rest days, one required primary per day, no partial unit unless it is a declared checkpoint, minute fit, no dependency violation, at most one optional reinforce stretch, stretch excluded from completion estimate, cross-month/year/DST behavior, completed-unit exclusion, and deterministic IDs.

```ts
expect(plan.days).toHaveLength(7);
expect(plan.days.map((day) => day.date)).toEqual(calendarDates(planningDate, 7));
expect(plan.days.find((day) => day.date === restDate)).toMatchObject({
  budgetMinutes: 0,
  status: "rest",
  primaryUnitId: null,
  stretchUnitId: null,
});
for (const day of plan.days) {
  const primary = unitsById.get(day.primaryUnitId ?? "");
  expect(primary?.estimatedMinutes ?? 0).toBeLessThanOrEqual(day.budgetMinutes);
}
```

- [ ] **Step 2: Run the scheduler test to verify RED**

Run: `npx vitest run tests/lib/planning/scheduler.test.ts`

Expected: FAIL because scheduler exports do not exist.

- [ ] **Step 3: Implement the estimator**

Export:

```ts
export function estimateCompletionDate(input: {
  units: readonly PathUnit[];
  availability: AvailabilityVersion;
  planningDate: string;
  completedUnitIds?: ReadonlySet<string>;
}): string;
```

Iterate calendar dates up to a hard 3,660-day horizon. On each non-rest date, schedule at most one next required unit that fits the full budget and whose prerequisite unit IDs are complete. An atomic unit that never fits any available day produces `PlanningScheduleError("UNIT_NEVER_FITS")`; an exhausted horizon produces `PlanningScheduleError("SCHEDULE_HORIZON_EXCEEDED")`. The estimator ignores optional stretch templates.

- [ ] **Step 4: Implement the seven-day plan builder**

Export:

```ts
export function buildPlanVersion(input: {
  path: LearningPathVersion;
  registry: UnitRegistry;
  availability: AvailabilityVersion;
  planningDate: string;
  generation: "initial" | "automatic" | "proposed";
  baseVersionId: string | null;
  replanReason: LearningEventKind | null;
  completedUnitIds: ReadonlySet<string>;
}): { plan: PlanVersion; dailyUnits: DailyUnit[] };
```

For each of seven dates, use exception minutes before weekday minutes. Assign only the next eligible required path unit. After primary assignment, a stretch may be the matching skill's `reinforce` template only when its full minutes fit the remaining budget; give it `required: false` and a context-specific deterministic ID. The UI exposes that stretch only after the primary is completed, and stretch completion never unlocks dependencies or alters the promised date. Build `PlanVersion.id` and `inputFingerprint` from parsed domain inputs excluding `createdAt`, request IDs, mutation IDs, and runtime clock data.

- [ ] **Step 5: Replace the injected path estimator with the production helper**

Keep `createPathBuilder` exported for focused tests, and export:

```ts
export const buildLearningPaths = createPathBuilder(
  (units, availability, planningDate) => estimateCompletionDate({
    units,
    availability,
    planningDate,
  }),
);
```

- [ ] **Step 6: Run focused scheduler/path tests and typecheck**

Run: `npx vitest run tests/lib/planning/scheduler.test.ts tests/lib/planning/path-builder.test.ts tests/lib/planning/calendar.test.ts`

Expected: PASS, with no required minute overrun and byte-identical repeated results.

Run: `npx tsc --noEmit`

Expected: exit `0`.

- [ ] **Step 7: Commit**

```powershell
git add app/lib/planning/scheduler.ts app/lib/planning/path-builder.ts tests/lib/planning/scheduler.test.ts tests/lib/planning/path-builder.test.ts
git commit -m "feat: schedule rolling learning plans"
```

---

### Task 6: Plan diff, learning events, replay, and deterministic replans

**Files:**
- Create: `app/lib/planning/plan-diff.ts`
- Create: `app/lib/planning/event-reducer.ts`
- Create: `tests/lib/planning/plan-diff.test.ts`
- Create: `tests/lib/planning/event-reducer.test.ts`

- [ ] **Step 1: Write failing diff tests**

Use stable unit IDs to assert exact `added`, `moved`, `removed`, and `unchanged` entries, old/new dates, reason, completion-date change, sorted output, and the invariant that a completed unit can only be `unchanged`.

```ts
expect(diffPlans({ active, candidate, completedUnitIds: new Set(["unit-a"]) }))
  .toMatchObject({
    items: [
      { unitId: "unit-a", change: "unchanged", fromDate: "2026-08-12", toDate: "2026-08-12" },
      { unitId: "unit-b", change: "moved", fromDate: "2026-08-13", toDate: "2026-08-14" },
    ],
  });
```

- [ ] **Step 2: Run diff tests to verify RED**

Run: `npx vitest run tests/lib/planning/plan-diff.test.ts`

Expected: FAIL because `diffPlans` does not exist.

- [ ] **Step 3: Implement the pure diff**

Export:

```ts
export function diffPlans(input: {
  active: PlanVersion;
  candidate: PlanVersion;
  completedUnitIds: ReadonlySet<string>;
}): PlanDiff;
```

Index plan-day primary/stretch references once, union the unit IDs, classify by stable unit ID, reject any candidate that moves or removes a completed unit, and sort by change rank (`added`, `moved`, `removed`, `unchanged`), then destination/source date, then unit ID. Produce a deterministic diff ID/fingerprint and a sentence-level completion-date summary; do not include runtime timestamps.

- [ ] **Step 4: Write failing event/replay tests**

Cover all eight event kinds and all three candidate states:

- `completed` preserves the unit ID/history date and automatically activates a rolled plan;
- `delayed` moves the unit to the next fitting date and moves dependents;
- `skipped` records the fact but does not mark completion;
- `too_hard` inserts the matching reinforce template before the target or returns `REINFORCEMENT_UNAVAILABLE` without changing the active plan;
- `already_known` replaces unfinished learn units for that skill with one calibration unit;
- `availability_changed` reschedules only unfinished units using the supplied new version;
- `replan_accepted` requires the pending candidate and matching base revision;
- `replan_discarded` keeps the old active plan and records the terminal decision;
- replay of the same ordered stream reconstructs the same pointers, completion set, and fingerprints;
- `occurredAt` never determines order—`sequence` does;
- repeated mutation IDs are rejected before a second transition.

- [ ] **Step 5: Run event tests to verify RED**

Run: `npx vitest run tests/lib/planning/event-reducer.test.ts tests/lib/planning/plan-diff.test.ts`

Expected: event tests FAIL because reducer exports do not exist; diff tests remain GREEN.

- [ ] **Step 6: Implement transition and replay APIs**

Export these exact public functions:

```ts
export type PlanningTransition =
  | { kind: "automatic"; event: PlanningEvent; workspace: PlanningWorkspace }
  | { kind: "proposed"; event: PlanningEvent; workspace: PlanningWorkspace; diff: PlanDiff }
  | { kind: "accepted" | "discarded"; event: PlanningEvent; workspace: PlanningWorkspace };

export function applyPlanningEvent(input: {
  workspace: PlanningWorkspace;
  event: PlanningEvent;
  blueprint: RoleBlueprint;
  registry: UnitRegistry;
}): PlanningTransition;

export function replayPlanningEvents(input: {
  initial: PlanningWorkspace;
  events: readonly PlanningEvent[];
  blueprint: RoleBlueprint;
  registry: UnitRegistry;
}): PlanningWorkspace;
```

Strict-parse workspace/event inputs, require `sequence === workspace.lastSequence + 1`, reject duplicate mutation IDs, and never mutate the input workspace. Candidate-generating events call the existing path/scheduler with explicit inputs and return a `pendingPlanVersionId`; they do not replace `activePlanVersionId`. Decision events reference the exact pending plan ID and base revision. A completed event appends completion state, regenerates seven dates from the supplied planning date in its payload, and advances the active plan atomically in the returned value.

Use typed errors with stable public codes:

```ts
"STALE_SEQUENCE" | "DUPLICATE_MUTATION" | "UNIT_NOT_ACTIVE" |
"REINFORCEMENT_UNAVAILABLE" | "PENDING_REPLAN_REQUIRED" |
"BASE_REVISION_MISMATCH" | "COMPLETED_HISTORY_CHANGED"
```

- [ ] **Step 7: Mutation-test history protection and replay**

Temporarily remove completed-unit locking and confirm the focused test fails; restore it. Temporarily order by `occurredAt` and confirm an out-of-time-order fixture fails; restore it. Temporarily reapply a discarded candidate during replay and confirm only the decision-state test fails; restore it.

Run: `npx vitest run tests/lib/planning/plan-diff.test.ts tests/lib/planning/event-reducer.test.ts tests/lib/planning/scheduler.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add app/lib/planning/plan-diff.ts app/lib/planning/event-reducer.ts tests/lib/planning/plan-diff.test.ts tests/lib/planning/event-reducer.test.ts
git commit -m "feat: replay adaptive planning events"
```

---

### Task 7: Guest repository and guarded v7 local upgrade

**Files:**
- Create: `app/lib/planning/local-repository.ts`
- Create: `tests/lib/planning/local-repository.test.ts`
- Modify: `app/lib/demo-store.ts`
- Modify: `tests/lib/demo-store.test.ts`

- [ ] **Step 1: Expose a read-only v7 storage key helper**

Keep `arc-demo-state-v1` unchanged. Export a named constant and a raw strict reader so the Phase 2 migrator does not duplicate the key or permissive parsing rules:

```ts
export const DEMO_STORAGE_KEY = "arc-demo-state-v1";

export function readDemoStateForMigration(
  storage?: Pick<Storage, "getItem">,
): { found: false } | { found: true; state: DemoState; fingerprint: string };
```

The helper must return `found: false` for absent or malformed input and must not write storage.

- [ ] **Step 2: Write failing local repository tests**

Prove:

- the new key is exactly `arc-planning-state-v2`;
- an absent envelope does not overwrite or remove v7 state;
- v7 role/target/weekly summary is retained only as a migration marker/draft hint;
- v7 `level` produces **zero** per-skill audit answers;
- read-validate-write writes only after the whole new envelope parses;
- a parse or `setItem` failure returns the v7-compatible fallback and writes no partial envelope;
- event sequence is monotonic and mutation replay is idempotent;
- stale `baseVersionId` returns conflict without changing the stored bytes;
- accept/discard retain old plan/event rows in the envelope;
- input/output is strict-cloned so callers cannot mutate persisted state.

```ts
expect(upgradeV7State(storage)).toMatchObject({
  migrated: true,
  envelope: {
    migration: { source: "arc-demo-state-v1" },
    setupDraft: { legacyLevel: "advanced", auditAnswers: [] },
  },
});
expect(storage.getItem(DEMO_STORAGE_KEY)).toBe(before);
```

- [ ] **Step 3: Run local repository tests to verify RED**

Run: `npx vitest run tests/lib/planning/local-repository.test.ts tests/lib/demo-store.test.ts`

Expected: FAIL because the Phase 2 repository and migration reader do not exist.

- [ ] **Step 4: Implement the local envelope and repository**

Export:

```ts
export const PLANNING_STORAGE_KEY = "arc-planning-state-v2";

export interface LocalPlanningRepository {
  load(): Promise<PlanningWorkspace | null>;
  generate(request: GeneratePlanningRequest): Promise<PlanningMutationResult>;
  appendEvent(request: PlanningEventRequest): Promise<PlanningMutationResult>;
  accept(request: ReplanDecisionRequest): Promise<PlanningMutationResult>;
  discard(request: ReplanDecisionRequest): Promise<PlanningMutationResult>;
}

export function createLocalPlanningRepository(options?: {
  storage?: Storage;
  createId?: () => string;
  now?: () => Date;
}): LocalPlanningRepository;
```

The persisted envelope contains strict schema version, migration marker, setup draft, current workspace, append-only event stream, mutation result cache capped at 500, and `nextSequence`. Construct the entire next envelope in memory, parse it, serialize it once, then call `setItem` once. Never mutate `arc-demo-state-v1` or `arc-offline-queue-v1`.

The guest repository delegates all generation/transitions to the pure kernel. Inject event ID, mutation ID, sequence, and occurrence time; pass them in explicitly. Repository replay returns the originally serialized public result for a duplicate mutation ID.

- [ ] **Step 5: Verify local migration and regression**

Run: `npx vitest run tests/lib/planning/local-repository.test.ts tests/lib/demo-store.test.ts tests/lib/use-arc-state.test.tsx tests/lib/core-loop.test.ts`

Expected: PASS; v7 tests remain unchanged and `proofItems.verified` behavior is not invoked by Phase 2 tests.

- [ ] **Step 6: Commit**

```powershell
git add app/lib/planning/local-repository.ts app/lib/demo-store.ts tests/lib/planning/local-repository.test.ts tests/lib/demo-store.test.ts
git commit -m "feat: persist guest adaptive plans"
```

---

### Task 8: Additive D1 planning schema and generated `0003` migration

**Files:**
- Modify: `db/schema.ts`
- Create: `drizzle/0003_adaptive_planning.sql` (generated only)
- Create: `drizzle/meta/0003_snapshot.json` (generated only)
- Modify: `drizzle/meta/_journal.json` (generated only)
- Modify: `tests/db/schema.test.ts`
- Modify: `tests/db/migration-safety.test.ts`
- Create: `tests/db/planning-migration.test.ts`

- [ ] **Step 1: Write failing schema tests for seven personal tables**

Add exact table/column/index/FK assertions for:

```text
skill_audit_versions
availability_versions
learning_path_versions
plan_versions
daily_units
planning_workspaces
planning_events
```

Every table contains `user_id` and `goal_id`. Add `career_goals_user_id_idx` as a unique composite parent key on `(user_id, id)`. Each planning table has a composite FK `(user_id, goal_id)` to that key with `ON DELETE CASCADE`.

Lock the remaining boundaries:

- audit, availability, path, and plan: unique `(user_id, goal_id, id)`;
- workspace: unique `(user_id, goal_id)` and nonnegative `revision`/`next_sequence` at application validation;
- daily unit: unique `(user_id, goal_id, plan_version_id, unit_id)` and `(user_id, goal_id, plan_version_id, scheduled_date, slot)`;
- event: unique `(user_id, goal_id, workspace_id, sequence)` and `(user_id, mutation_id)`;
- path composite FKs to audit/availability versions;
- plan composite FK to path and nullable self base version;
- daily unit composite FK to plan;
- workspace nullable composite pointers to audit/availability/path/plan, allowing insert-first bootstrap;
- event composite FKs to workspace and target/candidate plan IDs.

- [ ] **Step 2: Run schema tests to verify RED**

Run: `npx vitest run tests/db/schema.test.ts`

Expected: FAIL because the seven tables and indexes do not exist.

- [ ] **Step 3: Implement Drizzle definitions**

Store immutable version bodies in `payload_json`, plus indexed identity/fingerprint columns. Use these exact semantic columns:

```text
skill_audit_versions: id, user_id, goal_id, schema_version, blueprint_id,
  blueprint_version, input_fingerprint, payload_json, created_at
availability_versions: id, user_id, goal_id, schema_version, input_fingerprint,
  weekly_minutes, payload_json, created_at
learning_path_versions: id, user_id, goal_id, schema_version, blueprint_id,
  blueprint_version, registry_id, registry_version, audit_version_id,
  availability_version_id, scope_mode, input_fingerprint, payload_json, created_at
plan_versions: id, user_id, goal_id, schema_version, path_version_id,
  generation, base_version_id, replan_reason, planning_date,
  input_fingerprint, payload_json, created_at
daily_units: id, user_id, goal_id, plan_version_id, unit_id, scheduled_date,
  slot, required, payload_json, created_at
planning_workspaces: id, user_id, goal_id, revision, current_audit_version_id,
  current_availability_version_id, active_path_version_id,
  active_plan_version_id, pending_plan_version_id, next_sequence,
  created_at, updated_at
planning_events: id, user_id, goal_id, workspace_id, sequence, mutation_id,
  target_plan_version_id, candidate_plan_version_id, unit_id, kind,
  payload_json, occurred_at, created_at
```

`slot` is `primary | stretch`; `generation` and `kind` mirror the strict contracts. Keep pointer columns nullable to avoid an impossible circular bootstrap; the repository must insert validated immutable versions before switching pointers in one batch.

- [ ] **Step 4: Generate, never hand-author, the migration**

First verify the exact deletion targets are inside the implementation worktree. If no `0003` exists, run:

```powershell
npx drizzle-kit generate --name adaptive_planning
```

Expected: exactly `drizzle/0003_adaptive_planning.sql`, `drizzle/meta/0003_snapshot.json`, and one journal entry tagged `0003_adaptive_planning`. Stop if Drizzle chooses another sequence or proposes changing/removing any pre-existing table.

- [ ] **Step 5: Add migration safety and executable FK tests**

Refactor the existing additive statement helper so both `0002` and `0003` are checked segment-by-segment. `0003` may contain only `CREATE TABLE`, `CREATE INDEX`, or `CREATE UNIQUE INDEX`; it may add the new unique index on `career_goals`, but it may not contain `ALTER`, `DROP`, `INSERT`, `REPLACE`, `UPDATE`, or `DELETE`.

In `tests/db/planning-migration.test.ts`, apply `0000`, `0001`, `0002`, then `0003` to an in-memory SQLite-compatible test database with foreign keys enabled. Assert:

- all seven tables exist;
- a valid same-owner graph inserts;
- cross-user `(user_id, goal_id)` and cross-goal version references fail;
- duplicate workspace, sequence, mutation, plan slot, and unit IDs fail;
- deleting a goal cascades all Phase 2 rows;
- `PRAGMA foreign_key_check` is empty;
- every pre-existing table keeps the same columns, foreign keys, and existing indexes; the only permitted old-table metadata delta is the explicitly approved additive `career_goals_user_id_idx` unique index.

- [ ] **Step 6: Run schema/migration gates**

Run: `npx vitest run tests/db/schema.test.ts tests/db/migration-safety.test.ts tests/db/planning-migration.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit `0`.

Run: `git diff --check`

Expected: exit `0`.

- [ ] **Step 7: Commit the exact generated scope**

```powershell
git add db/schema.ts drizzle/0003_adaptive_planning.sql drizzle/meta/0003_snapshot.json drizzle/meta/_journal.json tests/db/schema.test.ts tests/db/migration-safety.test.ts tests/db/planning-migration.test.ts
git commit -m "feat: add adaptive planning persistence"
```

Do not execute `0003` against hosted or production D1.

---

### Task 9: Owner-scoped planning repository and validated service

**Files:**
- Create: `app/server/planning/repository.ts`
- Create: `app/server/planning/d1-planning-repository.ts`
- Create: `app/server/planning/service.ts`
- Create: `tests/server/planning-service.test.ts`
- Create: `tests/server/d1-planning-repository.test.ts`

- [ ] **Step 1: Define repository commands and write service RED tests**

The repository returns `unknown` payloads plus explicit `ownerId`/`goalId`; the service must never trust repository typing. Define commands for load, generate, append event, and decide replan, each carrying `mutationId` and `baseVersionId` where required.

Test that the service:

- rejects empty authenticated user IDs;
- resolves the active goal only through the repository;
- requests only `ai-native-full-stack-engineer` from `IntelligenceService`;
- re-parses Blueprint, Registry, commands, and repository output;
- rejects owner/goal mismatches without including private IDs in `Error.message`;
- returns the same public result for an idempotent replay;
- reports stale bases as a typed conflict;
- never writes a candidate before schema, graph, schedule, history, and diff validation pass;
- never invokes OpenRouter, R2, legacy completion, or `proof_items`.

- [ ] **Step 2: Run service tests to verify RED**

Run: `npx vitest run tests/server/planning-service.test.ts`

Expected: FAIL because the planning repository/service modules do not exist.

- [ ] **Step 3: Implement the validated service boundary**

Export:

```ts
export class PlanningConflictError extends Error {
  readonly code = "CONFLICT";
}

export class PlanningUnavailableError extends Error {
  readonly code = "PLANNING_UNAVAILABLE";
}

export class PlanningService {
  constructor(private readonly dependencies: {
    repository: PlanningRepository;
    intelligence: Pick<IntelligenceService, "getPublished">;
    registry: unknown;
  }) {}

  getWorkspace(userId: string): Promise<PlanningWorkspace | null>;
  generate(userId: string, input: unknown): Promise<PlanningMutationResult>;
  appendEvent(userId: string, input: unknown): Promise<PlanningMutationResult>;
  acceptReplan(userId: string, input: unknown): Promise<PlanningMutationResult>;
  discardReplan(userId: string, input: unknown): Promise<PlanningMutationResult>;
}
```

Convert internal contract/registry/kernel errors into sorted, stable public codes. Preserve detailed issues only on the typed server error object; keep `message` free of evidence notes, URLs, user IDs, goal IDs, SQL, and payload JSON.

- [ ] **Step 4: Write D1 repository RED tests**

Use the existing `FakeD1` prepared-call pattern, extended to expose batch metadata. Prove every SELECT/UPDATE/INSERT binds authenticated `userId` and active `goalId`, payload JSON is parsed on reads, immutable versions are inserted before pointer updates, all related writes use one `db.batch`, repeated mutations short-circuit, and stale/racing writes fail closed.

The concurrency fixture must simulate two calls reading the same revision/sequence: one batch wins; the second hits the unique `(workspace_id, sequence)` boundary, reloads the winner, and returns conflict unless its mutation ID now resolves to the winning result.

- [ ] **Step 5: Implement the D1 repository**

Use prepared statements only. Read the active goal with `WHERE user_id = ? AND active_slot = 1`. On load, fetch the workspace and only rows matching both `user_id` and `goal_id`, parse all JSON through `planningWorkspaceSchema`, and return `{ ownerId, goalId, workspace }`.

For every mutation:

1. query `(user_id, mutation_id)` for replay;
2. load and validate the current revision/sequence;
3. compute the next immutable domain result in the service;
4. insert new version/daily-unit rows first;
5. insert the event at `next_sequence`;
6. update workspace pointers with `WHERE revision = baseRevision`;
7. insert an idempotency result record in the same D1 batch;
8. on a unique race, re-read the mutation result; otherwise throw `PlanningConflictError`.

Never update version, Daily Unit, or event rows. Only `planning_workspaces` pointers/revision/sequence may update. Do not write `learning_events` or `proof_items`.

When generation activates a new Availability version, update `career_goals.weekly_minutes` to its derived seven-day sum in the same batch. For `availability_changed`, keep the legacy total unchanged while the plan is only proposed; update it only in the batch that accepts the candidate and advances the current Availability pointer.

- [ ] **Step 6: Run service/repository tests**

Run: `npx vitest run tests/server/planning-service.test.ts tests/server/d1-planning-repository.test.ts tests/server/d1-cloud-repository.test.ts`

Expected: PASS, including owner isolation, idempotency, and revision races.

Run: `npx tsc --noEmit`

Expected: exit `0`.

- [ ] **Step 7: Commit**

```powershell
git add app/server/planning/repository.ts app/server/planning/d1-planning-repository.ts app/server/planning/service.ts tests/server/planning-service.test.ts tests/server/d1-planning-repository.test.ts
git commit -m "feat: validate adaptive planning writes"
```

---

### Task 10: Authenticated planning APIs and strict browser client

**Files:**
- Modify: `app/contracts/planning-api.ts`
- Create: `app/server/http/planning-route-factories.ts`
- Create: `app/api/planning/workspace/route.ts`
- Create: `app/api/planning/generate/route.ts`
- Create: `app/api/planning/events/route.ts`
- Create: `app/api/planning/replans/accept/route.ts`
- Create: `app/api/planning/replans/discard/route.ts`
- Create: `app/lib/planning-client.ts`
- Create: `tests/api/planning.test.ts`
- Create: `tests/api/planning-production.test.ts`
- Create: `tests/lib/planning-client.test.ts`
- Modify: `app/server/http/api-response.ts`
- Modify: `app/lib/cloud-client.ts`
- Modify: `tests/lib/cloud-client.test.ts`
- Modify: `tests/server/observability.test.ts`

- [ ] **Step 1: Write failing API contract and handler tests**

Requests must use these shapes:

```ts
type GeneratePlanningRequest = {
  mutationId: string;
  roleId: "ai-native-full-stack-engineer";
  planningDate: string;
  audit: SkillAuditVersion;
  availability: AvailabilityVersion;
  target: PlanningTarget;
  selectedScope: "full-scope" | "target-date" | null;
};

type PlanningEventRequest = {
  mutationId: string;
  baseVersionId: string;
  event: PlanningEventInput;
};

type ReplanDecisionRequest = {
  mutationId: string;
  baseVersionId: string;
  candidatePlanVersionId: string;
};
```

Test exact `200`, `400`, `401`, `404`, `409`, `429`, and `503` bodies, `Cache-Control: no-store`, `X-Request-Id`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy`. Invalid JSON, unknown fields, owner mismatch, stale base, and injected repository errors must not leak request content or private service messages.

- [ ] **Step 2: Run API tests to verify RED**

Run: `npx vitest run tests/api/planning.test.ts tests/api/planning-production.test.ts`

Expected: FAIL because planning API contracts/routes do not exist.

- [ ] **Step 3: Add the planning code and safe recovery action to shared errors**

Extend `ApiErrorCode` with `PLANNING_UNAVAILABLE` and add an optional `action` to the shared error body:

```ts
export type ApiRecoveryAction = "refresh" | "retry" | "sign-in" | "rebuild";
export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    action?: ApiRecoveryAction;
  };
};
```

Keep the existing fifth `headers` argument to `apiError` compatible and add `action` as a sixth optional argument. Update `ArcApiError` and the strict client error schema to retain an optional action without changing existing call sites. Planning uses `refresh` for `409`, `sign-in` for `401`, `retry` for `429/503`, and `rebuild` for a version/schema mismatch. All planning responses pass through `applyResponseSafety` after `apiJson`/`apiError`.

- [ ] **Step 4: Implement route factories**

Follow `cloud-route-factories.ts`, but keep a separate planning dependency type:

```ts
export type PlanningRouteDependencies = {
  requireUser(headers: Headers): Promise<ArcUser>;
  createService(): Pick<PlanningService,
    "getWorkspace" | "generate" | "appendEvent" | "acceptReplan" | "discardReplan">;
  rateLimiter: RateLimiter;
  recordEvent(event: OperationalEvent): Promise<void>;
  createRequestId?: () => string;
  now?: () => number;
};
```

Resolve the request ID inside the outermost `try`, parse JSON once through the matching strict schema, and map:

```text
Zod/PlanningInputError -> 400 INVALID_INPUT
UnauthenticatedError -> 401 UNAUTHENTICATED
owner/not-found -> 404 NOT_FOUND
PlanningConflictError -> 409 CONFLICT with action "refresh"
rate limit -> 429 RATE_LIMITED
PlanningUnavailableError -> 503 PLANNING_UNAVAILABLE
unknown -> 500 INTERNAL
```

Operational events may contain only route, result code, latency, safe user surrogate, and counters (`writes`, `events`, `plans`, `daily_units`); never log evidence URLs/notes, audit answers, unit copy, or full payloads.

- [ ] **Step 5: Wire production routes**

Each route exports `dynamic = "force-dynamic"` and delegates to a production factory using `requireArcUser`, `getD1`, `D1RateLimiter`, `D1OperationalEventSink`, `D1PlanningRepository`, `IntelligenceService(new BuiltinIntelligenceRepository())`, and `flagshipUnitRegistry`. No route imports OpenRouter or `fetch`.

- [ ] **Step 6: Write client RED tests and implement the strict client**

The client parses every success/error response, always uses `credentials: "include"`, `cache: "no-store"`, and JSON content type for writes. Export:

```ts
export interface PlanningClient {
  loadWorkspace(): Promise<PlanningWorkspace | null>;
  generate(input: GeneratePlanningRequest): Promise<PlanningMutationResult>;
  appendEvent(input: PlanningEventRequest): Promise<PlanningMutationResult>;
  acceptReplan(input: ReplanDecisionRequest): Promise<PlanningMutationResult>;
  discardReplan(input: ReplanDecisionRequest): Promise<PlanningMutationResult>;
}
```

Reuse `ArcApiError` for safe server errors; do not accept success payloads with unknown fields.

- [ ] **Step 7: Run API/client/security tests**

Run: `npx vitest run tests/api/planning.test.ts tests/api/planning-production.test.ts tests/lib/planning-client.test.ts tests/lib/cloud-client.test.ts tests/server/observability.test.ts tests/server/rate-limit.test.ts`

Expected: PASS with zero real network calls.

Run: `npx tsc --noEmit`

Expected: exit `0`.

- [ ] **Step 8: Commit**

```powershell
git add app/contracts/planning-api.ts app/server/http/planning-route-factories.ts app/api/planning app/lib/planning-client.ts app/server/http/api-response.ts app/lib/cloud-client.ts tests/api/planning.test.ts tests/api/planning-production.test.ts tests/lib/planning-client.test.ts tests/lib/cloud-client.test.ts tests/server/observability.test.ts
git commit -m "feat: expose adaptive planning APIs"
```

---

### Task 11: Guest/cloud planning controller and resumable device import

**Files:**
- Create: `app/lib/use-planning-workspace.ts`
- Create: `tests/lib/use-planning-workspace.test.tsx`
- Modify: `app/lib/planning/local-repository.ts`
- Modify: `tests/lib/planning/local-repository.test.ts`
- Modify: `app/components/sync/migration-banner.tsx`
- Modify: `tests/components/migration-banner.test.tsx`

- [ ] **Step 1: Write failing controller tests**

Test these explicit states:

```ts
export type PlanningStateSource = "restoring" | "local" | "cloud" | "offline-cloud";
export type PlanningMigrationState = "none" | "available" | "importing" | "imported" | "failed";
export type PlanningRecoveryState = "none" | "session-expired" | "conflict" | "unavailable";
```

Required behaviors:

- guest loads and mutates only `LocalPlanningRepository`;
- signed-in learner loads only the authenticated planning API snapshot;
- a meaningful guest workspace plus absent cloud workspace exposes migration as `available`, never imports automatically;
- explicit import generates the cloud initial workspace then replays local learning/decision events in ascending `sequence` with original mutation IDs;
- import retries are idempotent and resume after a partial network failure;
- cloud conflict leaves the guest bytes and visible active plan unchanged;
- signed-in cloud loss keeps the last cloud snapshot visible but rejects new writes—do not fork an offline event sequence;
- session expiry exposes recovery without deleting guest or cloud state;
- custom-role/v7 callers never instantiate the adaptive controller.

- [ ] **Step 2: Run controller tests to verify RED**

Run: `npx vitest run tests/lib/use-planning-workspace.test.tsx`

Expected: FAIL because `usePlanningWorkspace` does not exist.

- [ ] **Step 3: Add resumable import metadata to the local envelope**

Persist only safe progress:

```ts
type PlanningImportProgress = {
  userId: string;
  initialMutationId: string;
  lastImportedSequence: number;
  completed: boolean;
};
```

Scope progress by user ID plus local workspace fingerprint. Never mark `completed` until a final cloud reload strictly parses and its replayed active/pending pointers and event fingerprint equal the local workspace. A different signed-in user starts a separate import progress record and cannot reuse another user's completion marker.

- [ ] **Step 4: Implement the controller**

Export:

```ts
export type PlanningWorkspaceController = {
  workspace: PlanningWorkspace | null;
  source: PlanningStateSource;
  migration: PlanningMigrationState;
  recovery: PlanningRecoveryState;
  generate(input: GeneratePlanningRequest): Promise<boolean>;
  record(input: PlanningEventInput): Promise<boolean>;
  accept(candidatePlanVersionId: string): Promise<boolean>;
  discard(candidatePlanVersionId: string): Promise<boolean>;
  importLocal(): Promise<boolean>;
  dismissMigration(): void;
  retry(): Promise<void>;
};
```

Inject `useSession`, client, local repository, ID factory, and clock for tests. For a cloud write, derive `baseVersionId` from the visible workspace immediately before the call and reject a second click while one mutation is in flight. For guest writes, use the same request contracts and pure transition functions through the local repository. Publish a new visible workspace only after strict parsing.

- [ ] **Step 5: Extend the existing migration banner without conflating formats**

Add a `kind: "v7-state" | "adaptive-plan"` prop and truthful adaptive copy: “A complete adaptive plan exists on this device. Importing replays its versioned learning history into this Arc account.” Keep the existing v7 conflict-resolution controls untouched. The adaptive banner has only `Import` and `Not now`; any cloud conflict is shown as a safe refresh/retry message.

- [ ] **Step 6: Run controller and existing state tests**

Run: `npx vitest run tests/lib/use-planning-workspace.test.tsx tests/lib/planning/local-repository.test.ts tests/lib/use-arc-state.test.tsx tests/components/migration-banner.test.tsx`

Expected: PASS; old v7 queue and migration behavior remain GREEN.

- [ ] **Step 7: Commit**

```powershell
git add app/lib/use-planning-workspace.ts app/lib/planning/local-repository.ts app/components/sync/migration-banner.tsx tests/lib/use-planning-workspace.test.tsx tests/lib/planning/local-repository.test.ts tests/components/migration-banner.test.tsx
git commit -m "feat: coordinate local and cloud plans"
```

---

### Task 12: Five-stage Flagship Setup with audit, availability, and target choice

**Files:**
- Create: `app/components/setup/skill-audit-step.tsx`
- Create: `app/components/setup/availability-step.tsx`
- Create: `app/components/setup/target-step.tsx`
- Create: `app/components/setup/adaptive-setup-flow.tsx`
- Create: `tests/components/skill-audit-step.test.tsx`
- Create: `tests/components/availability-step.test.tsx`
- Create: `tests/components/target-step.test.tsx`
- Create: `tests/components/adaptive-setup-flow.test.tsx`
- Modify: `app/components/setup/setup-flow.tsx`
- Modify: `app/setup/page.tsx`
- Modify: `tests/components/setup-flow.test.tsx`
- Modify: `tests/pages/setup.test.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write failing audit-step tests**

Render all 16 skills grouped in the eight blueprint categories. Assert one clear four-state radiogroup per skill, category quick-set with per-skill override, `aria-describedby` for self-assessment disclosure, keyboard selection, optional evidence editor, maximum three evidence rows, public HTTPS validation, 300-character note cap, and no `Verified`/`Demonstrated` copy.

```ts
expect(screen.getAllByRole("radiogroup")).toHaveLength(16);
await user.click(screen.getByRole("button", { name: "Set Foundations to Guided" }));
expect(screen.getByRole("radio", { name: "Guided", checked: true })).toBeInTheDocument();
expect(screen.getByText(/Self-assessment, not Arc verification/i)).toBeInTheDocument();
```

- [ ] **Step 2: Write failing availability-step tests**

Assert seven labeled minute inputs, `0` → visible Rest, integer/boundary validation, derived weekly total, injected browser time-zone default, IANA error, add/remove exceptions, duplicate/date-horizon rejection, exception override preview, and error association.

- [ ] **Step 3: Write failing target/build tests**

Use a tiny deterministic path builder fixture to show:

- `4..52` target-week validation;
- no alternative chooser when full scope fits;
- both full-scope and target-date choices when deferral can meet the date;
- target-date disabled with an honest explanation when core prerequisites cannot fit;
- choosing an option does not persist anything until `Build`;
- build progress corresponds to actual local validation/path/schedule/save promises, with no timer-driven fake stage;
- double-submit is blocked and a save failure keeps the completed answers editable.

- [ ] **Step 4: Run component tests to verify RED**

Run: `npx vitest run tests/components/skill-audit-step.test.tsx tests/components/availability-step.test.tsx tests/components/target-step.test.tsx tests/components/adaptive-setup-flow.test.tsx`

Expected: FAIL because the adaptive components do not exist.

- [ ] **Step 5: Implement the focused steps**

`SkillAuditStep` receives the parsed Blueprint and a controlled draft. Use semantic `fieldset`/`legend`, real radio inputs or equivalent buttons with `role="radio"`, and category actions that update only that category. Evidence remains collapsed behind a secondary “Add evidence link” control and parses with `skillEvidenceSchema` before advancing.

`AvailabilityStep` is controlled by `AvailabilityVersion` draft fields. The weekly total is always:

```ts
const weeklyMinutes = Object.values(weekdays)
  .reduce((sum, minutes) => sum + minutes, 0);
```

Never expose a separate editable total.

`TargetStep` calls `buildLearningPaths` in memory with the explicit `planningDate`. Render each option as a semantic radio with scope, Later skills, expected completion date, and the reason the option is or is not feasible.

- [ ] **Step 6: Build the five-stage adaptive flow**

Use exact stages and progress text:

```ts
type AdaptiveSetupStage = "role" | "audit" | "availability" | "target" | "build";
const stages: AdaptiveSetupStage[] = [
  "role", "audit", "availability", "target", "build",
];
```

On stage change, move focus to the new `<h1 tabIndex={-1}>`. Preserve answers when navigating back. The Build stage emits a strict `GeneratePlanningRequest` and calls `usePlanningWorkspace.generate`; on success route to `/path`.

- [ ] **Step 7: Preserve custom-role v7 Setup**

Refactor the existing four-question component into a legacy branch inside `SetupFlow`. The initial Role stage remains common. Selecting a nonempty custom role shows this exact disclosure before continuing:

> Full skill audit and adaptive scheduling currently require Arc's reviewed AI-Native Full-Stack Engineer blueprint. This custom role will keep the proportional v7 path.

Then render the existing level, weekly total, target weeks, and `saveSetup` flow without creating a Phase 2 workspace. Existing public props may receive additive callbacks, but the v7 `onComplete(SetupAnswers)` contract and tests remain supported.

- [ ] **Step 8: Add restrained responsive styles**

Extend `app/globals.css` using existing tokens. Use grouped editorial rows, thin separators, strong text hierarchy, four explicit state choices, 44px touch targets, visible `:focus-visible`, WCAG 2.2 AA text/control contrast, and one-column mobile stacking. Do not add glass panels, gradients, generic card grids, or decorative motion. Add `prefers-reduced-motion` coverage for any stage transition.

- [ ] **Step 9: Run Setup and accessibility tests**

Run: `npx vitest run tests/components/skill-audit-step.test.tsx tests/components/availability-step.test.tsx tests/components/target-step.test.tsx tests/components/adaptive-setup-flow.test.tsx tests/components/setup-flow.test.tsx tests/pages/setup.test.tsx tests/components/accessibility-contracts.test.tsx`

Expected: PASS for both Flagship adaptive and custom-role legacy paths.

Run: `npx tsc --noEmit`

Expected: exit `0`.

- [ ] **Step 10: Commit**

```powershell
git add app/components/setup app/setup/page.tsx app/globals.css tests/components/skill-audit-step.test.tsx tests/components/availability-step.test.tsx tests/components/target-step.test.tsx tests/components/adaptive-setup-flow.test.tsx tests/components/setup-flow.test.tsx tests/pages/setup.test.tsx
git commit -m "feat: add adaptive planning setup"
```

---

### Task 13: Adaptive Path, Today, seven-day timeline, and replan review

**Files:**
- Create: `app/components/workspace/adaptive-path.tsx`
- Create: `app/components/workspace/seven-day-timeline.tsx`
- Create: `app/components/workspace/plan-diff-review.tsx`
- Create: `app/components/today/adaptive-today-session.tsx`
- Create: `tests/components/adaptive-path.test.tsx`
- Create: `tests/components/seven-day-timeline.test.tsx`
- Create: `tests/components/plan-diff-review.test.tsx`
- Create: `tests/components/adaptive-today-session.test.tsx`
- Modify: `app/path/page.tsx`
- Modify: `app/today/page.tsx`
- Modify: `app/components/workspace/workspace-shell.tsx`
- Modify: `tests/pages/path.test.tsx`
- Modify: `tests/pages/today.test.tsx`
- Modify: `tests/pages/workspace-state.test.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write failing adaptive Path tests**

Assert the full ordered scope, current phase, prerequisite rationale, calibration labels, expected date range, and semantic Later section. Core/prerequisite skills can never appear in Later. Self-assessment copy is visually/textually distinct from Phase 1 claim confidence and never says verified.

- [ ] **Step 2: Write failing Today/timeline tests**

Assert exactly one required primary outcome with objective, `whyNow`, primary/alternative source links, timed steps, build task, completion criteria, Proof requirement, rubric, and estimated minutes. At most one optional stretch appears. The timeline has exactly seven consecutive dates, retains Rest/exception dates, and uses one ordered timeline—not seven generic cards.

Test contextual actions: Complete, Delay, Skip, Too hard, Already know this. Complete immediately rolls and keeps the learner on Today; the other four show a candidate diff before active content changes.

- [ ] **Step 3: Write failing diff-review tests**

Render counts and full lists for added/moved/removed/unchanged, old/new dates, reasons, and completion-date change. Require explicit Accept and Keep current plan buttons, focus the review heading when it opens, block double decisions, announce success/errors with `role="status"`/`role="alert"`, and keep all details readable before acceptance.

- [ ] **Step 4: Run UI tests to verify RED**

Run: `npx vitest run tests/components/adaptive-path.test.tsx tests/components/seven-day-timeline.test.tsx tests/components/plan-diff-review.test.tsx tests/components/adaptive-today-session.test.tsx`

Expected: FAIL because adaptive workspace components do not exist.

- [ ] **Step 5: Implement adaptive Path**

Render parsed workspace data only. Resolve template/resource copy from the exact Registry/Blueprint version recorded by the path; if the built-in versions do not match, render a safe “Plan version unavailable” boundary instead of mixing versions. Phase 2 does not define a history-preserving catalogue-rebuild mutation, so the boundary must say that Arc kept the saved plan unchanged and that a compatible rebuild is not available in this build; it must not expose a Setup link that the existing-workspace conflict would reject. The API `rebuild` action is a typed version-mismatch classification used to select this fail-closed boundary, not permission to overwrite history. Use semantic ordered lists and details text, not a dependency canvas.

- [ ] **Step 6: Implement Today and seven-day timeline**

`AdaptiveTodaySession` is controlled by the active `PlanVersion` and `DailyUnit` map. Local checkbox progress is ephemeral; completing the unit appends one `completed` event only after all required steps are checked. Do not create a `ProofItem`, set `verified`, call `completeDemoUnit`, or redirect to `/proof`.

Resource anchors must use exact Blueprint URLs, `target="_blank"`, `rel="noreferrer"`, and the resource language attribute. A missing resource/version mismatch renders truthful fallback text without a fabricated URL.

- [ ] **Step 7: Implement candidate diff and decisions**

After a proposed transition, keep active Today/Path in place and render `PlanDiffReview` from `pendingPlanVersionId`. Accept calls `controller.accept(candidateId)` with the latest visible base. Discard calls `controller.discard(candidateId)`. On `409`, show “This plan changed on another device. Refresh before deciding.” and never retry automatically.

- [ ] **Step 8: Branch existing pages by authoritative adaptive state**

`PathPage` and `TodayPage` continue to load `useArcState` for auth/migration/custom-role compatibility and load `usePlanningWorkspace` only for the Flagship role. Render adaptive components only when a strict Phase 2 workspace exists. Otherwise render the current v7 `PhaseRail`/`TodaySession` unchanged.

Update `WorkspaceShell` to accept optional planning migration/recovery state and display the adaptive device-import banner without replacing the existing v7 migration banner. Keep the navigation labels and `/stack`/`/proof` routes intact.

- [ ] **Step 9: Add Editorial Precision styles and reduced motion**

Path uses a wide vertical editorial rail with a restrained Later section. Today remains dominant at the top; the seven-day timeline is a continuous ruled list. Diff transitions may use short opacity/position changes only, and the reduced-motion media query removes transforms/transitions. On mobile, keep current Today-first navigation and stack metadata below content; on desktop, allow Path/diff wider measure.

- [ ] **Step 10: Run workspace and regression tests**

Run: `npx vitest run tests/components/adaptive-path.test.tsx tests/components/seven-day-timeline.test.tsx tests/components/plan-diff-review.test.tsx tests/components/adaptive-today-session.test.tsx tests/pages/path.test.tsx tests/pages/today.test.tsx tests/pages/workspace-state.test.tsx tests/components/stack-browser.test.tsx tests/components/proof-profile.test.tsx`

Expected: PASS for adaptive Flagship and unchanged v7/custom-role/Stack/Proof paths.

Run: `npx tsc --noEmit`

Expected: exit `0`.

- [ ] **Step 11: Commit**

```powershell
git add app/components/workspace app/components/today/adaptive-today-session.tsx app/path/page.tsx app/today/page.tsx app/globals.css tests/components/adaptive-path.test.tsx tests/components/seven-day-timeline.test.tsx tests/components/plan-diff-review.test.tsx tests/components/adaptive-today-session.test.tsx tests/pages/path.test.tsx tests/pages/today.test.tsx tests/pages/workspace-state.test.tsx
git commit -m "feat: present adaptive learning workspace"
```

---

### Task 14: Cross-adapter parity, migration rollback, and complete regression evidence

**Files:**
- Create: `tests/lib/planning/parity.test.ts`
- Create: `tests/lib/planning/v7-upgrade.test.ts`
- Create: `tests/server/planning-security.test.ts`
- Modify: `tests/rendered-html.test.mjs`
- Modify: `tests/components/accessibility-contracts.test.tsx`
- Modify only if a regression proves necessary: existing v7/auth/account-link/proof tests or compatibility adapters

- [ ] **Step 1: Add guest/cloud parity tests**

Run the same generated Flagship input and ordered event stream through `LocalPlanningRepository` and `PlanningService` backed by an in-memory/fake repository. Normalize storage metadata only; assert equal audit/path/plan/Daily Unit/event fingerprints, active/pending pointers, completion set, diff, and final replay state.

The event sequence must include:

```text
completed -> delayed -> replan_discarded -> too_hard -> replan_accepted
-> already_known -> replan_accepted -> availability_changed -> replan_accepted
```

Also assert a repeated mutation returns the first result and an old base returns conflict in both adapters.

- [ ] **Step 2: Add v7 upgrade and fallback tests**

Cover guest and cloud v7 states for default, custom role, meaningful completion, and Proof items. A successful upgrade preserves original v7 bytes/rows and builds only a setup draft until the learner confirms per-skill audit/availability. Malformed/new-envelope write failure keeps v7 Today/Path/Proof readable. No upgrade path turns legacy `level` into skill answers or writes `verified=true`.

- [ ] **Step 3: Add security and resource-limit tests**

Exercise maximum-size valid inputs and just-over-limit rejection for audits, evidence, exceptions, Daily Units, events, plans, and workspaces. Verify owner mismatch, cross-goal references, evidence URLs with credentials/private hosts, payload redaction, and service failure messages. Search production planning paths for disallowed dependencies:

```powershell
rg -n "OpenRouter|MockAiProvider|OPENROUTER_API_KEY|fetch\(|PROOF_ASSETS|proof_items|verified\s*=\s*(?:1|true)" app/contracts/planning.ts app/data/flagship-unit-registry.ts app/lib/planning app/server/planning app/server/http/planning-route-factories.ts app/api/planning
```

Expected: no model/provider/R2/legacy-proof write matches. The only `fetch(` match may be the intentional browser API client in `app/lib/planning-client.ts`, which is outside the searched server/domain paths.

- [ ] **Step 4: Extend rendered HTML and accessibility gates**

Build fixtures must prove the public shell still renders without client-only crashes and that the adaptive UI includes semantic headings, labels, status text, focus styles, and reduced-motion CSS. Do not assert visual polish through brittle class snapshots; assert user-visible hierarchy and safety attributes.

- [ ] **Step 5: Run the focused Phase 2 gate**

Run all newly added planning tests in one fresh command:

```powershell
npx vitest run tests/contracts/planning.test.ts tests/data/flagship-unit-registry.test.ts tests/lib/planning tests/server/planning-service.test.ts tests/server/d1-planning-repository.test.ts tests/server/planning-security.test.ts tests/api/planning.test.ts tests/api/planning-production.test.ts tests/components/skill-audit-step.test.tsx tests/components/availability-step.test.tsx tests/components/target-step.test.tsx tests/components/adaptive-setup-flow.test.tsx tests/components/adaptive-path.test.tsx tests/components/seven-day-timeline.test.tsx tests/components/plan-diff-review.test.tsx tests/components/adaptive-today-session.test.tsx
```

Expected: PASS with no unhandled rejection or leaked timer.

- [ ] **Step 6: Run all legacy high-risk regression suites**

Run:

```powershell
npx vitest run tests/api/account-link.test.ts tests/api/account-link-production.test.ts tests/api/auth-link-bypass.test.ts tests/api/auth-providers.test.ts tests/api/workspace.test.ts tests/api/learning-events.test.ts tests/api/local-migration.test.ts tests/api/proof-assets.test.ts tests/api/proof-sharing.test.ts tests/server/account-link-service.test.ts tests/server/auth-runtime.test.ts tests/server/cloud-service.test.ts tests/server/d1-cloud-repository.test.ts tests/server/d1-proof-repository.test.ts tests/lib/use-arc-state.test.tsx tests/lib/demo-store.test.ts tests/lib/offline-queue.test.ts tests/components/account-link-panel.test.tsx tests/components/migration-banner.test.tsx tests/components/proof-profile.test.tsx tests/pages/path.test.tsx tests/pages/today.test.tsx tests/pages/workspace-state.test.tsx
```

Expected: PASS; no v7 schema, OAuth, owner isolation, device migration, offline queue, Proof privacy, custom role, or proportional path regression.

- [ ] **Step 7: Commit parity/regression coverage**

```powershell
git add tests/lib/planning/parity.test.ts tests/lib/planning/v7-upgrade.test.ts tests/server/planning-security.test.ts tests/rendered-html.test.mjs tests/components/accessibility-contracts.test.tsx
git commit -m "test: verify adaptive planning compatibility"
```

---

### Task 15: Final engineering gate, independent review, and truthful checkpoint

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-10-arc-v8-product-intelligence-roadmap.md`
- Modify: `docs/operations/v8-resume-checkpoint.md`
- Modify: this plan only to check completed steps and record exact fresh evidence

- [ ] **Step 1: Run the full fresh repository gate**

Run in order, without reusing earlier output:

```powershell
npm run test:unit
npx tsc --noEmit
npm run lint
npm run build
node --test tests/rendered-html.test.mjs
```

Expected: every command exits `0`; record the exact test file/test counts and build environment count in this plan. A Vite `spawn EPERM` caused only by the restricted Windows sandbox may be rerun with the already-approved scoped command; record both attempts and treat only the fresh permitted run as functional evidence.

- [ ] **Step 2: Audit build output for secrets and provider drift**

Resolve the actual output directory first (`dist` is expected; do not assume `.next`). Run a safe file-name pre-scan, then exact searches only if no secret values will be printed:

```powershell
rg --files-with-matches --hidden --no-ignore "OPENROUTER_API_KEY|OPENAI_API_KEY|sk-or-" dist
rg -n "MockAiProvider|OpenRouter|fetch\(" app/data/flagship-blueprint.ts app/data/flagship-unit-registry.ts app/lib/planning app/server/planning app/api/planning
```

Expected: no secret pattern and no model/provider/outbound fetch in Blueprint, Registry, domain, server, or route code. `app/lib/planning-client.ts` is intentionally excluded because it is the authenticated same-origin browser transport.

- [ ] **Step 3: Request independent specification review**

Use `superpowers:requesting-code-review`. The reviewer compares the implementation range against every section of the approved Phase 2 spec, checks exact file scope, runs focused tests, and returns a binary compliance verdict. Resolve all Critical/Important findings with new TDD commits before proceeding.

- [ ] **Step 4: Request independent quality/security review**

Review untrusted input caps, determinism, graph complexity, time-zone/calendar edges, immutable history, replay/idempotency, D1 owner/goal integrity, concurrency races, failure rollback, response/log redaction, client bundle/provider drift, accessibility, and v7 regressions. Resolve all Critical/Important findings and rerun the entire Step 1 gate fresh after the final fix.

- [ ] **Step 5: Update truthful documentation**

README and roadmap must say:

- Phase 2 engineering is implemented on the isolated local branch only;
- the adaptive flow is Flagship-only; custom roles still use the v7 proportional route;
- self-assessment/evidence metadata is not Arc verification;
- OpenRouter, R2, Proof state, production D1, flags, push, merge, and Sites deployment did not occur;
- `0002` and `0003` are generated local migration artifacts and remain unapplied in production;
- the public site is still Arc v7.2 / Sites version 9 until a separately approved release.

Update `docs/operations/v8-resume-checkpoint.md` with branch, HEAD, implementation range, exact fresh gate evidence, reviewer verdicts, unresolved nonblocking items, and the next authorized action: user acceptance and choice of merge/backup/release planning.

- [ ] **Step 6: Verify documentation and worktree scope**

Run:

```powershell
rg -n "Phase 2|v7.2|Sites version 9|0003|OpenRouter|not deployed|未部署|未迁移" README.md docs/superpowers/plans/2026-08-10-arc-v8-product-intelligence-roadmap.md docs/operations/v8-resume-checkpoint.md
git diff --check
git status --short
```

Expected: claims agree with actual Git/build/migration/deployment state; diff check exits `0`; only planned documentation is uncommitted.

- [ ] **Step 7: Commit the completion record**

```powershell
git add README.md docs/superpowers/plans/2026-08-10-arc-v8-product-intelligence-roadmap.md docs/superpowers/plans/2026-08-10-arc-v8-adaptive-planning.md docs/operations/v8-resume-checkpoint.md
git commit -m "docs: close v8 adaptive planning phase"
```

- [ ] **Step 8: Stop at the user acceptance gate**

Report the exact implementation range and fresh verification totals. Do **not** merge, push, create a PR, execute `0002`/`0003`, change a flag, deploy Sites, or begin Phase 3. Offer those as separate, explicitly authorized next actions only after the user accepts the Phase 2 result.

---

## Implementation checkpoints

1. **Contracts + curated data:** Tasks 1–3.
2. **Deterministic kernel:** Tasks 4–6.
3. **Persistence + service:** Tasks 7–10.
4. **Product experience:** Tasks 11–13.
5. **Engineering exit gate:** Tasks 14–15.

At each checkpoint, run `npx tsc --noEmit`, focused ESLint on changed files, `git diff --check`, and `git status --short`. Keep the worktree clean before starting the next checkpoint.

## Known non-goals to guard during implementation

- Do not research or generate arbitrary role blueprints.
- Do not treat evidence metadata as fetched, reviewed, demonstrated, or verified.
- Do not add file uploads, R2 objects, public Profile fields, social features, payments, or calendar integrations.
- Do not change existing OAuth/account-link behavior unless a regression test proves a narrow compatibility fix is required.
- Do not collapse append-only planning events into mutable task status rows.
- Do not write Phase 2 completion through legacy `completeDemoUnit`, `learning_events`, or `proof_items.verified`.
- Do not add production credentials or read `OPENROUTER_API_KEY`.
- Do not execute generated migrations or deploy from the implementation branch.
