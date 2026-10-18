# Arc v8 snapshot schema initialization

> Use one implementation subagent, followed by independent SPEC and different QUALITY reviewers. Root alone runs successful preparation and cloud entrypoints. Use the existing worktree; no staging, commits, product rebuilds or historical edits.

**Goal:** Initialize the two already created snapshot D1 databases, prove their exact initial schema and data, and leave both smoke Workers closed for subsequent scenario preparation.

**Scope:** Continue the approved isolated rehearsal design and the 20261013 schema procedure. Reuse the unchanged 18 migrations and SQL-derived oracle. This adds no feature, public deployment, model call, secret configuration or new resource purchase. The 20261017 closed-deployment package must finish and pass actual paired mapping before this schema package is prepared or dispatched.

## Fixed inputs

W is the existing `v8-openrouter-research-beta` worktree. O is W `outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261017-snapshot`; N is O `no-start-ops-r1`; H is O `schema-ops-r1`, the only new implementation directory. G is the corresponding `cloud-ops-20261013-guarded` historical directory.

- Account: `54eaadb89014252836694203c1e22546`.
- Site D1: `arc-v8-smoke-site-db-20261017-snapshot`, `ab1c37a2-dd68-482d-8cbf-4175cfd4480b`.
- Executor D1: `arc-v8-smoke-executor-db-20261017-snapshot`, `ea89c802-37ba-496d-960f-b4e1403c3afe`.
- Private R2: `arc-v8-smoke-receipts-20261017-snapshot`.
- Proposed fifth Workflow: `arc-v8-smoke-workflow-20261017-snapshot`. Derive its actual ID and both deployed Worker versions exclusively from the accepted actual paired mapping. They are not known when this plan is written.
- O `root-no-start-materialization-acceptance-r1.json`: `d7534ebf3e26f4aedbc14328efdeb53bf93e147bc5d48b99038262e868877e1c`.
- O `schema-expectations-r1.json`: `18cb6a903f91a9cb318985cd0dcda9d88e45e2965cc6d254cc6e1d3ede2be318`. This is static expected data, not native evidence. Root verified its original/successor SQL oracles, exact role schemas/counts/seeds, all 18 current migrations and 54 historical byte-equivalent copies. The new guard must verify that provenance again, once before a live clock, rather than trusting this narrative.
- W `outputs/local-durable-executor-20261012/successor-preparation/migration-hashes.json`: `66e8d032462102db9ce174d841ad2572b34ed6b36238c8538598e67ceecd1d60`. Preserve exact directories, bytes and contiguous ordered names: Site 13, Executor 5.
- Pin this plan, the actual N runtime/reviews/preparation/root acceptance and actual root paired acceptance when those artifacts exist. Never freeze guessed references or fabricate an operation result. Prior materialization/dry-run/deployment records remain immutable.

## Implementation and local checks

Adapt G `schema-ops-r1` narrowly. Reuse N's actual accepted graph, neutral environment, artifact/binding/settings projection, five-Workflow parser, exact closed mapping and bounded read/write mechanics where possible. Avoid a new generic command framework. Historical operational entrypoints must never execute. Keep Node 24.14.1 and Wrangler 4.92.0 pinned, with no install or version change.

The schema guard must revalidate the actual preceding paired evidence historically at its recorded end time, using the preceding verifier; that establishes identity only. It must not renew any old freshness window. Subsequent live schema mutations require separate new complete read observations. Derive both actual deployed revisions, all five Workflow IDs/latest versions/complete rosters, both exact no-start configs, artifact bytes, native settings and new resource bindings from that paired acceptance. Preserve four old Workflows and the empty fifth roster. All admission/maintenance flags remain false and Cron remains empty.

Implement three whole-collection stages, each in a new exclusive directory, with fixed requests, command hashes, timestamps, checkpoints and safe typed results:

| Stage | Site database | Executor database | Prerequisite |
| --- | --- | --- | --- |
| pre-executor | Empty | Empty | Accepted actual paired mapping |
| pre-site | Empty | Exact initial schema/data | Successful exclusive Executor apply plus native ledger |
| final | Exact initial schema/data | Exact initial schema/data | Both exclusive applies plus native ledgers |

Each stage also verifies the complete closed Worker mapping, five Workflow definitions and rosters, final stable current revisions, and private R2 settings. Empty roles use the exact previously approved `sqlite_master` empty SELECT. Initialized roles use the fixed full schema, combined application-count, ledger and seed queries. Do not run lifecycle-table queries against an empty database or require the already initialized first database to become empty again.

Retain the prior schema collection budget of 12 minutes, a 45-second per-read bound, at most three recognized transport retries after confirmed child close, one-second backoff/close grace, output caps and no retries on projection errors or uncertain child termination. Load expensive accepted graphs before the actual collection clock; rehash frozen refs immediately before each child. Exact command allowlists must cover only these fixed Worker, Workflow, R2 and D1 reads. Preserve failed bodies; never stitch partial collections or reset a consumed output directory.

Local preparation is exclusive, includes exact runtime/input/review references and fixed role read configs, and follows separate SPEC/QUALITY review. Root acceptance binds its actual bytes. No synthetic preparation, successful observation, decision, apply or acceptance is permitted outside explicitly offline in-memory tests. Imports must be side-effect free; invalid CLI inputs must refuse before dispatch.

## One-shot initialization

Executor precedes Site. Each role has an exclusive attempt and result, one bounded mutation, no retry or adoption. A root decision binds exact target/config/migrations, operation, actual tooling/preparation, complete new stage result, original window start and actual review time. This is an internal concrete review within existing user authorization; no repeated user permission is needed.

Before applying, read both current Worker revisions and the target's exact empty query; all three reads must be under 120 seconds old at dispatch. Recheck the fresh complete gate (under 15 minutes from its actual start), root decision, pins and short config immediately before mutation. Do not refresh timestamps by loading evidence later.

The only write command is `d1 migrations apply <fixed role binding> --remote --config <byte-identical short config>`. Bound the child to 180 seconds with confirmed close, capped output, `shell:false` and `windowsHide:true`. Keep exact native environment/auth/proxy handling. Persist the attempt before dispatch and a safe result afterward. Hash output and retain fixed error categories; never persist raw CLI diagnostics or secrets. An uncertain result stops for separately scoped read-only ledger reconciliation, without a second write attempt.

After each apply, read `SELECT id,name FROM d1_migrations ORDER BY id LIMIT 64`, require exact ordered migration IDs/names and `rows_written:0`, `changed_db:false`. CLI success and ledger equality are intermediate evidence only.

## Final native acceptance

Compare the entire bounded `sqlite_master` schema listing, including SQL hashes for indexes/constraints; all 49 Site and 9 Executor application-table counts in combined fixed queries; all 18 ledger rows; and every seed field. Separate `_cf_KV`, `d1_migrations`, `sqlite_autoindex_d1_migrations_1`, `sqlite_sequence` from business data.

Only these initial rows are permitted: two Site scan cursors (`maintenance`, `outbox`, null position, version 0), three Executor cursors (`bootstrap`, `results`, `site`, null position, version 0, pickup_turn 0), and one Executor schedule (`singleton:1,next_category:0,generation:0,lease_until:0`). Every other business/lifecycle/nonce/observer count is zero. Bind post-apply timestamps, safe native metadata and actual successful apply records. Static oracle equality without actual reads cannot pass.

Focused tests must cover wrong/old targets, changed migration bytes or names, provenance mismatch, old or guessed deployed identities, nonempty target refusal, stale/renewed/stitched gates, phase-specific empty versus initialized roles, read-only metadata, full schema/count/seed/ledger mismatch, exact allowlist, write unknown/one-shot behavior and CLI refusals. Keep meaningful RED/GREEN logs, syntax checks and zero-dispatch offline refusal evidence. Do not rerun unchanged product suites.

After implementation self-review: independent SPEC, different QUALITY, root inspection and successful local preparation. Root then collects pre-executor, applies Executor once with ledger, collects pre-site, applies Site once with ledger, and collects final. Freeze only the actual accepted initialized inventory. Continue all new scenario/activation/status/fault/replay/closure tools before asking for attended C input. This package does not complete Task15 or enable public Research.
