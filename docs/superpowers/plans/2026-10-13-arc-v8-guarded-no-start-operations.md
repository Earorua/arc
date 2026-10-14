# Arc v8 guarded no-start operations implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development, with independent specification then quality review. Root alone executes reviewed cloud operations. Preserve all prior evidence; no staging or commits.

**Goal:** Bind the already created guarded resources to the existing isolated smoke pair, with admission, maintenance and Cron disabled, and verify native state before any schema or scenario work.

**Architecture:** Add a small fixed-target operation package in O (below), reusing the frozen C5 candidate validation, command-output projection and bounded read transport. Adapt the native mapping read to four Workflows and the new empty databases. Local preparation and reviews precede cloud mutation; unknown mutations are reconciled, never retried.

**Tech stack:** Node.js ESM, pinned Wrangler 4.92, existing D1/R2/Workflow native projections.

## Exact inputs and scope

W is the current workspace. O is `outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261013-guarded`. C5 is `outputs/local-durable-executor-20261012/maintenance-stop/cloud-r5`.

- O `root-no-start-materialization-acceptance-r1.json`: `1a60126d888950d01aa5ece03fb344b690f7b87e44e1612bf0eeb584ca8c6071`.
- O `no-start-r1/artifacts.json`: `fd9fbe5484146c5a2560638f0d78263136c5f9f9d97d7bf927ff2abd6a392efa`.
- O `no-start-r1/linkage.json`: `14ab663b759a689a20e3983959c27fb38c3e03d8265263e8636247c24d0736e3`.
- Both local dry runs passed; read their exact refs through the root acceptance. Output config entries have `{role,config,sourceConfig,artifact}`, not the old flat shape.
- Old live pair: Site `26dff9ec-1d62-4146-afa8-71b0f7acc310`; executor `994b5608-2690-4327-9e80-b52ce0b6f7cc`.
- New Site D1 `eda666b8-6d49-4c3b-aa45-59eb9ff2bf74`; new executor D1 `a480e7d5-c008-46da-99bf-ca2422c06621`; R2 `arc-v8-smoke-receipts-20261013-guarded`. These are actual recorded identities, never recreate.
- The exact frozen manifests preserve all three legacy Workflow declarations and introduce `arc-v8-smoke-workflow-20261013-guarded` as primary. Its ID is unknown until native observation; validate UUID, exact owner/class/name and distinction from legacy IDs before recording it. Never invent it.
- Existing native resource emptiness/privacy evidence and user Objects-list read are under O. No schemas applied yet. This package must not apply migrations, activate admission/maintenance/Cron, call controls/models, or touch production/Sites/DNS.

## Task 1: Fixed native mapping and bounded transport

Create O `no-start-ops-r1/` with focused guard, read-transport, mapping collector/evaluator and local preparation files. Reuse C5 projection code through imports or clearly reviewed narrow derivation; do not edit C5 or historical files. Reuse C5 transport lifecycle bounds (three recognized transport attempts, 45-second child, 12-minute total, confirmed close before retry). Extend only its allowlist to the fourth Workflow, new bucket and one fixed empty-database SELECT per new D1. Reject all mutations and arbitrary SQL. Pin the existing enum-only transport metadata preload (M `read-connection-trace-r2.cjs`, SHA `1db8481ccee8e5d924e18bde8b3b44d1fd1934c0c1a147815d02b305e79489f9`) in the final CLI child environment returned by C5 `neutral()`; do not recursively re-neutralize that environment. No raw errors, secret values, response bodies or headers in logs.

Prepare two mapping phases: `mixed` after executor deployment (old Site/new executor), and `paired` after Site deployment. Read actual deployment before/after, version bindings and secret types before export, deployed source/config, all four Workflow definitions/complete instance rosters, R2 privacy, and both newly created databases' empty state. Both new databases are queried with independent fixed new-resource read configs even when mixed Site remains on old D1. Empty SQL is `SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name != '_cf_KV' ORDER BY type,name`; demand results `[]`, `rows_written:0`, `changed_db:false`. Do not run lifecycle-table SQL against uninitialized databases.

Gate exact current source hashes, all binding names/types/IDs, plain variables (exclude only already reviewed synthetic salt), required secrets typed, exact D1/R2/services/Workflow declarations, admission and maintenance false, Cron empty, executor private, previews/routes closed, compatibility and native settings preserved from actual C5 accepted stop baseline. Preserve the exact three legacy IDs and rosters from the accepted C5 baseline. New Workflow roster must be complete and empty; its actual identity is captured only after successful native reads. Every query/export must succeed within one collection; no merged fragments. Require exact unique read counts, request/tool hashes and start/end/version linkage. Mixed/paired expected revisions derive from actual exclusive successful deployment results; no unchecked caller-supplied revision. A mapping failure is retained and blocks the next mutation.

## Task 2: One no-start deployment per role

Create a fixed-role deploy entrypoint and a local preparation manifest binding all helper hashes and accepted input refs. Root supplies a hash-bound operation decision; the helper must validate its exact target, config/artifact, accepted tooling and predecessor evidence immediately before action. Require existing successful same-config local dry-run proof. Use exact CLI arguments:

```js
['deploy','--config',shortExactConfig,'--no-bundle','--strict','--no-x-autoconfig','--no-x-provision','--no-x-auto-create']
```

Executor first: require a fresh successful C5 `drain-second` with matching `drain-first`, at least 60-second gap, current stopped pair and zero lifecycle work. Site second: require a fresh successful `mixed` gate proving new executor, old Site, unchanged legacy rosters, empty new stores and stopped settings. Use actual immediate native deployment lists for both roles (<120 seconds) and ensure prerequisite gate age is under 15 minutes from collection start. Both roles have one exclusive attempt/result path; retain an unknown result without repeat. No broad retry for writes.

Use C5 `neutral()`, pinned CLI and bounded child execution (90 seconds for deploy), exclusive identical short config copy and safe fixed error projection. Validate CLI binding/output projection with C5 functions against the exact role config. Record new version ID only from actual successful CLI output; do not treat CLI success as native mapping. Root runs mixed/paired reads after each deployment. Keep all encrypted secret names/settings unchanged; strict conflicts stop for diagnosis rather than weakening flags. Record command timestamps, hashes, actual predecessor evidence, decision refs and mutation-attempt status.

## Validation and execution order

- [ ] Syntax checks on new modules and focused offline tests of changed four-Workflow mapping, unexpected/duplicate identity, empty-store refusal, maintenance flag, stale gate and no-repeat command guards. Use synthetic fixtures only in explicitly offline tests, never as operation evidence. Run no cloud calls during implementation/review.
- [ ] Independent specification then quality review; root verifies exact code/results and writes tooling acceptance.
- [ ] Root collects a new complete C5 first/second pair using the accepted metadata wrapper, then executes executor once, mixed mapping, Site once, paired mapping. Save real new Workflow ID/inventory only on pass.
- [ ] Keep schema application and all start/status/fault/replay/closure tools as the next bounded work item. Finish those tools before any attended activation. Do not claim Task15 complete.

Self-review: this plan handles the new manifest shape, empty schema, mixed pair, preserved legacy resources, actual new Workflow identity, stale read evidence and ambiguous writes. Existing deployment authorization covers this isolated operation. No new paid Research or secret entry is included.
