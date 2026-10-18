# Arc v8 snapshot no-start manifest materialization

> **For agentic workers:** Use superpowers:subagent-driven-development for one local implementation task, followed by separate SPEC then QUALITY review. Root alone materializes the final files after reviews. Use the existing isolated worktree; no commits, staging, network calls or cloud operations belong to this task.

**Goal:** Produce the two exact no-start configuration files for the three newly created snapshot resources, using the repaired Site artifact and unchanged Executor artifact.

**Architecture:** Carry forward the already approved fresh isolated rehearsal design and the 2026-10-13 no-start manifest transformation. Replace its obsolete C5/resource validator with the accepted 2026-10-17 closed predecessor and actual resource-creation evidence. Transform only the new storage identities, non-secret signing key IDs and the addition of a fifth Workflow declaration. Preserve all existing runtime behavior, artifacts, secret names and four legacy Workflows.

**Tech Stack:** Node 24 ESM, local JSON/JSONC, SHA-256, existing accepted guards and creation validator. No child process is needed.

## Scope and fixed inputs

W is `C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta`.
O is W`/outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261017-snapshot`.
R is W`/outputs/local-durable-executor-20261017`.

Read the existing O `closed-predecessor.mjs` and `create-fresh-resource-r1.mjs`; do not edit either or any accepted file. Their existing functions `loadToolingContext`, `loadFreshPair`, `assertDispatchPins`, `assertPriorCreation`, and `g` validate the actual prior graph. This task adapts the old assembler at W`/outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261013-guarded/assemble-concrete-manifests-r1.mjs`; inspect and pin its actual hash as derivation evidence, but do not execute it or use its C5 state as the current baseline.

| Fixed accepted input under O | SHA-256 |
| --- | --- |
| candidate-preparation.json | 6f9194fdfa6f7715f76cb2eebaec21a0836c9568594d3796e2a01d6604220e6f |
| root-tooling-acceptance-r1.json | ede9a26d77a6a7b0198d4909441a2ec9a8a0c04e6b397d93b1732ca6f428ca5c |
| root-resource-creation-acceptance-r1.json | fb7521c24267b6ce7798f3d798f01b5bea98eb9e8514cd60fa0c1f2c8e3c1f9a |
| fresh-r2-privacy-r1.json | a7c2a5db62e9786facaaeb169f57f14588d83157888a56b1dcfddc0e2d174ba4 |
| fresh-r2-user-objects-r1.json | baf53dfa0819ce858bc8f32db5701db056541f88d2eeedd8724a9b768eb55ae5 |

The account is `54eaadb89014252836694203c1e22546`. Actual resources, already created once and never recreated:

```js
const resources = {
  siteD1: {name:'arc-v8-smoke-site-db-20261017-snapshot',id:'ab1c37a2-dd68-482d-8cbf-4175cfd4480b'},
  executorD1: {name:'arc-v8-smoke-executor-db-20261017-snapshot',id:'ea89c802-37ba-496d-960f-b4e1403c3afe'},
  receipts: {name:'arc-v8-smoke-receipts-20261017-snapshot',id:'arc-v8-smoke-receipts-20261017-snapshot'},
};
```

Source configs are exactly `ctx.state.configs` from the accepted closed predecessor:

- Site: W`/outputs/local-durable-executor-20261016/completed-ack-snapshot-cloud-tools-r3/wrangler.site-repair.json`, SHA `ae7537ec6d8d3db6b932e00273eff4c2e8895eb224b82ffc579ba0d025c6109d`.
- Executor: W`/outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261013-guarded/scenario-ops-r9/wrangler.maintenance-close.json`, SHA `32638256983d6447b60efecfd99d36e5b1cce363e8776e57e4899652c9dfedd8`.
- Site artifact SHA `443e7fd5d9a54e42f5a321f24d8b5c9a3bc12f47aa222702e665bd2f030c6993`; Executor artifact SHA `b8a8faea136b335f58042f2bf7106ecbb13db30add7a78c16e200d6e192e4cfb`. Each original `main` path is absolute and must remain identical.
- Preserve W`/outputs/local-durable-executor-20261012/successor-preparation/migration-hashes.json`, SHA `66e8d032462102db9ce174d841ad2572b34ed6b36238c8538598e67ceecd1d60`, and the exact role-contained migration directories. Its 20261012-ack epoch is historical schema provenance, not new resource identity. Exactly 18 migrations: Site 13, Executor 5.

All existing approvals for isolated rehearsal preparation remain applicable. This is a concrete continuation of that design, not a new production or model test. Root's actual cloud reads, three resource creations, private-access readbacks and user Objects-list check are recorded in R`/continuation-from-r107.md`.

## Task 1: Local assembler and focused verification

Create only these new files under O:

- `snapshot-manifest-inputs.mjs`: fixed anchors; validates accepted context, actual ordered creation and privacy/Objects evidence, original configs/artifacts, and 18 migrations; no output mutation.
- `snapshot-manifest-transform.mjs`: pure role-specific transform and exact reverse comparison.
- `assemble-concrete-manifests-r1.mjs`: no-argument local entrypoint; calls validators, builds JSON in memory, rechecks all inputs, then writes one exclusive `no-start-r1` directory.
- `snapshot-manifests.test.mjs`: focused offline behavior tests; no child/cloud calls or fake operation results.
- `manifest-implementation-report-r1.md` plus actual retained RED/GREEN/syntax evidence.

Root's later successful invocation creates only `no-start-r1/wrangler.site.jsonc`, `wrangler.executor.jsonc`, `artifacts.json` and `linkage.json`. Existing source files and operation evidence are immutable. Do not invoke the entrypoint's successful materialization during implementation or review.

- [ ] Load and verify the exact pinned inputs. `loadToolingContext()` is local-only and validates the accepted repair/portable graph and ordered reviews. Verify the pinned resource acceptance v2 has the expected operation/account/epoch, actual exact identities, three ordered evidence entries and exact `tooling`/`preparation` references. Demand exact six files in `provision-r1`. Use `g.jsonRef` on each acceptance-bound attempt/result, and `assertPriorCreation({...ctx,gateReference},role,result,attempt)`; compare each attempt's `priorResults` to the already visited result references. Require no error field, zero controls/models, nonfuture ordered actual timestamps and results ending before creation acceptance. Validate both complete native observations at `closedPair.validatedAtActualLastCreation`, which must equal the actual receipts result end, with `loadFreshPair`; this is historical local derivation and must never be represented as fresh authorization for another mutation. Verify acceptance's first/second refs equal that pair. Verify privacy and Objects refs and exact receipts creation reference; privacy requires exactly two successful fixed readbacks, Objects evidence must be direct user report, not aggregate usage or invented browser verification. Return all actual input references for final rehashing.

- [ ] Verify the migration manifest's schema/version, count, per-role counts and exact directory membership. Each `m.path` must resolve under the preserved `migrations/{role}` folder with basename exactly `m.name`; names and paths must be unique. Verify each hash and byte count and `byteEqualToAllPredecessors===true`. Validate each source config's account/name/main/artifact, sole D1 binding, unchanged migration path, expected old D1 IDs, expected Site `workers_dev:true`, Executor `workers_dev:false`, preview false and empty routes. Existing artifact bytes must match the two accepted hashes above. Do not build either artifact.

- [ ] Write failing pure-transform tests before implementation. Read the real original config JSON as fixture inputs, clone only in memory, and expect failure for an unexpected role, wrong account, changed old D1 binding, already-replaced resource, changed artifact path, duplicate/missing legacy Workflow, enabled maintenance/admission, nonempty Cron, changed secret-name list, or any unapproved difference. A correct transform must preserve all original fields except the exact replacements and must reverse byte-equivalent JSON values back to the source. Pin the exact new resources instead of accepting arbitrary caller identities. Tests must not create `no-start-r1`, operation gates, reviews or root acceptance.

- [ ] Implement these exact transformations. The pure transform may use a fixed validated input contract, but must itself reject altered source identity/settings and an unknown role. Source references/hashes and artifact bytes are validated in the input loader. The core delta is:

```js
const nextWorkflow = {binding:'RESEARCH_WORKFLOW',name:'arc-v8-smoke-workflow-20261017-snapshot',class_name:'ResearchWorkflow'};
const oldWorkflows = [
  {binding:'RESEARCH_WORKFLOW',name:'arc-v8-smoke-workflow-20261013-guarded',class_name:'ResearchWorkflow'},
  {binding:'RESEARCH_WORKFLOW_LEGACY_20261012_ACK',name:'arc-v8-smoke-workflow-20261012-ack',class_name:'ResearchWorkflow'},
  {binding:'RESEARCH_WORKFLOW_LEGACY_20260921',name:'arc-v8-smoke-workflow-20260921',class_name:'ResearchWorkflow'},
  {binding:'RESEARCH_WORKFLOW_LEGACY_20261005_REPLAY',name:'arc-v8-smoke-workflow-20261005-replay',class_name:'ResearchWorkflow'},
];
// After fixed-source identity/settings validation:
const config = structuredClone(original);
const storage = resources[role === 'site' ? 'siteD1' : 'executorD1'];
config.d1_databases[0].database_name = storage.name;
config.d1_databases[0].database_id = storage.id;
config.vars.ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID = 'smoke-s2e-20261017r1';
config.vars.ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID = 'smoke-e2s-20261017r1';
if (role === 'site') config.vars.SMOKE_CONTROL_KEY_ID = 'smoke-control-20261017r1';
else {
  assert.deepEqual(original.workflows, oldWorkflows);
  config.r2_buckets[0].bucket_name = resources.receipts.name;
  config.workflows[0].binding = 'RESEARCH_WORKFLOW_LEGACY_20261013_GUARDED';
  config.workflows.unshift(structuredClone(nextWorkflow));
  assert.equal(config.workflows.length, 5);
  assert.equal(new Set(config.workflows.map(x => x.binding)).size, 5);
  assert.equal(new Set(config.workflows.map(x => x.name)).size, 5);
}
const reversed = structuredClone(config);
reversed.d1_databases[0].database_name = original.d1_databases[0].database_name;
reversed.d1_databases[0].database_id = original.d1_databases[0].database_id;
for (const key of ['ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID','ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID']) reversed.vars[key] = original.vars[key];
if (role === 'site') reversed.vars.SMOKE_CONTROL_KEY_ID = original.vars.SMOKE_CONTROL_KEY_ID;
else {
  reversed.r2_buckets[0].bucket_name = original.r2_buckets[0].bucket_name;
  assert.deepEqual(reversed.workflows.shift(), nextWorkflow);
  reversed.workflows[0].binding = original.workflows[0].binding;
}
assert.deepEqual(reversed, original);
```

No other change is allowed. Preserve every secret name/type specification, service binding, compatibility field, limit and observability setting. Executor admission and maintenance remain the string `false`, `triggers` remains `{crons:[]}`, and no real-provider credential/configuration is added. Both main paths and artifact bytes stay unchanged. New key IDs are ordinary labels; do not read or rotate A/B/C secret values. The new Workflow declaration is a proposal for a later deployment, not evidence that it exists.

- [ ] Build output metadata from actual values. `artifacts.json` must include `schemaVersion:'arc-concrete-no-start-manifests-v2'`, current `preparedAt`, `epoch:'20261017-snapshot'`, account, resources with exact attempt/result refs, and `configs` entries shaped `{role,config,sourceConfig,artifact}`. Include the proposed five Workflow declarations and four preserved legacy binding names. State `workflowCreated:false`, `cloudReads:0`, `cloudMutations:0`, `credentialReads:0`, `secretValuesRead:false`, `providerCalls:0`, `controlCalls:0`. Mark native mapping, empty databases/schema checks, deployment, Workflow creation and scenarios pending. Reference the accepted historical R2 privacy/user Objects evidence separately; do not claim a new R2 read from the local assembler.

`linkage.json` uses `schemaVersion:'arc-concrete-no-start-linkage-v2'` and binds this exact plan, all three new runtime files, the old assembler derivation source, accepted preparation/tooling/resources, privacy/Objects, both original configs/artifacts, historical pair, full actual creation evidence, preserved migration manifest and all 18 migration refs, allowed field deltas with reverse comparison, and the exact `artifacts.json` hash. State `schemaSourceEpoch:'20261012-ack'`, current epoch and account, `actualNativeReadbackPending:true`, `successorWorkflowCreated:false`, `schemaAccepted:false`, `scenariosPassed:false`, `task15Accepted:false`. Do not invent a Workflow ID, deployed version, schema acceptance or test completion.

- [ ] Recheck every bound input, each existing pin from the loaded context, migrations, creation files and output nonexistence immediately before writing. Serialize with `JSON.stringify(value,null,2)+'\n'` in UTF-8 without BOM. Create output directory exclusively, then each of its four files using `flag:'wx'`. If a partial write occurs, retain it and refuse the next invocation; do not delete/retry/adopt it. Use fixed safe error codes/stage names rather than dumping arbitrary caught objects. CLI accepts no arguments. Imports must be side-effect free; use a main guard to keep pure tests local. Add no generic deployment APIs or unnecessary abstraction.

- [ ] Run the focused tests and syntax-check the four new modules. Keep actual failing then passing logs, and document implementation changes and limits. Test refusal with invalid arguments without materialization, and verify no output directory was created by tests. Existing accepted broad product suites and builds stay untouched. Do not rerun them.

- [ ] Complete self-review, then hand off actual code/evidence. SPEC review precedes a different QUALITY reviewer, each inspecting the final candidate. Root reads their findings before authorizing local materialization; the implementer and reviewers must not create root acceptance or the successful output directory. No additional user permission is needed for this already-authorized local preparation.

## Root execution and following work

After actual local reviews pass, root invokes the no-argument assembler once and inspects each file's hash, complete field delta, preserved 18 migrations, repaired Site/unchanged Executor, actual new storage IDs and exactly five Workflow declarations. Record root materialization acceptance binding actual review/code/output refs. Same-config local Wrangler dry runs and independently reviewed fixed no-start deployment/schema tools follow using actual artifact refs. Those later operations need fresh cloud predecessor observations; the pair used to create storage is not renewed or re-used after its freshness window.

No schema, deployment, cron, Workflow start, control call, model request, production/Sites/DNS change occurs in this task. The next live rehearsal still requires all LONG/status/fault/replay/close tooling ready before any attended C input. Task15, Task16 and Task17 remain incomplete.

## Self-review

This scope retains the accepted architecture and existing credentials, handles the repaired Site artifact, binds actual newly-created resources, preserves all four old Workflows, rejects unknown/preexisting identities, and avoids old-clock renewal. All transformation and failure requirements have concrete inputs, checks and output paths. No arbitrary target or remote command surface is added.
