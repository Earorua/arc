# Arc v8 restricted Research configuration implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Parse one explicit restricted Research inventory and generate its exact Site/Executor configuration pair while preserving local/shadow behavior and strict Site artifact checks.

**Architecture:** Add one pure Zod-backed build module, wire its tagged inventory into the existing loader/config function, and teach the existing Site validator to identify the actual stage. This is the first implementation component of the saved restricted-target design. Exclusive Executor output, pair artifact validation and actual candidate builds follow as a separately implemented component; this component must not pretend to complete those requirements.

**Tech Stack:** TypeScript 5.9, Zod 4, locked Cloudflare Vite plugin 1.37.1, Node 24/Node strip-types, Vitest.

## Context and authority

The user resumed r62 and requested continuation of local preparation. Previous local implementation/deployment authorization remains; no additional approval is needed for this bounded local code. No cloud operations, credentials, cohort writes, DNS changes, real model requests, r6 operational template generation or user-facing run commands belong here. Reuse the retained integration candidate; do not commit, reset, archive, install dependencies or overwrite historical builds.

- Main documents: `C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta`.
- Code candidate: `C:/Users/XF/.codex/worktrees/arc-v8-release-integration/v8-openrouter-research-beta`.
- Design: main documents `docs/superpowers/specs/2026-10-15-arc-v8-restricted-research-target-design.md`.
- Evidence: candidate `outputs/restricted-research-configuration-20261015`.
- The private bridge's nine accepted source hashes and historical acceptance are prerequisites. Snapshot the current baseline before editing; snapshots use `.source`, not `.ts`.

## File map

Create:
- `build/research-acceptance-target.ts`: strict parser and pure paired generator, no I/O or runtime application dependency.
- `tests/fixtures/build/research-acceptance.json`: clearly synthetic closed-state target only; no operational identifiers or secret values.
- `tests/build/research-acceptance-target.test.ts`: parser, state, policy and integration behavior.
- `tests/build/research-acceptance-build.test.ts`: actual-stage Site manifest/CLI checks and negative mutations.

Modify only:
- `build/cloudflare-target.ts`: add the explicit target branch and delegate its Site config.
- `scripts/check-cloudflare-build.mjs`: select validated Site name and report actual stage, preserving complete deep comparison and shadow CLI success wording.
- `tsconfig.json`: add `allowImportingTsExtensions: true` if required for the explicit `.ts` import used by Node strip-types; retain `noEmit`, include/exclude and every other option.

`vite.config.ts` already consumes `loadCloudflareTarget` and `createCloudflareConfig`; do not edit it unless concrete integration evidence requires a change. No caller-controlled generic vars or optional mode overrides.

## Task 1: strict paired configuration and Site preflight

- [ ] **1. Preserve baseline and establish behavioral RED.**

Write the synthetic fixture under `tests/fixtures/build`, with:

```json
{
  "stage": "research-acceptance",
  "accountId": "54eaadb89014252836694203c1e22546",
  "state": "closed",
  "site": {
    "workerName": "arc-v8-migration-research-test-site",
    "runtimeOrigin": "https://arc-v8-migration-research-test-site.23711031.workers.dev",
    "d1": {"databaseId":"12345678-1234-4123-8123-123456789abc","databaseName":"arc-v8-migration-research-test-site-db"},
    "r2": {"bucketName":"arc-v8-migration-research-test-proofs","public":false}
  },
  "executor": {
    "workerName": "arc-v8-migration-research-test-executor",
    "runtimeOrigin": "https://arc-v8-migration-research-test-executor.23711031.workers.dev",
    "d1": {"databaseId":"87654321-4321-4321-8321-cba987654321","databaseName":"arc-v8-migration-research-test-executor-db"},
    "r2": {"bucketName":"arc-v8-migration-research-test-receipts","public":false},
    "workflowName": "arc-v8-migration-research-test-workflow"
  },
  "bridge": {"transport":"service-binding-v1","siteToExecutorKeyId":"synthetic-site","executorToSiteKeyId":"synthetic-executor"},
  "acceptanceOwnerId":"synthetic-owner-a"
}
```

The first test must call the existing loader so its failure is behavior, not a missing-import error:

```ts
it("loads an explicit restricted inventory instead of treating it as shadow", async () => {
  const target = await loadCloudflareTarget({ targetPath: "tests/fixtures/build/research-acceptance.json" });
  expect(target).toEqual(fixture);
  expect(createCloudflareConfig(target)).toMatchObject({
    name: fixture.site.workerName,
    services: [{ binding: "ARC_RESEARCH_EXECUTOR", service: fixture.executor.workerName }],
  });
});
```

Run `node node_modules/vitest/vitest.mjs run tests/build/research-acceptance-target.test.ts --maxWorkers=1`; preserve its expected invalid-shadow error and Exit 1 before implementation.

- [ ] **2. Implement parser with exact shapes and a bounded error.**

Public APIs:

```ts
export type ResearchAcceptanceTarget = z.infer<typeof researchAcceptanceTargetSchema>;
export function parseResearchAcceptanceTarget(value: unknown): ResearchAcceptanceTarget;
export function createResearchAcceptanceConfigPair(value: unknown): {
  site: Partial<WorkerConfig>; executor: Partial<WorkerConfig>;
};
```

Use `z.strictObject` at every object depth, exact account and transport literals, required state enum. Resource names use `/^arc-v8-migration-[a-z0-9]+(?:-[a-z0-9]+)*$/`, max63, reject `smoke`. Each runtimeOrigin must equal the corresponding `https://<workerName>.23711031.workers.dev` string exactly. D1 IDs are UUIDs; reject the local sentinel and all eight historical mock IDs, comparing case-insensitively:

```ts
const excludedDatabaseIds = new Set([
  "00000000-0000-4000-8000-000000000000",
  "fe4952d0-da78-4c85-b1fa-8a5706d42fa3", "81d44533-40d9-4544-a03d-81a01e2719ae",
  "0b832b24-7ece-46f6-9899-59a755bead6b", "d52456da-a78f-4765-9e56-4a7d2ad92a4b",
  "eee6702f-ad59-45c8-bcfe-aec09aebcdd4", "eb8a443d-53ca-4fab-b028-ae03b03b6a2a",
  "eda666b8-6d49-4c3b-aa45-59eb9ff2bf74", "a480e7d5-c008-46da-99bf-ca2422c06621",
]);
```

Site and Executor D1 IDs must differ case-insensitively. Their named resources must not overlap across roles: Site Worker/DB/bucket names versus Executor Worker/DB/bucket/Workflow names. Private R2 is literal false. Key IDs match `/^[A-Za-z0-9_-]{1,32}$/` and differ. Owner ID is nonempty, unchanged by trim, max160, and contains none of U+0000–001F/U+007F–009F. Do not add normalization, arbitrary additional fields, default states or supplied secret values.

Parser failure is exactly `Invalid restricted Research target inventory.` and must not include input, Zod details or a secret-like sentinel. Generator always calls this parser, including when its argument looks typed. No file/DB/network work.

- [ ] **3. Implement fresh paired configs.**

Every call returns fresh objects/arrays; do not share mutable config fragments across calls or between pair roles. Both roles set account_id, compatibility_date `2026-05-15`, compatibility_flags `["nodejs_compat"]`, preview_urls false. Shared values (copied into separate vars objects):

```ts
const bridgeVars = {
  BETTER_AUTH_URL: target.site.runtimeOrigin,
  ARC_AI_RESEARCH_EXECUTOR_URL: target.executor.runtimeOrigin,
  ARC_AI_RESEARCH_BRIDGE_TRANSPORT: "service-binding-v1",
  ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID: target.bridge.siteToExecutorKeyId,
  ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID: target.bridge.executorToSiteKeyId,
};
const admitting = target.state === "active";
const maintaining = target.state !== "closed";
```

Site: name=site.workerName, main `./worker/index.ts`, workers_dev true, ASSETS binding, one DB and one PROOF_ASSETS binding from Site identities, one ARC_RESEARCH_EXECUTOR service binding, no routes/Workflow or Executor resource. Required names in this order: BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, ARC_AI_IP_HASH_SALT, ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX, ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX. Site vars additionally:

```ts
{
  ARC_ENVIRONMENT: "production",
  ARC_AI_ENABLED: String(admitting), ARC_AI_RESEARCH_ENABLED: String(admitting),
  ARC_AI_RESEARCH_EXECUTOR: "cloudflare-workflow-v1",
  ARC_AI_RESEARCH_PROFILE: "kimi-low-output32k-v3",
  ARC_AI_MODEL_RESEARCH: "moonshotai/kimi-k3", ARC_AI_MODEL_ECONOMY: "moonshotai/kimi-k3",
  ARC_AI_RESEARCH_TIMEOUT_MS: "1200000", ARC_AI_REPAIR_TIMEOUT_MS: "10000",
  ARC_AI_RESEARCH_CACHE_DAYS: "14", ARC_AI_USER_DAILY_QUOTA: "1", ARC_AI_RATE_LIMIT_PER_MINUTE: "1",
  ARC_AI_SITE_DAILY_BUDGET_MICROS: "5000000", ARC_AI_SITE_MONTHLY_BUDGET_MICROS: "5000000",
  ARC_AI_RESEARCH_MAX_COST_MICROS: "5000000", ARC_AI_REPAIR_MAX_COST_MICROS: "0",
}
```

Executor: name=executor.workerName, main `./worker/research-executor/index.ts`, workers_dev false, routes [], one EXECUTOR_DB, one EXECUTOR_RECEIPTS, one RESEARCH_WORKFLOW named by inventory with class_name ResearchWorkflow, one ARC_RESEARCH_SITE service. Required names OPENROUTER_API_KEY and the two directional secret names. Vars are only bridgeVars plus `ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: String(admitting)` and `ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED: String(maintaining)`. Cron is `["* * * * *"]` only when maintaining, else []. No OAuth values, Site DB, proof bucket, assets or extra Provider overrides.

Owner ID stays in the validated inventory for later explicit cohort proof, not in config vars and not a DB mutation. Closed/draining preserve connection identity. State selection is configuration only, not proof of operational drain.

- [ ] **4. Wire loader and Node-compatible imports without weakening old modes.**

Import parser/pair generator/type from `./research-acceptance-target.ts`, add that type to CloudflareTarget. Preserve parseRemoteTarget as shadow-only. In loadCloudflareTarget, the explicit inventory dispatches to research parser only for a non-null object with exact stage; all other explicit values still use shadow parser. Default no-path still parses local only. createCloudflareConfig delegates research stage to pair.site before existing unchanged local/shadow branches. Vite's existing calls then consume the new branch without a separate override.

If TypeScript requires it, add only `allowImportingTsExtensions: true` to tsconfig compilerOptions because the script runs native Node strip-types with no extension resolver. Verify existing checker CLI under Node, not only Vitest's transformed imports.

- [ ] **5. Update Site preflight and add independent literal expectations.**

Retain exact `isDeepStrictEqual` and locked framework defaults. Obtain name from `createCloudflareConfig(target).name`, require a nonempty string, and use it for topLevelName. Report `{stage: target.stage, workerName}` for explicit remote inventories; existing local/default remains rejected. Keep the existing shadow success text, use `Restricted Research build preflight passed` for the new stage, bounded generic failure text under512 characters, no input echo.

Add Site manifest tests against a literal expected config merged with the inspected framework-default fixture, not solely round-tripping the generator. Exercise closed/active/draining success and incorrect state/service/key IDs/missing or extra required secret names/model/budget/origin/resources/routes/cron/plaintext secret/unknown nested field failure. Keep all preexisting shadow tests unchanged. CLI must prove imported `.ts` resolution works and secret sentinel never reaches stdout/stderr.

- [ ] **6. Complete behavioral checks, self-review and freeze.**

Parser tests must cover unknown keys at each nested shape, missing fields, malformed/too-long resource names, all nine excluded D1 IDs in both roles (including uppercase), case-insensitive shared DB ID, cross-role name reuse, public R2, every noncanonical origin form, invalid owner/key IDs, duplicate directional keys, forged generator input and mutation isolation. Generated active Site vars must be accepted by the actual production policy parser with synthetic secret placeholders; closed/draining new-call policy must refuse. Fixed policy/lease/Provider source remains untouched.

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' node_modules/vitest/vitest.mjs run tests/build/cloudflare-target.test.ts tests/build/cloudflare-build.test.ts tests/build/research-acceptance-target.test.ts tests/build/research-acceptance-build.test.ts --maxWorkers=1
& 'C:\Program Files\nodejs\node.exe' node_modules/typescript/bin/tsc --noEmit
& 'C:\Program Files\nodejs\node.exe' node_modules/typescript/bin/tsc --noEmit -p worker/research-executor/tsconfig.json
git -c core.safecrlf=false diff --check
```

Record actual exit codes and full logs under the evidence directory. Do not run an actual build yet: new exclusive candidate output/pair validators are not implemented. Preserve the RED record. Produce changed-file manifest with hashes and a self-review report listing exact files and limitations. Check all untouched source against baseline. No commit or cloud call.

- [ ] **7. Independent SPEC, then QUALITY, then Root acceptance.**

Review actual files and diffs against the frozen pre-edit baseline, not HEAD (retained prior changes exist). SPEC checks this component's scope and saved design; QUALITY independently checks identity separation, error privacy, state policy, Node CLI compatibility, regression coverage and immutability. Address findings with regression tests, then re-review. Preserve accepted source hashes and record next local work: exclusive Executor builder, exact pair artifact validation and actual Site/Executor candidate builds. Neither Task15 nor Task16 is complete at this component boundary.

## Self-review of plan

This plan implements design items 1 and the Site-stage portion of2, plus their specified verification from4. Items2 Executor/pair artifact validation,3 output containment,5 actual builds and native deployment/cohort gates remain explicit subsequent work. No accepted source or operational evidence is reinterpreted as a live success. All task APIs and names above are defined; fixture is synthetic and closed. Existing paid policy, r6 gates and migration scope are retained.
