# Arc v8 fresh rehearsal after explicit maintenance stop

Status: local design, with no resources created or scenarios started. Existing implementation/deployment authorization covers preparation of another isolated rehearsal. Real Research, production changes and secret entry remain outside this design. It does not override the unfinished stop verification.

## Reason and approach

The `20261012-ack` observer has reached its fixed 256-row limit. Retain that epoch and every failed/interrupted observation. The maintenance-stop candidate is now deployed as executor version `994b5608-2690-4327-9e80-b52ce0b6f7cc`; actual source/config mapping passed. Its delayed two-read drain and separate scheduled observation still must pass before changing any bindings.

Use the existing isolated Site/executor pair and existing encrypted A/B/C secrets, with a fresh pair of D1 databases, private receipts bucket and primary Workflow. This follows the previous isolated-epoch approach while adding explicit maintenance-off protection. Recreating the two Workers would add unnecessary credential and identity migration. Reusing the exhausted observer or removing its rows would lose evidence, so neither is allowed.

## Fixed proposed identities

- Account: `54eaadb89014252836694203c1e22546`.
- Site: `arc-v8-smoke-site-20260921`; existing version `26dff9ec-1d62-4146-afa8-71b0f7acc310` until the reviewed new no-start deployment.
- Executor: `arc-v8-smoke-executor-20260921`; stopped version above until the reviewed new no-start deployment.
- Proposed epoch: `20261013-guarded`.
- Proposed D1 names: `arc-v8-smoke-site-db-20261013-guarded` and `arc-v8-smoke-executor-db-20261013-guarded`.
- Proposed R2 name: `arc-v8-smoke-receipts-20261013-guarded`.
- Proposed primary Workflow name: `arc-v8-smoke-workflow-20261013-guarded`.
- Proposed key IDs: `smoke-s2e-20261013r1`, `smoke-e2s-20261013r1`, `smoke-control-20261013r1`. Key values are unchanged and never read by the agent.

These names are proposals, not claims of availability or creation. Actual D1/Workflow IDs must come from retained successful native operations and reads. No synthetic IDs may be inserted into verified inventories.

## Candidate and preservation

Reuse the actual reviewed `task15-maintenance-stop-cloud-20261012-r1` build: executor SHA-256 `b8a8faea136b335f58042f2bf7106ecbb13db30add7a78c16e200d6e192e4cfb`, Site SHA-256 `ae8b34fc3150c7a15a18b788848724fbb96cc036ff36a52c777cbb81fd6b6efb`, report SHA-256 `5d230b5fb56083376065a6719bef891e93d644f689152a5512eb80b4b05560bf`. Verify all current report inputs again before use; no product rewrite or historical build overwrite is planned.

Keep all three existing Workflow definitions and their exact IDs, with the old primary moved to the distinct binding `RESEARCH_WORKFLOW_LEGACY_20261012_ACK`. The new primary uses `RESEARCH_WORKFLOW`; all four declarations retain class `ResearchWorkflow` and the same executor owner. Preserve old D1/R2 resources, old Workflow instances, source artifacts and operation journals. No legacy delete/terminate/purge occurs.

The proposed new schema is byte-identical to the reviewed schema/migration chain of the previous fresh epoch. Apply it only to the newly verified empty databases. Verify table/index/constraint and migration state plus all initial lifecycle counts. Verify the new bucket's actual Objects list is empty and both public access mechanisms are disabled; aggregate usage of zero is insufficient.

## Phases and dispatch gates

1. **Finish old stop.** Bind the actual successful deployment and mapping, wait until `2026-10-13T12:28:25.642Z`, then require two complete native observations separated by at least 60 seconds. Require stable expired lease/generation/category/deadline/cursors, no outstanding lifecycle work and the exact old terminal Workflow roster. Preserve a separate native scheduled metadata observation. Do not infer platform-event absence or zero invocation fees from application quiescence.
2. **Local preparation and review.** Derive new fixed-target manifests and operation tools in a new directory, preserving the source derivation and exact allowed deltas. Use existing source/build/native projections; accommodate the fourth preserved Workflow declaration explicitly. Bind explicit maintenance mode into all native configuration checks. Prepare every local start/status/fault/replay/closure tool before activating a Cron. Independent specification then quality/safety review precede cloud operations. No repeated broad product tests are required for unchanged artifacts; test changed guards and actual command wiring.
3. **Fresh resources and no-start pair.** Check proposed names; create each exact resource once with its own exclusive journal. Ambiguous writes require native reconciliation, never blind repetition. Stage executor and Site no-start deployments only after fresh predecessor, source/resource and zero-outstanding-work proof. Executor admission and maintenance both remain `false`, Cron is empty, executor is private, preview/routes/observability remain closed, and no model key is present. Between pair updates there are no control requests. After both, verify the exact mixed-pair configuration and all four Workflow definitions before freezing the actual inventory.
4. **Attended activation.** Only when the user is ready to input C, collect a fresh complete zero-state mapping and capacity check. Activate the exact executor with admission `true`, maintenance `true` and the existing one-minute Cron. Re-read all actual fields before emitting a fresh, hash-bound one-time LONG command. Preserve the hidden-input launcher and the distinction between acknowledged, refused and acceptance-unknown; unknown means query the original job, not resubmit.
5. **Complete the real cloud simulation sequence.** Run the existing 19-minute-30-second mock LONG, query its original status from a fresh terminal, perform the two existing fixed failure cases (`after-r2`, `after-d1`), obtain independent native receipts/accounting/Workflow evidence, and run each fixed six-step replay to verify duplicate-submit behavior and owner A/B isolation. No real model, provider retry, synthetic success record or timestamp rewrite is introduced. A missed or failed scenario stays incomplete until specifically reconciled.
6. **Close and prove settled state.** Close new admission first while allowing already accepted work to finish. Require the exact expected completed job/Workflow roster and no unclaimed work, unsettled budget, pending acceptance/import/delivery or unfinished receipt cleanup. Completed historical jobs/executions are expected to remain and must not be incorrectly required to be zero. Then set maintenance `false` and Cron empty, re-read actual deployment, and perform the delayed stable-drain proof tied to that actual close. Keep resulting invocation evidence distinct from application completion.

## Capacity and time

Keep the fixed 256-row observer cap. A fresh empty epoch starts with all capacity available. The previous 116-row whole-sequence reserve is a minimum planning prerequisite, not a proof that arbitrary idle time is safe. Derive a concrete bound from actual one-minute Cron start/end events, the fixed LONG, fault and replay sequence, and the already established propagation/close windows before activation. Include failed/in-progress observation rows and unmatched starts; no optimistic completion assumptions.

Finish local implementation, reviews, resource preparation, key-ID mapping and launcher verification while maintenance is explicitly off. Do not leave Cron enabled while waiting for the user's readiness. At each attended handoff, re-read remaining capacity and current job state; if the remaining bounded sequence no longer fits, stop new submissions, settle accepted work and close maintenance. Preserve the exhausted epoch; do not increase the cap, reset counters or silently substitute another epoch.

## Proof and failure behavior

Each phase has its own immutable actual input/output chain and finite dispatch decision. Reuse the reviewed C5 bounded read-transport policy where applicable: fixed read allowlist, at most three transport attempts after confirmed child close, no retries for identity/projection failures, and an overall collector budget. Successful fragments from different collections do not form a new passing native gate.

Fresh rehearsal deployment decisions belong to this separately reviewed operation sequence after old stop acceptance. They do not reopen the consumed one-additional-attempt allowance of the completed maintenance-stop recovery, and do not authorize repeating its deployment journal.

On an unknown cloud write, reconcile the exact resource/version/job before another action. On a read failure, retain incomplete evidence and do not mutate on assumptions. Do not loosen strict configuration or privilege checks to work around an outage. Only the user supplies control secret C privately. Existing encrypted A/B/C values remain on Cloudflare/Bitwarden and never appear in source, arguments, reports or this chat.

## Completion scope and self-review

This sequence establishes Task15 cloud simulation and isolation evidence only. Task16 still requires a new explicit capped paid Research authorization and an actual model-backed result; Task17 still requires migration/export/restore, release-candidate review, public publication and post-release acceptance. Old accepted features are not reimplemented, and neither a design nor a local test closes these tasks.

Self-review: the design preserves current evidence and distinguishes proposed names from actual IDs. It explicitly handles closed-start maintenance, retained historical Workflow declarations, completed-job counts, capacity exhaustion, credential boundaries, and failed/unknown operations. No product behavior, model policy, schema or production/domain access changes are hidden in the resource-epoch change.
