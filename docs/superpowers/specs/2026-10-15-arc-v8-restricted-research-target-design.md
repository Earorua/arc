# Arc v8 Task16 — restricted Research target design

Prepared locally while attended Task15 cloud acceptance is deferred by the user. This is the next configuration component, not an implemented or deployable target. No actual new resource IDs, credentials, operator readiness or paid permission are supplied by this document.

## Why a new target is needed

The accepted integration candidate's `build/cloudflare-target.ts` emits only local/Research-disabled shadow configurations. `scripts/check-cloudflare-build.mjs` compares the full generated manifest, including normalized defaults, with that exact expected configuration. The existing validator must remain strict. Adding vars by hand after that check would invalidate its guarantee.

The production private-bridge component is specified separately in `2026-10-15-arc-v8-production-private-bridge-design.md`. This target must select that explicit service-binding mode. The target does not make the current mock resource inventory suitable for real traffic.

## Selected approach and alternatives

Add a separate strict `research-acceptance` inventory branch and deterministic paired Site/Executor config generation. Keep default local and existing shadow parsing and emitted values unchanged. This gives the first real run an explicit scope and makes unknown configuration a build failure.

Rejected alternatives: add optional arbitrary Research vars to shadow (weakens its intentionally disabled contract); immediately add a general public-production target (prematurely mixes initial real acceptance with final migration/cutover).

## Exact inventory contract

Required top-level fields only:

| Field | Contract |
| --- | --- |
| stage | literal `research-acceptance` |
| accountId | existing account `54eaadb89014252836694203c1e22546` |
| state | `closed`, `active`, or `draining`; no implicit default |
| site | workerName, runtimeOrigin, d1 {databaseId,databaseName}, r2 {bucketName,public:false} |
| executor | workerName, runtimeOrigin, d1 {databaseId,databaseName}, r2 {bucketName,public:false}, workflowName |
| bridge | transport literal `service-binding-v1`, siteToExecutorKeyId, executorToSiteKeyId |
| acceptanceOwnerId | one nonempty trimmed internal user ID, max160 characters, no control characters |

Object shapes are strict at every depth. Worker/DB/bucket/workflow names use the existing migration resource prefix, lowercase letters/digits/hyphens and max63 length. Reject names containing `smoke`, the local sentinel, all archived mock identities from the approved resource inventory, and cross-role identity reuse. Site and Executor Worker names/origins must differ; D1 IDs must be UUIDs and distinct; proof and receipt bucket names must differ. Key IDs follow the existing 1–32-character bridge rule and must differ.

Canonical Site and Executor origins are exactly `https://<corresponding workerName>.23711031.workers.dev`, no slash/path/query/credentials/fragment. The Executor URL is the HMAC audience used with the private binding; it does not imply that public workers.dev access is enabled.

Use real resource identities only after native readback/creation. Unit tests may use explicitly synthetic inventories but those fixtures must never become an operational target. The existing migration-shadow JSON is a source inventory, not fresh proof that the live schema or destination is ready.

## Deterministic pair generation

Common state behavior:

| State | Site AI and Research flags | Executor accept-new | Executor maintenance | Executor Cron |
| --- | --- | --- | --- | --- |
| closed | false / false | false | false | [] |
| active | true / true | true | true | ["* * * * *"] |
| draining | false / false | false | true | ["* * * * *"] |

All states keep the same bindings, HMAC origins and key IDs so existing work can be read or drained. `draining → closed` is an operational transition only after native proof of no unfinished jobs/receipts/outbox/leases; the string enum alone is not drain proof. Do not close admission before the accepted task's begin lease is confirmed.

Site config retains ASSETS/DB/PROOF_ASSETS, OAuth/auth values as required secret **names**, production environment, exact origin, preview URLs off and a public Site workers.dev endpoint. Its only service binding is `{binding:"ARC_RESEARCH_EXECUTOR",service:executor.workerName}`. It has no Workflow, Executor DB, receipt bucket or OpenRouter key.

Executor config uses the production `worker/research-executor/index.ts` build, `EXECUTOR_DB`, private `EXECUTOR_RECEIPTS`, a single `RESEARCH_WORKFLOW` with class `ResearchWorkflow`, and `{binding:"ARC_RESEARCH_SITE",service:site.workerName}`. Set workers_dev=false, preview_urls=false, routes=[] explicitly. It has no OAuth secret, proof bucket or Site DB. Actual public-route absence is later checked natively, not inferred from config alone.

Both set the bridge transport and existing two directional key IDs/origins. Required secret names are:

- Site: existing five login secrets, `ARC_AI_IP_HASH_SALT`, `ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX`, `ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX`.
- Executor: `OPENROUTER_API_KEY` and the two directional bridge secrets.

No new target can supply secret values, generic vars, extra resources, extra services, alternate domains, extra Workflow classes or arbitrary compatibility settings.

## Fixed acceptance policy

Emit the existing accepted profile/model and bounded policy as generator constants, not caller-provided arbitrary overrides:

| Setting | Value |
| --- | --- |
| executor / transport | cloudflare-workflow-v1 / service-binding-v1 |
| profile / Research model | kimi-low-output32k-v3 / moonshotai/kimi-k3 |
| economy model placeholder required by existing policy parser | moonshotai/kimi-k3; repair remains disabled |
| Provider timeout / repair parser timeout | 1200000ms / 10000ms |
| cache days | 14 |
| user daily quota / rate per minute | 1 / 1 |
| site daily / monthly / Research maximum | 5000000 / 5000000 / 5000000 micro-USD |
| repair maximum | 0 |

The profile already fixes low reasoning, 32768 output tokens and 1260000ms lease; the Workflow keeps 21 minutes and zero paid retries. No policy or Provider default changes belong in this target task.

The amounts above constrain application admission, not the Cloudflare monthly bill or a guaranteed Provider bill. A dedicated non-renewing capped Provider key and a new concrete paid-run authorization are still required. A daily quota does not enforce a lifetime one-shot limit. Do not automatically start another paid task after failure, midnight, cache miss or uncertain acceptance.

## Cohort and account checks

`acceptanceOwnerId` is input to a separately reviewed bounded cohort update, not a secret and not permission to modify a DB at build time. Native preflight must verify `role-research-beta` is enabled with exactly `{ "userIds": [acceptanceOwnerId] }` and that the current authenticated test session resolves to that internal ID. An omitted `userIds` permits everyone in the existing implementation; never use `{}`. Reject a second authenticated owner before opening admission. Recheck the exact cohort at activation, not only during build.

Preserve current login/account IDs and do not merge users by email. Keep old-site data migration separate from test-owner creation or test data.

## Implementation map and verification requirements

1. Add strict parsing and paired generation in focused `build/research-acceptance-target.ts`; integrate the tagged branch in `build/cloudflare-target.ts` and `vite.config.ts` without changing default local/shadow outputs. Existing unknown-stage tests must still reject unrelated `production` or arbitrary tags.
2. Extend `scripts/check-cloudflare-build.mjs` with the actual target stage and its exact generated config. Add an Executor config/artifact validator for the deterministic pair. Preserve full deep equality, including locked Vite normalization defaults. Client package input must exclude server credentials and production/mock test fixtures.
3. Build the Executor into a new candidate-specific directory with exclusive evidence names. The old `build-research-executor.mjs` fixed task13 path must not overwrite the accepted baseline; introduce an explicitly bounded output option or a separate builder with tests for path containment and refusal to overwrite.
4. Add test inventories only under `tests/fixtures`. Test all states; unknown keys at each depth; wrong account, cross-role reuse, old smoke/local IDs, public receipt storage, malformed origins, missing secrets names/binding, model policy mutation, extra routes/cron/resources and plaintext injection. Test both exact pair validators against normalized generated output, not merely generator snapshots.
5. Run existing target/build tests plus new tests, main and Executor type checks and actual local Site/Executor builds to new evidence paths; inspect final input graphs and exact artifact hashes. Obtain SPEC then QUALITY review. A local dry run does not assert that cloud resources or secrets exist.

## Operational gates retained

After Task15's mock acceptance and closure: capture actual native target versions/resources, back up destination data, reconcile source/destination schema and migration ledger, secure credentials through the user, verify paired private connectivity and cohort in a closed state, then prepare an exact reviewed active deployment. Resolve any first-deployment service-binding dependencies without publishing a temporary unprotected Executor. Ask for the new paid attempt only when the exact candidate/run is ready.

No operational target JSON, cohort update, active config, new paid request, DNS change or current-user command is created by this design.
