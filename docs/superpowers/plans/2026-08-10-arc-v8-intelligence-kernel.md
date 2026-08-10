# Arc. v8 Trusted Intelligence Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a versioned, schema-valid and source-attributable Flagship role blueprint that remains fully usable without OpenRouter, then expose that trusted data through a guest-safe API and the existing Stack experience.

**Architecture:** Keep `app/domain/learning.ts` and `app/data/flagship-role.ts` as the v7 compatibility layer while introducing a stricter v8 intelligence contract. Build the Flagship blueprint deterministically from the reviewed v7 role data plus explicit resource metadata, validate graph and source invariants before serving it, reserve normalized D1 tables for later Research Beta publication, and make the Stack UI consume the same contract that the future OpenRouter pipeline must satisfy.

**Tech Stack:** TypeScript 5.9, Zod 4, React 19.2, Vinext/Next 16 compatibility routes, Drizzle ORM 0.45, Cloudflare D1, Vitest 4, Testing Library, ESLint.

---

## Plan boundary

This is Phase 1 of `docs/superpowers/plans/2026-08-10-arc-v8-product-intelligence-roadmap.md`.

This plan does:

- define the canonical v8 role, skill and learning-resource contract;
- convert the reviewed Flagship role into that contract without a network or model call;
- reject broken references, graph cycles, missing coverage and paid resources without free alternatives;
- add D1 persistence structures for versioned role intelligence;
- expose a public, read-only Flagship endpoint;
- upgrade Stack to show resource language, cost, format, source tier and freshness.

This plan does not:

- call OpenRouter or perform live web research;
- add arbitrary-role UI;
- generate a personalized roadmap or seven-day schedule;
- change Proof verification rules;
- migrate production D1 or deploy publicly.

## Locked file structure

| Path | Responsibility |
| --- | --- |
| `app/contracts/intelligence.ts` | Strict Zod schemas and inferred v8 intelligence types. |
| `app/data/flagship-blueprint.ts` | Deterministic, reviewed Flagship blueprint and resource registry. |
| `app/lib/intelligence-validation.ts` | Cross-entity reference, graph, coverage and free-alternative validation. |
| `app/server/intelligence/repository.ts` | Read-only published-blueprint repository boundary. |
| `app/server/intelligence/builtin-repository.ts` | No-network Flagship repository. |
| `app/server/intelligence/service.ts` | Validate before returning a published blueprint. |
| `app/api/intelligence/flagship/route.ts` | Guest-safe read-only Flagship API. |
| `app/components/stack/stack-browser.tsx` | Filter and present canonical skills and resource evidence. |
| `app/stack/page.tsx` | Use the canonical Flagship blueprint. |
| `app/globals.css` | Resource metadata and evidence hierarchy without card-grid clutter. |
| `db/schema.ts` | Versioned role, skill, edge, resource and skill-resource tables. |
| `drizzle/0002_product_intelligence.sql` | Generated additive D1 migration. |
| `drizzle/meta/0002_snapshot.json` | Generated schema snapshot. |
| `drizzle/meta/_journal.json` | Generated migration journal update. |
| `tests/contracts/intelligence.test.ts` | Strict contract and malformed-data tests. |
| `tests/data/flagship-blueprint.test.ts` | Flagship coverage and attribution tests. |
| `tests/lib/intelligence-validation.test.ts` | Graph and resource-policy tests. |
| `tests/server/intelligence-service.test.ts` | Repository/service validation tests. |
| `tests/api/intelligence-flagship.test.ts` | Guest-safe API and failure-mapping tests. |
| `tests/components/stack-browser.test.tsx` | Rich source evidence and filtering tests. |
| `tests/db/schema.test.ts` | New table and uniqueness-boundary tests. |
| `tests/db/migration-safety.test.ts` | Assert the Phase 1 migration is additive and contains all intelligence tables. |
| `README.md` | Accurate Phase 1 capability and no-live-model statement. |

## Phase 1 engineering gate record — 2026-08-10 (locally accepted and merged)

The verified implementation range is `2825ff4..fe26ff27f914eb19c8c15a3fe11ed5cabf12c24b`. The later documentation-only closure commit is intentionally outside that range; this record does not invent a self-referential commit hash.

Fresh post-fix and main-agent verification evidence:

- `npm run test:unit` — exit `0`; 67 test files and 616 tests passed.
- `npx tsc --noEmit` — exit `0`.
- `npm run lint` — exit `0`.
- `npm run build` — exit `0`; 5 of 5 build steps completed. The actual build directory is `dist`; `.next` is absent.
- `node --test tests/rendered-html.test.mjs` — exit `0`; 2 of 2 tests passed.
- `rg -n "OPENROUTER_API_KEY|OPENAI_API_KEY|sk-or-" dist` — exit `1`, meaning no matches.
- `rg -n "MockAiProvider|OpenRouter|fetch\(" app/data/flagship-blueprint.ts app/server/intelligence app/api/intelligence/flagship` — exit `1`, meaning no matches.
- `git status --short` — exit `0` with no output before this completion-record edit; the verified implementation worktree was clean.

Two independent reviewers completed the required full review. Review corrections were committed as `b71cc86` and `fe26ff2`; the final review result contains zero Critical, Important, or Minor findings and no unresolved findings.

The evidence covers strict contract parsing, deterministic builtin Flagship availability, symmetric graph/resource policy enforcement, an additive non-personal D1 schema, guest-safe API behavior, a truthful Stack evidence view, and green v7.2 authentication, migration, and workspace regressions. The six D1 intelligence tables and `0002_product_intelligence.sql` remain unapplied reservations for future version publication; the current read path remains `BuiltinIntelligenceRepository`. Research Beta remains disabled, Phase 1 neither requires nor reads `OPENROUTER_API_KEY`, and the deterministic Flagship path has no model provider or outbound `fetch`.

Task 8 Steps 1–9 are complete. The user selected local integration, and `master` fast-forwarded from `7861b8d` to completion commit `a3df268`; the merged result then passed 67 test files / 616 tests and `npx tsc --noEmit`. The feature branch and isolated worktree were removed only after the merge and verification. GitHub synchronization timed out, so the local `master` remains unpushed and is 24 commits ahead of the cached `origin/master`. Production D1 migration, feature-flag change, deployment, and Phase 2 have not occurred and still require explicit approval. This record does not claim that v8 is live.

### Task 1: Define strict role-intelligence contracts

**Files:**
- Create: `tests/contracts/intelligence.test.ts`
- Create: `app/contracts/intelligence.ts`

- [x] **Step 1: Write the failing contract tests**

Create `tests/contracts/intelligence.test.ts` with these assertions:

```ts
import { describe, expect, it } from "vitest";
import {
  learningResourceSchema,
  roleBlueprintSchema,
} from "../../app/contracts/intelligence";

const resource = {
  id: "typescript-official",
  title: "TypeScript documentation",
  url: "https://www.typescriptlang.org/docs/",
  provider: "typescriptlang.org",
  language: "en",
  cost: "free",
  format: "documentation",
  sourceTier: "primary",
  purpose: "primary",
  estimatedMinutes: null,
  lastVerifiedAt: "2026-07-26",
  skillIds: ["typescript"],
};

describe("role intelligence contracts", () => {
  it("accepts a fully attributed learning resource", () => {
    expect(learningResourceSchema.parse(resource)).toEqual(resource);
  });

  it("rejects unknown fields and non-HTTPS sources", () => {
    expect(() => learningResourceSchema.parse({
      ...resource,
      url: "http://example.com/docs",
      secret: "must-not-pass",
    })).toThrow();
  });

  it("requires skills, resources, phases and an explicit version", () => {
    expect(() => roleBlueprintSchema.parse({
      id: "empty-role",
      name: "Empty role",
      summary: "Not publishable",
      version: "2026.08.1",
      status: "ready",
      updatedAt: "2026-08-10",
      languagePolicy: "english-first",
      skills: [],
      resources: [],
      phases: [],
    })).toThrow();
  });
});
```

- [x] **Step 2: Run the focused test and prove it fails**

Run:

```powershell
npx vitest run tests/contracts/intelligence.test.ts
```

Expected: FAIL because `app/contracts/intelligence.ts` does not exist.

- [x] **Step 3: Implement the strict schemas**

Create `app/contracts/intelligence.ts`. Use `.strict()` on every object and export the inferred types. The implementation must define these exact enums and fields:

```ts
import { z } from "zod";

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const httpsUrlSchema = z.string().url().refine((url) => url.startsWith("https://"));

export const skillCategorySchema = z.enum([
  "foundations", "frontend", "backend", "data",
  "quality", "cloud", "ai", "product",
]);
export const skillImportanceSchema = z.enum(["core", "strong", "advantage"]);
export const resourceCostSchema = z.enum(["free", "paid", "mixed"]);
export const resourceFormatSchema = z.enum([
  "documentation", "course", "guide", "reference", "practice",
]);
export const sourceTierSchema = z.enum([
  "primary", "institutional", "practitioner", "community",
]);
export const resourcePurposeSchema = z.enum(["primary", "alternative", "reference"]);

export const learningResourceSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(3).max(180),
  url: httpsUrlSchema,
  provider: z.string().trim().min(2).max(120),
  language: z.enum(["en", "zh-CN"]),
  cost: resourceCostSchema,
  format: resourceFormatSchema,
  sourceTier: sourceTierSchema,
  purpose: resourcePurposeSchema,
  estimatedMinutes: z.number().int().positive().nullable(),
  lastVerifiedAt: dateSchema,
  skillIds: z.array(idSchema).min(1),
}).strict();

export const roleSkillSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(2).max(120),
  category: skillCategorySchema,
  importance: skillImportanceSchema,
  why: z.string().trim().min(12).max(360),
  confidence: z.number().min(0.75).max(1),
  masteryCriteria: z.array(z.string().trim().min(12).max(240)).min(2),
  prerequisiteIds: z.array(idSchema),
  resourceIds: z.array(idSchema).min(1),
}).strict();

export const rolePhaseSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(2).max(120),
  weeks: z.number().int().positive(),
  outcome: z.string().trim().min(12).max(360),
  skillIds: z.array(idSchema).min(1),
}).strict();

export const roleBlueprintSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(2).max(120),
  summary: z.string().trim().min(20).max(500),
  version: z.string().regex(/^\d{4}\.\d{2}\.\d+$/u),
  status: z.enum(["ready", "needs-review", "draft"]),
  updatedAt: dateSchema,
  languagePolicy: z.literal("english-first"),
  skills: z.array(roleSkillSchema).min(1),
  resources: z.array(learningResourceSchema).min(1),
  phases: z.array(rolePhaseSchema).min(1),
}).strict();

export type LearningResource = z.infer<typeof learningResourceSchema>;
export type RoleSkill = z.infer<typeof roleSkillSchema>;
export type RolePhase = z.infer<typeof rolePhaseSchema>;
export type RoleBlueprint = z.infer<typeof roleBlueprintSchema>;
```

- [x] **Step 4: Run contract tests**

Run:

```powershell
npx vitest run tests/contracts/intelligence.test.ts
```

Expected: PASS, 3 tests.

- [x] **Step 5: Commit the contract**

```powershell
git add app/contracts/intelligence.ts tests/contracts/intelligence.test.ts
git commit -m "feat: define v8 intelligence contracts"
```

### Task 2: Build the deterministic Flagship blueprint

**Files:**
- Create: `tests/data/flagship-blueprint.test.ts`
- Create: `app/data/flagship-blueprint.ts`

- [x] **Step 1: Write the failing Flagship registry tests**

Create `tests/data/flagship-blueprint.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { roleBlueprintSchema } from "../../app/contracts/intelligence";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";

describe("flagshipBlueprint", () => {
  it("publishes the reviewed 16-skill, eight-category flagship", () => {
    expect(roleBlueprintSchema.parse(flagshipBlueprint)).toEqual(flagshipBlueprint);
    expect(flagshipBlueprint.id).toBe("ai-native-full-stack-engineer");
    expect(flagshipBlueprint.status).toBe("ready");
    expect(flagshipBlueprint.skills).toHaveLength(16);
    expect(new Set(flagshipBlueprint.skills.map((skill) => skill.category))).toEqual(
      new Set(["foundations", "frontend", "backend", "data", "quality", "cloud", "ai", "product"]),
    );
  });

  it("gives every skill mastery criteria and resolvable resources", () => {
    const resourceIds = new Set(flagshipBlueprint.resources.map((resource) => resource.id));
    for (const skill of flagshipBlueprint.skills) {
      expect(skill.masteryCriteria).toHaveLength(2);
      expect(skill.resourceIds.every((id) => resourceIds.has(id))).toBe(true);
    }
  });

  it("keeps official sources English-first, free and attributable", () => {
    expect(flagshipBlueprint.resources).toHaveLength(16);
    for (const resource of flagshipBlueprint.resources) {
      expect(resource.language).toBe("en");
      expect(resource.cost).toBe("free");
      expect(resource.sourceTier).toBe("primary");
      expect(resource.url).toMatch(/^https:\/\//u);
    }
  });
});
```

- [x] **Step 2: Run the test and prove it fails**

```powershell
npx vitest run tests/data/flagship-blueprint.test.ts
```

Expected: FAIL because `app/data/flagship-blueprint.ts` does not exist.

- [x] **Step 3: Implement the deterministic adapter**

Create `app/data/flagship-blueprint.ts`. Do not duplicate the 16 reviewed URLs; derive canonical v8 resources from `flagshipRole` and parse the final object once:

```ts
import { roleBlueprintSchema, type LearningResource } from "../contracts/intelligence";
import { flagshipRole } from "./flagship-role";

function resourceId(skillId: string): string {
  return `${skillId}-official`;
}

function masteryCriteria(name: string): [string, string] {
  return [
    `Explain where ${name} belongs in a production full-stack system and justify one trade-off.`,
    `Produce a reviewable artifact that applies ${name} and states how the result was verified.`,
  ];
}

function toResource(skillId: string): LearningResource {
  const skill = flagshipRole.skills.find((candidate) => candidate.id === skillId);
  const source = skill?.sources[0];
  if (!skill || !source) throw new Error(`Flagship source missing for ${skillId}`);

  return {
    id: resourceId(skill.id),
    title: source.title,
    url: source.url,
    provider: new URL(source.url).hostname.replace(/^www\./u, ""),
    language: "en",
    cost: "free",
    format: "documentation",
    sourceTier: "primary",
    purpose: "primary",
    estimatedMinutes: null,
    lastVerifiedAt: source.observedAt,
    skillIds: [skill.id],
  };
}

export const flagshipBlueprint = roleBlueprintSchema.parse({
  id: flagshipRole.id,
  name: flagshipRole.name,
  summary: flagshipRole.summary,
  version: "2026.08.1",
  status: "ready",
  updatedAt: "2026-08-10",
  languagePolicy: "english-first",
  skills: flagshipRole.skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    category: skill.category,
    importance: skill.importance,
    why: skill.why,
    confidence: skill.confidence,
    masteryCriteria: masteryCriteria(skill.name),
    prerequisiteIds: skill.prerequisiteIds,
    resourceIds: [resourceId(skill.id)],
  })),
  resources: flagshipRole.skills.map((skill) => toResource(skill.id)),
  phases: flagshipRole.phases,
});
```

- [x] **Step 4: Run the new and compatibility tests**

```powershell
npx vitest run tests/data/flagship-blueprint.test.ts tests/data/flagship-role.test.ts
```

Expected: PASS, and the v7 Flagship tests remain green.

- [x] **Step 5: Commit the reviewed adapter**

```powershell
git add app/data/flagship-blueprint.ts tests/data/flagship-blueprint.test.ts
git commit -m "feat: add flagship intelligence blueprint"
```

### Task 3: Enforce graph and resource-quality invariants

**Files:**
- Create: `tests/lib/intelligence-validation.test.ts`
- Create: `app/lib/intelligence-validation.ts`

- [x] **Step 1: Write failing policy tests**

Create `tests/lib/intelligence-validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { validateRoleBlueprint } from "../../app/lib/intelligence-validation";

describe("validateRoleBlueprint", () => {
  it("accepts the reviewed Flagship graph", () => {
    expect(validateRoleBlueprint(flagshipBlueprint)).toEqual({ valid: true, issues: [] });
  });

  it("rejects missing resource references", () => {
    const input = structuredClone(flagshipBlueprint);
    input.skills[0].resourceIds = ["missing-resource"];
    expect(validateRoleBlueprint(input).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "missing-resource" }),
    ]));
  });

  it("rejects prerequisite cycles", () => {
    const input = structuredClone(flagshipBlueprint);
    input.skills[0].prerequisiteIds = [input.skills[1].id];
    input.skills[1].prerequisiteIds = [input.skills[0].id];
    expect(validateRoleBlueprint(input).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "prerequisite-cycle" }),
    ]));
  });

  it("requires a free alternative for a paid primary resource", () => {
    const input = structuredClone(flagshipBlueprint);
    input.resources[0].cost = "paid";
    expect(validateRoleBlueprint(input).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "free-alternative-required" }),
    ]));
  });
});
```

- [x] **Step 2: Run the test and prove it fails**

```powershell
npx vitest run tests/lib/intelligence-validation.test.ts
```

Expected: FAIL because the validator does not exist.

- [x] **Step 3: Implement deterministic validation**

Create `app/lib/intelligence-validation.ts` with this public boundary:

```ts
import type { RoleBlueprint } from "../contracts/intelligence";

export type IntelligenceIssueCode =
  | "duplicate-skill"
  | "duplicate-resource"
  | "missing-prerequisite"
  | "missing-resource"
  | "resource-backlink-mismatch"
  | "missing-phase-skill"
  | "unplanned-skill"
  | "prerequisite-cycle"
  | "free-alternative-required";

export interface IntelligenceIssue {
  code: IntelligenceIssueCode;
  path: string;
  message: string;
}

export interface IntelligenceValidationResult {
  valid: boolean;
  issues: IntelligenceIssue[];
}

export function validateRoleBlueprint(blueprint: RoleBlueprint): IntelligenceValidationResult;
```

Implement the function in this deterministic order:

1. collect duplicate skill IDs;
2. collect duplicate resource IDs;
3. resolve every prerequisite;
4. resolve every skill resource and confirm the resource includes that skill in `skillIds`;
5. resolve every phase skill and confirm every skill appears in at least one phase;
6. run depth-first search with `visiting` and `visited` sets to detect prerequisite cycles;
7. for each skill containing a `paid` or `mixed` resource whose purpose is `primary`, require another linked resource where `cost === "free"` and `purpose === "alternative"`;
8. return issues sorted by `code`, then `path`, so tests and logs are stable.

Each issue path must use a stable form such as `skills.web-platform.resourceIds` rather than an array index. Do not throw for policy failures; reserve exceptions for programmer errors.

- [x] **Step 4: Run validation and Flagship tests**

```powershell
npx vitest run tests/lib/intelligence-validation.test.ts tests/data/flagship-blueprint.test.ts
```

Expected: PASS, 7 tests total.

- [x] **Step 5: Commit the quality gate**

```powershell
git add app/lib/intelligence-validation.ts tests/lib/intelligence-validation.test.ts
git commit -m "feat: validate intelligence graphs and resources"
```

### Task 4: Add additive D1 intelligence persistence

**Files:**
- Modify: `tests/db/schema.test.ts`
- Create: `tests/db/migration-safety.test.ts`
- Modify: `db/schema.ts`
- Create by generator: `drizzle/0002_product_intelligence.sql`
- Create by generator: `drizzle/meta/0002_snapshot.json`
- Modify by generator: `drizzle/meta/_journal.json`

- [x] **Step 1: Extend schema tests first**

Add these names to `expectedTableNames` in `tests/db/schema.test.ts`:

```ts
"role_blueprints",
"role_blueprint_versions",
"role_skill_definitions",
"role_skill_edges",
"learning_resources",
"resource_skill_links",
```

Add a new test:

```ts
it("declares version and normalized intelligence uniqueness boundaries", () => {
  expect(indexNames(schema.roleBlueprints)).toContain("role_blueprints_slug_idx");
  expect(indexNames(schema.roleBlueprintVersions)).toContain("role_blueprint_versions_role_version_idx");
  expect(indexNames(schema.roleSkillDefinitions)).toContain("role_skill_definitions_version_key_idx");
  expect(indexNames(schema.roleSkillEdges)).toContain("role_skill_edges_unique_idx");
  expect(indexNames(schema.learningResources)).toContain("learning_resources_url_idx");
  expect(indexNames(schema.resourceSkillLinks)).toContain("resource_skill_links_unique_idx");
});
```

- [x] **Step 2: Run the schema test and prove it fails**

```powershell
npx vitest run tests/db/schema.test.ts
```

Expected: FAIL because the six table exports do not exist.

- [x] **Step 3: Add the six Drizzle tables**

Append these table responsibilities and exact storage fields to `db/schema.ts`:

- `roleBlueprints`: `id`, unique `slug`, `name`, enum `status` (`ready`, `needs-review`, `draft`), `currentVersion`, `createdAt`, `updatedAt`.
- `roleBlueprintVersions`: `id`, `roleId` FK with cascade delete, `version`, enum `status`, `blueprintJson`, `sourceCoverageJson`, nullable `publishedAt`, `createdAt`; unique `(roleId, version)`.
- `roleSkillDefinitions`: `id`, `blueprintVersionId` FK with cascade delete, `skillKey`, `name`, enum `category`, enum `importance`, `payloadJson`, `createdAt`; unique `(blueprintVersionId, skillKey)`.
- `roleSkillEdges`: `id`, `blueprintVersionId` FK with cascade delete, `fromSkillKey`, `toSkillKey`, enum `relation` containing only `prerequisite`, `createdAt`; unique `(blueprintVersionId, fromSkillKey, toSkillKey, relation)`.
- `learningResources`: `id`, unique `canonicalUrl`, `title`, `provider`, enum `language`, enum `cost`, enum `format`, enum `sourceTier`, `lastVerifiedAt` as ISO-date text, `createdAt`, `updatedAt`.
- `resourceSkillLinks`: `id`, `blueprintVersionId` FK with cascade delete, `skillKey`, `resourceId` FK with restrict delete, enum `purpose`, `createdAt`; unique `(blueprintVersionId, skillKey, resourceId, purpose)`.

Use the exact index names asserted above. Add non-unique lookup indexes for version foreign keys and resource links. These tables contain global role intelligence, so do not add `userId` and do not add them to the personal-table ownership test.

- [x] **Step 4: Generate the named migration**

Run:

```powershell
npm run db:generate -- --name product_intelligence
```

Expected: Drizzle reports six created tables and writes `drizzle/0002_product_intelligence.sql` plus `drizzle/meta/0002_snapshot.json`.

Inspect the SQL and confirm it contains only additive `CREATE TABLE` and `CREATE INDEX` statements. It must not contain `DROP TABLE`, `DROP COLUMN` or destructive data-copy statements.

- [x] **Step 5: Add a migration safety test**

Create `tests/db/migration-safety.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../drizzle/0002_product_intelligence.sql", import.meta.url),
  "utf8",
);

describe("product intelligence migration", () => {
  it("is additive and creates every Phase 1 table", () => {
    for (const table of [
      "role_blueprints",
      "role_blueprint_versions",
      "role_skill_definitions",
      "role_skill_edges",
      "learning_resources",
      "resource_skill_links",
    ]) {
      expect(migration).toContain(`CREATE TABLE \`${table}\``);
    }
    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN)\b/iu);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/iu);
  });
});
```

- [x] **Step 6: Run schema and migration safety tests**

```powershell
npx vitest run tests/db/schema.test.ts tests/db/migration-safety.test.ts
```

Expected: PASS. If the repository's migration safety test discovers migrations dynamically, it must include `0002_product_intelligence.sql` without changing the test.

- [x] **Step 7: Commit schema and generated artifacts**

```powershell
git add db/schema.ts tests/db/schema.test.ts tests/db/migration-safety.test.ts drizzle/0002_product_intelligence.sql drizzle/meta/0002_snapshot.json drizzle/meta/_journal.json
git commit -m "feat: add product intelligence persistence"
```

### Task 5: Serve only validated published intelligence

**Files:**
- Create: `tests/server/intelligence-service.test.ts`
- Create: `app/server/intelligence/repository.ts`
- Create: `app/server/intelligence/builtin-repository.ts`
- Create: `app/server/intelligence/service.ts`
- Create: `tests/api/intelligence-flagship.test.ts`
- Create: `app/api/intelligence/flagship/route.ts`

- [x] **Step 1: Write the failing service tests**

Create `tests/server/intelligence-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { IntelligenceIntegrityError, IntelligenceService } from "../../app/server/intelligence/service";

describe("IntelligenceService", () => {
  it("returns a valid published blueprint", async () => {
    const service = new IntelligenceService({
      getPublishedBySlug: async () => flagshipBlueprint,
    });
    await expect(service.getPublished("ai-native-full-stack-engineer")).resolves.toEqual(flagshipBlueprint);
  });

  it("rejects repository data that fails cross-entity validation", async () => {
    const broken = structuredClone(flagshipBlueprint);
    broken.skills[0].resourceIds = ["missing-resource"];
    const service = new IntelligenceService({ getPublishedBySlug: async () => broken });
    await expect(service.getPublished(broken.id)).rejects.toBeInstanceOf(IntelligenceIntegrityError);
  });

  it("returns null for an unknown role", async () => {
    const service = new IntelligenceService({ getPublishedBySlug: async () => null });
    await expect(service.getPublished("unknown-role")).resolves.toBeNull();
  });
});
```

- [x] **Step 2: Run the focused test and prove it fails**

```powershell
npx vitest run tests/server/intelligence-service.test.ts
```

Expected: FAIL because the repository and service modules do not exist.

- [x] **Step 3: Implement repository and service boundaries**

Create `app/server/intelligence/repository.ts`:

```ts
import type { RoleBlueprint } from "../../contracts/intelligence";

export interface IntelligenceRepository {
  getPublishedBySlug(slug: string): Promise<RoleBlueprint | null>;
}
```

Create `app/server/intelligence/builtin-repository.ts`:

```ts
import { flagshipBlueprint } from "../../data/flagship-blueprint";
import type { IntelligenceRepository } from "./repository";

export class BuiltinIntelligenceRepository implements IntelligenceRepository {
  async getPublishedBySlug(slug: string) {
    return slug === flagshipBlueprint.id ? flagshipBlueprint : null;
  }
}
```

Create `app/server/intelligence/service.ts`. `getPublished` must call `roleBlueprintSchema.safeParse`, then `validateRoleBlueprint`; throw `IntelligenceIntegrityError` with only issue codes in its public message and keep detailed issues on a property for server-side tests. Never return malformed repository data.

- [x] **Step 4: Run service tests**

```powershell
npx vitest run tests/server/intelligence-service.test.ts
```

Expected: PASS, 3 tests.

- [x] **Step 5: Write failing API tests**

Create `tests/api/intelligence-flagship.test.ts` with three cases:

```ts
import { describe, expect, it, vi } from "vitest";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { createFlagshipIntelligenceHandler } from "../../app/api/intelligence/flagship/route";
import { expectApiError, requestId } from "./cloud-route-test-helpers";

describe("GET /api/intelligence/flagship", () => {
  it("is guest-safe and returns the canonical version", async () => {
    const GET = createFlagshipIntelligenceHandler({
      getBlueprint: vi.fn().mockResolvedValue(flagshipBlueprint),
      createRequestId: () => requestId,
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300, stale-while-revalidate=3600");
    await expect(response.json()).resolves.toMatchObject({
      blueprint: { id: flagshipBlueprint.id, version: flagshipBlueprint.version },
    });
  });

  it("returns NOT_FOUND without exposing internals", async () => {
    const GET = createFlagshipIntelligenceHandler({
      getBlueprint: vi.fn().mockResolvedValue(null),
      createRequestId: () => requestId,
    });
    await expectApiError(await GET(), 404, "NOT_FOUND");
  });

  it("maps integrity failures to a stable unavailable response", async () => {
    const GET = createFlagshipIntelligenceHandler({
      getBlueprint: vi.fn().mockRejectedValue(new Error("private graph detail")),
      createRequestId: () => requestId,
    });
    const response = await GET();
    const responseCopy = response.clone();
    await expectApiError(response, 503, "UNAVAILABLE");
    expect(await responseCopy.text()).not.toContain("private graph detail");
  });
});
```

- [x] **Step 6: Implement the guest-safe API**

Create `app/api/intelligence/flagship/route.ts` with an injectable handler. It must:

- create a request ID;
- call `IntelligenceService.getPublished("ai-native-full-stack-engineer")` in production;
- require no session and read no user identifiers;
- return `{ blueprint }` with `Cache-Control: public, max-age=300, stale-while-revalidate=3600`;
- return stable `NOT_FOUND` or `UNAVAILABLE` bodies through `apiError`;
- never include validation issues or stack traces in the response.

Set:

```ts
export const dynamic = "force-dynamic";
```

The explicit cache header, not static route inference, controls edge/browser caching.

- [x] **Step 7: Run service and API tests**

```powershell
npx vitest run tests/server/intelligence-service.test.ts tests/api/intelligence-flagship.test.ts tests/server/observability.test.ts
```

Expected: PASS, 3 test files and 24 tests.

- [x] **Step 8: Commit the validated read path**

```powershell
git add app/server/intelligence app/api/intelligence/flagship tests/server/intelligence-service.test.ts tests/api/intelligence-flagship.test.ts
git commit -m "feat: expose validated flagship intelligence"
```

### Task 6: Upgrade Stack to show learning-resource evidence

**Files:**
- Modify: `tests/components/stack-browser.test.tsx`
- Modify: `app/components/stack/stack-browser.tsx`
- Modify: `app/stack/page.tsx`
- Modify: `app/globals.css`
- Modify: `app/lib/skill-map.ts`

- [x] **Step 1: Replace the component test input with the v8 blueprint**

Update `tests/components/stack-browser.test.tsx` to render:

```tsx
<StackBrowser blueprint={flagshipBlueprint} />
```

Keep the category-filter assertion. Replace the old missing-source test with evidence assertions for the `Structured LLM Contracts` article:

```ts
expect(within(skill).getByText("Free")).toBeInTheDocument();
expect(within(skill).getByText("English")).toBeInTheDocument();
expect(within(skill).getByText("Primary source")).toBeInTheDocument();
expect(within(skill).getByText("Documentation")).toBeInTheDocument();
expect(within(skill).getByText("Verified 2026-07-26")).toBeInTheDocument();
expect(within(skill).getByRole("link", { name: /official documentation/i })).toHaveAttribute(
  "rel",
  "noreferrer",
);
```

Add a test that every rendered skill has two mastery criteria and at least one resource link.

- [x] **Step 2: Run the component test and prove it fails**

```powershell
npx vitest run tests/components/stack-browser.test.tsx
```

Expected: FAIL because `StackBrowser` still accepts `skills` and does not render resource metadata.

- [x] **Step 3: Update filtering without breaking v7 callers**

Make `filterSkills` generic over any object that has a `category` field:

```ts
export function filterSkills<T extends { category: SkillCategory }>(
  skills: ReadonlyArray<T>,
  category: SkillCategory | "all",
): T[] {
  return category === "all" ? [...skills] : skills.filter((skill) => skill.category === category);
}
```

Keep the `SkillCategory` import from `app/domain/learning.ts` in Phase 1; the enum values are deliberately compatible. Existing `tests/lib/skill-map.test.ts` must remain green.

- [x] **Step 4: Render canonical skills and resources**

Change `StackBrowser` to accept:

```ts
export function StackBrowser({ blueprint }: { blueprint: RoleBlueprint })
```

Build `resourcesById` once with `useMemo`. For each skill, render:

- category and importance;
- confidence as a separate claim confidence, not a mastery percentage;
- `why` and the two mastery criteria;
- resolved prerequisite names;
- every linked resource as a compact evidence row;
- title, provider, format, language, cost, source tier and `lastVerifiedAt`;
- external links with `target="_blank"` and `rel="noreferrer"`.

If a resource ID cannot resolve, render `Resource metadata unavailable` and do not fabricate a URL. The server-side validator should prevent this in production, but truthful defensive rendering protects tests and future repository adapters.

- [x] **Step 5: Update the Stack page**

In `app/stack/page.tsx`, import `flagshipBlueprint`, show `Role intelligence · {flagshipBlueprint.version}`, and pass `blueprint={flagshipBlueprint}`. Do not fetch the public API from the browser in Phase 1: the page and API intentionally share the same validated builtin source, keeping the guest experience deterministic and avoiding a self-request during rendering.

- [x] **Step 6: Add restrained editorial styles**

In `app/globals.css`, extend the current `.skill-list` hierarchy with resource rows and mastery criteria. Requirements:

- no nested card grid;
- metadata uses existing mono/eyebrow typography and muted colors;
- resource title remains the only accent link;
- cost/language/tier labels wrap on mobile;
- visible keyboard focus uses the existing focus token;
- at widths below the existing mobile breakpoint, evidence rows become one column without horizontal scrolling.

- [x] **Step 7: Run focused UI and compatibility tests**

```powershell
npx vitest run tests/components/stack-browser.test.tsx tests/lib/skill-map.test.ts tests/pages/workspace-state.test.tsx
```

Expected: PASS. The Stack page still participates in the local/cloud state shell and migration prompt.

- [x] **Step 8: Commit the Stack evidence view**

```powershell
git add app/components/stack/stack-browser.tsx app/stack/page.tsx app/globals.css app/lib/skill-map.ts tests/components/stack-browser.test.tsx
git commit -m "feat: show trusted learning resources in stack"
```

### Task 7: Document the Phase 1 truth boundary

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-10-arc-v8-product-intelligence-roadmap.md`
- Modify: `docs/superpowers/plans/2026-08-10-arc-v8-intelligence-kernel.md`

- [x] **Step 1: Update README capability wording**

Document these facts without claiming Phase 2–5 functionality:

- v8 Phase 1 adds a canonical, versioned Flagship intelligence contract;
- learning resources expose language, cost, format, source tier and last verification date;
- the public Flagship endpoint is read-only and guest-safe;
- D1 tables reserve future version publication, but live Research Beta is still disabled;
- `OPENROUTER_API_KEY` is not required or read in Phase 1;
- current Stack confidence describes the curated claim, not the learner's mastery.

- [x] **Step 2: Record the implemented Phase 1 boundary in both plan files**

Check only implementation items already supported by focused test output. Record that Phase 1 remains inside its final quality gate and that Phase 2 has not started. Do not claim completion or quote a final commit hash before Task 8 passes.

- [x] **Step 3: Commit documentation truthfulness**

```powershell
git add README.md docs/superpowers/plans/2026-08-10-arc-v8-product-intelligence-roadmap.md docs/superpowers/plans/2026-08-10-arc-v8-intelligence-kernel.md
git commit -m "docs: record v8 intelligence kernel boundary"
```

### Task 8: Complete the Phase 1 quality gate

**Files:**
- Review: all files changed since the plan commit
- Modify if verification or review finds an issue
- Modify after verification: `docs/superpowers/plans/2026-08-10-arc-v8-product-intelligence-roadmap.md`
- Modify after verification: `docs/superpowers/plans/2026-08-10-arc-v8-intelligence-kernel.md`

- [x] **Step 1: Run the complete unit suite**

```powershell
npm run test:unit
```

Expected: all Vitest suites pass with no unhandled rejection or leaked timer.

- [x] **Step 2: Run static verification**

```powershell
npx tsc --noEmit
npm run lint
```

Expected: both commands exit `0` with no new errors.

- [x] **Step 3: Build and run rendered HTML checks**

```powershell
npm run build
node --test tests/rendered-html.test.mjs
```

Expected: production build succeeds and all rendered HTML tests pass.

- [x] **Step 4: Inspect the production bundle for secrets and provider drift**

Run:

```powershell
rg -n "OPENROUTER_API_KEY|OPENAI_API_KEY|sk-or-" dist .next
```

Expected: no API key value and no client-side environment reference. Literal server-only variable names may appear only if the build emits server source maps; investigate every match rather than accepting it automatically.

Run:

```powershell
rg -n "MockAiProvider|OpenRouter|fetch\(" app/data/flagship-blueprint.ts app/server/intelligence app/api/intelligence/flagship
```

Expected: no model provider and no outbound `fetch` in the deterministic Flagship read path.

- [x] **Step 5: Perform the required code review**

Invoke `superpowers:requesting-code-review` against the Phase 1 commit range. Resolve every correctness, security, privacy and contract-consistency finding. Re-run the affected focused tests after each correction.

- [x] **Step 6: Re-run the full gate after review fixes**

Repeat Steps 1–4. Do not reuse earlier output.

- [x] **Step 7: Apply verification-before-completion**

Invoke `superpowers:verification-before-completion`. Confirm the evidence demonstrates:

- strict contract parsing;
- deterministic Flagship availability without external services;
- graph and resource-policy enforcement;
- additive non-personal D1 schema;
- guest-safe API behavior;
- rich, truthful Stack evidence;
- v7.2 auth, migration and workspace tests remain green.

- [x] **Step 8: Record fresh completion evidence**

In both plan files, add the final Phase 1 commit range, the exact verification commands, their exit codes, test totals, review outcome and the date. Check only items proven by those results. Then run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and only the two expected plan files modified.

Commit the completion record:

```powershell
git add docs/superpowers/plans/2026-08-10-arc-v8-product-intelligence-roadmap.md docs/superpowers/plans/2026-08-10-arc-v8-intelligence-kernel.md
git commit -m "docs: close v8 intelligence kernel phase"
```

- [x] **Step 9: Stop at the checkpoint**

Report Phase 1 as ready for review. Do not migrate production D1, enable a feature flag, push, merge, deploy or begin Phase 2 without the corresponding user approval. After acceptance, write the Phase 2 detailed plan against the actual merged Phase 1 types and file structure.

## Phase 1 completion definition

Phase 1 is complete only when every checkbox above has evidence, the review has no unresolved high- or medium-severity findings, the full quality gate passes after the last code change, and the user accepts the checkpoint. A polished Stack view without passing contract and graph validation is not completion; passing data tests without the guest-safe UI is also not completion.
