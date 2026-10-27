# Arc v8 guarded schema initialization implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development; independent specification then quality review. Root alone executes cloud operations. No staging, commits or historical edits.

**Goal:** Initialize only the two actual new guarded databases and verify all schema, migration ledger, counts and initial maintenance rows before scenario preparation.

**Architecture:** Reuse the existing byte-identical 18 migrations and SQL-derived expected state. Bind migration dispatch to the actual passing paired no-start mapping from the preceding operation package. New output journals and readbacks stay in the guarded epoch; old resources and evidence remain untouched.

**Tech stack:** Node ESM, pinned Wrangler 4.92, D1 migrations, existing native read-only projections.

Dependency clarification after the actual no-start mixed read: use the reviewed `no-start-ops-r2` successor and its shared section-aware Workflow description parser. The actual r1 executor deployment remains immutable and is verified through r1 guards; only the Site deployment and complete mixed/paired mappings continue under r2. Schema tooling must bind the actual successful r2 paired mapping and preserve its exact new Workflow ID in all later collections. See `2026-10-13-arc-v8-workflow-description-projection-fix.md` for the observed CLI format and bounded repair. Do not freeze provisional r2 hashes or fabricate its not-yet-created preparation/approval.

## Frozen inputs

O = `outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261013-guarded`; P = preceding `cloud-ops-20261012-ack`; C5 = `outputs/local-durable-executor-20261012/maintenance-stop/cloud-r5`.

- O `root-no-start-materialization-acceptance-r1.json`, SHA `1a60126d888950d01aa5ece03fb344b690f7b87e44e1612bf0eeb584ca8c6071`.
- O `no-start-r1/artifacts.json`, SHA `fd9fbe5484146c5a2560638f0d78263136c5f9f9d97d7bf927ff2abd6a392efa`.
- O `no-start-r1/linkage.json`, SHA `14ab663b759a689a20e3983959c27fb38c3e03d8265263e8636247c24d0736e3`.
- O `schema-expectations-r1.json`, SHA `9db59bb75e827322a98525df801cd5e2bdc614f53b956cac8afdb8f76717f7e8`. This is expected state only, not cloud evidence. Verify its schema/counts/seeds against its original pinned SQL oracle and all migration hashes/bytes, not just a result label.
- Migration manifest `outputs/local-durable-executor-20261012/successor-preparation/migration-hashes.json`, SHA `66e8d032462102db9ce174d841ad2572b34ed6b36238c8538598e67ceecd1d60`. Site13, executor5; preserve existing role directories and ordered contiguous names. No copies or changes.
- Actual Site D1 `eda666b8-6d49-4c3b-aa45-59eb9ff2bf74`, executor D1 `a480e7d5-c008-46da-99bf-ca2422c06621`; exact names/roles from accepted manifests. Refuse every old D1 target.

## Task 1: Prepare bounded apply and readback tools

Create only O `schema-ops-r1/` and its implementation report. Use P `apply-fresh-migrations-r1.mjs`, P `migrations-r1/frozen-inputs.mjs`, and P `migrations-r1/post-migration-readback-r1/{collect-readback,evaluate-readback}.mjs` as reviewed reference, adapting exact new input shape and preceding new mapping contract. Never execute these historical helpers. Reuse C5 neutral environment and pinned CLI. No provider/control/activation calls.

The local guard must verify accepted manifest/config/artifact refs, current build input hashes, exact new IDs, all 18 migration files and actual reviewed mapping-tool identities. Read the preceding package's actual passing paired mapping only after it exists; no synthetic or guessed mapping IDs. Require both deployed versions from successful exclusive deployment records, maintenance/admission false, Cron empty, no new Workflow instances, all required secret names typed and exact new resource bindings. A historical mapping may establish identity, but dispatch also requires fresh actual read evidence under 15 minutes from its start and immediate native versions/target emptiness before each mutation. For the second database, allow the first database's accepted initialized schema while demanding that the second is still empty; do not incorrectly re-require both stores empty. Record this distinction explicitly.

Apply one role at a time, executor then Site. Each role has one exclusive attempt/result. The exact command is:

```js
['d1','migrations','apply',roleBinding,'--remote','--config',shortExactConfig]
```

Use a byte-identical short config, 180-second bound, safe output hashes/fixed error categories. Recheck pins and fresh prerequisite immediately before apply. No write retry, reset or delete; ambiguous apply results require native ledger reconciliation. Read back `SELECT id,name FROM d1_migrations ORDER BY id LIMIT 64` and require exact expected ordered names/IDs with native `rows_written:0` and `changed_db:false`. Successful apply/ledger is not final schema acceptance.

## Task 2: Complete native schema acceptance

Read each database's entire bounded schema listing, every application-table count, exact migration ledger and each expected maintenance seed query. Preserve P collector's SQL and safe typed projections; permit only these fixed SELECT statements. Bind all actual read command hashes, IDs, helper/request/expected refs, timestamps and successful application evidence. Use finite read transport retries only for recognized transport failures after confirmed child close; do not retry projection errors or mutations, and retain incomplete reports. A complete result must belong to one actual collection.

The evaluator must compare all 49 Site and 9 executor application tables, exact schema/index/constraint SQL, all18 ledger rows, all zero business/lifecycle/nonce/observer counts and the permitted initial seeds: Site2 cursor rows, executor3 cursor rows plus1 singleton schedule. Compare every seed field to the expected oracle. Identify D1 internal `_cf_KV`, `d1_migrations`, `sqlite_sequence` objects separately; do not treat internal counters as business data. Require read-only native metadata and timestamps after corresponding apply. Only exact equality yields acceptance; expected state alone cannot pass.

## Validation and root sequence

- [ ] Meaningful offline tests: old/wrong D1 rejection, altered migration bytes/names, missing/failed/stale paired mapping, wrong actual deployed version, existing attempt refusal, nonempty target refusal, schema/count/seed/ledger mismatch and missing read-only metadata. Label all synthetic cases offline; create no operation success fixtures.
- [ ] Syntax checks, independent specification and quality review, then root tooling acceptance with exact refs. No cloud calls during implementation or review.
- [ ] Root executes only after preceding actual paired mapping passes. Executor apply and ledger, then Site apply and ledger, then full native readback/evaluation. An unknown outcome stops that sequence for native reconciliation.
- [ ] Freeze actual initialized inventory and proceed to all local scenario/activation/closure tools. Do not enable Cron or publish a C command here. Task15 remains incomplete.

Self-review: expected schema is derived from actual byte-identical SQL; mutation targets are exact new IDs, mixed initialized/empty state is handled for sequential applies, and every success claim requires actual native reads. No old data, credential values, model calls, production or DNS changes are in scope.
