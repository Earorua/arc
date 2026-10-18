# Arc v8 restricted environment initialization implementation plan

> **For agentic workers:** Use superpowers:executing-plans for this sequential operational plan. Review any new bootstrap or database mutation component with SPEC then QUALITY before use. Steps use checkbox syntax. Existing local/deployment authorization applies; fresh attendance is needed for Task15, and a separate concrete permission is needed for the later paid attempt.

**Goal:** Prepare the existing authenticated migration shadow and a separate private production Executor for a closed, restricted Research acceptance deployment, preserving destination accounts and data.

**Architecture:** Reuse the existing migration shadow Site, D1 and proof bucket after native verification and backup. Create a distinct Executor D1, receipt bucket and Workflow. Register the new Executor with an inert private bootstrap so required secrets can be configured before the exact closed product deployment. Then deploy the Executor against the already existing Site, followed by the Site against that Executor.

**Tech Stack:** Existing Node24, pinned Wrangler4.92.0, Cloudflare Workers/D1/R2/Workflows, accepted paired builder/checker, existing production signed service bindings.

---

## Status and roots

This plan is local preparation. Task15 attended mock acceptance and closure remain incomplete. No operational inventory, bootstrap Worker, cloud resource, secret, SQL mutation, active target, paid request or DNS change has been created by this plan.

- W = `C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta`.
- C = `C:/Users/XF/.codex/worktrees/arc-v8-release-integration/v8-openrouter-research-beta`.
- R = W/`outputs/local-durable-executor-20261016/restricted-deployment-preparation-r1`.
- Later operational directory O = W/`outputs/restricted-research-initialization-r1`, created exclusively only after Task15 closure. Do not reuse a partially consumed operation directory.
- The accepted local pair is `research-local-closed-20261016-r3`. Its synthetic target is **never** the deployment inventory. Root acceptance SHA256: `47aa2fbd0972f080d46bae3df23bfc2be75b8eb8eee67a5d8fdf5c78c0d1e52a`.
- Current schema reference: R/`schema-preparation.json`, SHA256 `a7706582ee4b88e956f35de0d671d4f12077f13c1019f9f06723563d2efdb1d4`.

The local reference executes the accepted SQL in memory: Site13 migrations,48 tables,142 indexes,17 triggers; Executor4 migrations,7 tables,9 indexes,6 triggers. It includes every column, index column/collation, foreign-key action, CREATE/CHECK/trigger SQL, prefix fingerprints, and fixed read-only inspection queries. All322 query statements were exercised locally. This does not establish the live migration ledger or live schema.

## Selected identities and preservation

The following are a deployment selection, not fresh native evidence:

| Role | Selected name / historical identity |
| --- | --- |
| Site | `arc-v8-migration-shadow-20260922` |
| Site origin | `https://arc-v8-migration-shadow-20260922.23711031.workers.dev` |
| Site D1 | `arc-v8-migration-db-20260922`, historical UUID `83a47917-a4f4-4121-baad-1032677f18a8` |
| Site proof bucket | `arc-v8-migration-proofs-20260922` |
| New Executor | `arc-v8-migration-research-executor` |
| New Executor D1 | `arc-v8-migration-research-executor-db` |
| New receipt bucket | `arc-v8-migration-research-receipts` |
| New Workflow | `arc-v8-migration-research-workflow` |

Retaining the Site identity preserves its existing OAuth callback URLs and configured login secret. Preserve its internal user/provider/account IDs and data; do not merge accounts by email. The old Sites database export and public arcmaps.net cutover remain Task17 work. The selected new resources must be absent before creation; an unexpected existing resource requires reconciliation, not adoption or deletion. Record returned native IDs instead of inventing UUIDs.

## Task 1: establish the live baseline after Task15 closure

**Inputs:** actual completed Task15 acceptance and closure; r69 local pair acceptance; fixed current account `54eaadb89014252836694203c1e22546`; current authenticated CLI context.
**Outputs:** O/`native-before/`, a version/resource manifest, a recorded rollback candidate, and a verified destination identity record.

- [ ] Inspect actual Task15 scenario results and closed-state native evidence. A local static acceptance, an expired window or an empty local command directory is insufficient. Do not run these operations during Task15's quiet observation window.
- [ ] Use bounded authenticated reads in the same fixed account to capture current Site deployments, version/configuration, DB/bucket bindings and secret **names/types**. Compare the Site origin/name/DB UUID/bucket with the table above and `C/cloudflare.shadow.json`; differences stop execution for reconciliation.
- [ ] Record both public route and preview/version URL settings. Preserve the Site's existing domain behavior; do not add arcmaps.net or modify DNS. Verify its Research/AI flags are disabled and inspect outstanding Research state before changing its schema or code.
- [ ] Obtain the test owner's current internal ID from the actual authenticated Site session and verify that same ID in the destination users/accounts relationships. Record only the ID and verified relationship needed for the operation; do not print cookies, session tokens, provider tokens, names/emails or complete rows. Identify a distinct authenticated owner B for later isolation checks. Do not derive either ID from email or a synthetic fixture.
- [ ] Read name availability for the three new resource names and Workflow/Worker identity. Preserve command, time, exit and bounded native result. If transport acknowledgement is uncertain, query the same identity before any retry.

## Task 2: back up and reconcile destination data

**Inputs:** verified Site D1/proof bucket identity, pinned repository SQL and R's reference schemas.
**Outputs:** private backup with restore evidence; exact current schema/ledger report; reviewed ordered migration delta.

- [ ] Back up the existing Site D1 before mutation. Use the installed Wrangler directly, with explicit verified account/config and exact DB name. Its fixed export arguments are `d1 export arc-v8-migration-db-20260922 --remote --output C:/Users/XF/.codex/private-backups/arc-v8/restricted-initialization-r1/site-d1-before.sql`. Exclusively create that owner-restricted backup directory outside all repositories and deployment inputs; if it exists, preserve it and stop to prepare a separately named attempt. Confirm ownership/access controls before export, and capture only backup hash/size and completion in ordinary reports. Exported authentication data must never enter chat or regular command logs.
- [ ] Restore that private export into an isolated local SQLite database; compare schema, table counts, foreign-key integrity and backup contents through local code that emits aggregates only. Do not claim a successful export alone proves restoration. Keep the existing Site available in its disabled-Research state; this destination backup is not the eventual consistent old-Sites cutover backup.
- [ ] Capture a schema-only export and discover ledger tables with the following read before querying any ledger:

```sql
SELECT name FROM sqlite_schema
WHERE type='table' AND name IN ('d1_migrations','__drizzle_migrations')
ORDER BY name;
```

Inspect only the actually present ledger schema/rows. Compare the schema with every pinned migration prefix. Historical records indicate seven migrations in the first shadow deployment, but the current delta is determined from native evidence, never that old count. A missing ledger is not proof of an empty DB; do not run all thirteen CREATE migrations against existing tables.

- [ ] Use schema-only export first. R/`site-schema-read-only.sql` and `executor-schema-read-only.sql` are fallback structural queries, not ready-to-run migration scripts. Execute only necessary statements in bounded batches; account for D1-managed metadata tables separately. Compare semantic structure and CHECK/trigger bodies, not raw SQL hash alone across SQLite versions.
- [ ] Produce the exact ordered delta from the accepted files. If live state is a known prefix, preserve the unchanged prefix and apply only subsequent migrations through its verified ledger mechanism. If schema and ledger disagree, stop writes and resolve the discrepancy locally against the restored copy. Never mark historical migrations applied merely to silence a tool.
- [ ] Exercise the proposed delta on the restored copy and verify unchanged existing data/IDs, final48-table schema, all expected indexes/constraints/triggers and zero FK violations. Review this bounded delta before applying it once remotely, then re-read actual schema/ledger and preservation aggregates. No broad test suite rerun is needed without new code or a concrete failure.
- [ ] Inventory proof objects and metadata and ensure private storage. Copy any existing objects into the same private backup scope, verify bytes/hash/metadata and restoration mapping. Empty UI counters are not an object listing; preserve pagination/complete-list evidence. Do not overwrite or delete destination objects.

## Task 3: initialize the private Executor and secrets

**Outputs:** native new resource identities; empty initialized Executor D1; private receipt bucket; reviewed inert bootstrap; secret-name/type records. Production source and the accepted final artifact are unchanged.

- [ ] Create the new Executor D1 and private receipt bucket once, recording native IDs. Verify exact account/names, no cross-role or smoke resource reuse, complete empty D1/object scope, disabled R2 public endpoint and no custom domain. Apply the four accepted Executor migrations only to this confirmed new empty DB. Verify its seven-table schema, immutable triggers, zero jobs/deliveries/nonces/results, and exactly the migration-seeded maintenance cursor/schedule rows described in R's local seed counts.
- [ ] Prepare this minimal bootstrap module under O/`executor-bootstrap/index.mjs` and an exact separate configuration. It is infrastructure registration only, never a Research artifact or a public endpoint:

```js
export default {
  fetch() {
    return new Response(null, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  },
};
```

```json
{
  "name": "arc-v8-migration-research-executor",
  "account_id": "54eaadb89014252836694203c1e22546",
  "main": "index.mjs",
  "no_bundle": true,
  "compatibility_date": "2026-05-15",
  "workers_dev": false,
  "preview_urls": false,
  "routes": [],
  "triggers": { "crons": [] }
}
```

Before use, verify the exact module/config, call its fetch locally with GET/POST and assert503/empty/no-store, and inspect that it has no imports, storage, secret, service, Workflow, scheduled or Provider capability. Obtain SPEC then QUALITY review of this small component and a bounded installed-Wrangler dry run. Do not edit or remove `secrets.required` from the final accepted product configuration to bootstrap deployment.

- [ ] Deploy this bootstrap once, capture its exact version, and natively verify disabled workers.dev and version URLs, no routes/custom domains/Previews/Cron. Only then ask the user to configure its three Secret values. The selected Site already exists, so the later full Executor can bind to it before the Site receives its reciprocal binding. Do not enable a temporary public Executor to resolve dependencies.
- [ ] Retain the Site's existing five login Secrets. Have the user securely configure three additional Site Secrets: `ARC_AI_IP_HASH_SALT`, `ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX`, `ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX`. Configure the same directional secrets on the new Executor, plus its dedicated non-renewing capped `OPENROUTER_API_KEY`. These are fresh test-environment credentials; rehearsal A/B/C are not production credentials. Only the user handles values through the intended secret channels. Check names/types after configuration, never values.
- [ ] Record distinct new bridge key IDs, actual owner ID, and returned resource identities. Key IDs identify the credentials; they contain no secret material. Keep both services closed throughout credential updates. Secret configuration does not authorize any model request.

## Task 4: build and deploy the exact closed pair

**Inputs:** verified actual resource identities, owner ID, new key IDs, complete private secret metadata, accepted source freeze and validated schema/backup.
**Outputs:** exact actual target, new exclusive paired artifact, two bounded deployments, native closed-state readback.

- [ ] Only now create O/`research-acceptance-closed.json` using the accepted strict inventory contract with `state:"closed"`, the verified existing Site identities and the verified new Executor identities. The runtime origins are the canonical corresponding workers.dev origins used as signed audiences; the Executor origin is not a public route. Do not copy the local synthetic target or supply arbitrary overrides.
- [ ] From C, run the already accepted builder against that file with a fresh exclusive candidate name, then its separate checker. Record exact source, inventory and artifact hashes, build/check exits and input graph findings. The actual deployment inventory requires a new pair build; a renamed synthetic artifact is invalid. Re-run affected tests only if sources change or evidence reveals a failure.
- [ ] Run bounded installed-Wrangler deployment dry runs against the **generated** configs, without editing them. Preserve accepted outputs; keep operational logs outside artifact directories. The final Site requires eight named Secrets and the final Executor three, as specified by the generator. Missing credentials stop deployment.
- [ ] Deploy the closed full Executor first, bound to the existing Site, then deploy the closed Site, bound to that Executor. Use the exact generated configs, fixed installed Wrangler and captured artifact hashes. The full Executor deployment establishes its exact `ResearchWorkflow` binding; no Workflow instance is started. Record upload and trigger outcomes separately. Any unknown result requires native reconciliation of that same deployment before further action.
- [ ] Re-read both actual deployed versions, complete bindings/vars/secret names/types, workflow/class/script mapping, routing/preview state, private bucket settings and empty Cron list. Verify Site AI/Research=false; Executor accept-new=false and maintenance=false; one reciprocal service binding each; separate DBs/buckets; OpenRouter key only on Executor; no OAuth or Site DB/proof bucket on Executor. The Site still shows the required development banner and preserves Google/GitHub login.
- [ ] Produce a closed-environment acceptance that states exactly what was verified. Deployment success and matching binding configuration do not prove signed live connectivity. Leave admission closed until the next gates below pass.

## Following gates, retained in the full goal

1. Review and perform the bounded one-owner cohort update, preserving the previous row for rollback. The exact enabled cohort must be `{ "userIds": [actualOwnerId] }`; omitted `userIds` means all users in current code. Compare the authenticated session to that ID, and prove distinct owner B is excluded. While global flags are closed, `eligible:false` alone does not prove cohort isolation.
2. Verify both signed private communication directions in a non-admitting closed state using a reviewed bounded probe. It must exercise actual production adapters and authentication, record only bounded results, and avoid Workflow creation, Provider calls or fake production results. Do not equate the earlier smoke transport or local integration tests with this live production check. A missing reviewed live probe is explicit remaining work, not permission to open admission.
3. Freeze and review the exact active deployment and one-shot request/recovery/closure procedure. Immediately before the paid attempt, verify the current model and dedicated key cap. Obtain fresh concrete one-shot authorization for the exact owner/candidate/model,32k output/low reasoning,20-minute Provider/21-minute lease,USD5 maximum,zero repair/paid retries. Reconcile uncertain acknowledgement against the same job.
4. Complete the real Ready result, course/citation quality, durable task recovery, selected-goal activation, saved learning plan, Proof/attachment and owner-B isolation checks. Then finish old-site complete export/restore, account continuity, domain/OAuth cutover, rollback and Task17 public verification. No local/closed acceptance completes the public-release goal.

## Inspected implementation and official references

Installed Wrangler4.92.0 `wrangler-dist/cli.js` has `addRequiredSecretsInheritBindings` around299192: a new ordinary deployment with missing required Secrets is refused. Its `createDraftWorker` around242861 uploads a generic module without this plan's explicit routing controls. Therefore this plan uses a reviewed explicit private bootstrap instead of relying on implicit secret-put registration. Its workflow trigger deployment around291093 registers the configured Workflow/class/script; that is not an instance start.

- [Cloudflare required secret validation](https://developers.cloudflare.com/workers/configuration/secrets/#validate-secrets-before-deploy): required names are checked on deploy/upload; secret changes can create/deploy versions, so read back the version after user configuration.
- [Cloudflare service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/): the same-account caller declares its callee; each Worker deploys separately. Reusing the existing Site resolves the final reciprocal dependency order.
- [Cloudflare workers.dev controls](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/) and [Version URL controls](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/): keep both explicit disabling fields and verify native state. Branch Previews are separate; this plan never creates one.
- [D1 export and migration commands](https://developers.cloudflare.com/d1/wrangler-commands/): schema-only and full exports serve different checks; migration apply is not evidence that a pre-existing ledger is accurate.

## Self-review

The plan preserves the accepted target's policy, exact artifact checks and private transport. Actual cloud identity, data backup/restoration, live ledger reconciliation, required-secret initialization, reciprocal deployment order and native privacy checks each have a concrete step. It does not mutate accepted sources, relabel fixtures, drop login/account state, waive Task15 or reuse a consumed paid permission. The new bootstrap is explicitly separate, inert and reviewed before deployment. Live signed connectivity/cohort/paid/public acceptance remain explicit subsequent components; they are not claimed by initialization. No cloud commands or bootstrap files were created or run while writing this plan.
