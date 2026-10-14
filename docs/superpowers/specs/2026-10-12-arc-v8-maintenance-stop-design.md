# Arc v8 explicit scheduled-maintenance stop

Status: conditional local design, not implemented or deployed. First finish the bounded Cron re-registration/removal experiment and record its actual outcome. User authorization is the existing local implementation/deployment authorization and explicit instruction to continue independent troubleshooting; this document does not authorize a real model call.

## Problem and alternatives

The isolated executor receives scheduled events despite an empty management Cron list. The existing `ARC_RESEARCH_EXECUTOR_ACCEPT_NEW=false` intentionally continues maintenance for accepted jobs. Each maintenance invocation can acquire a lease and advance cursors even when no jobs exist. Therefore closing admission is not an application stop.

1. Finish the current bounded platform reconciliation. If independent observations show quiescence, continue the release plan without adding this change merely to occupy the wait.
2. If events and maintenance persist, add an explicit scheduled-maintenance switch. This is the preferred fallback: application work can stop without deleting the Worker or historical resources. It does not repair or establish the cause of the platform scheduler discrepancy.
3. Delete/recreate the Worker or wait indefinitely for support. Neither is necessary to stop application maintenance; recreation adds identity and binding migration risk. Support remains useful for the underlying platform issue.

## Narrow behavior

Add optional `ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED` to `ExecutorEnvironment`. Missing or exact `true` preserves current behavior; exact `false` disables scheduled maintenance. Other values are a configuration error with a fixed generic message and no value in logs/errors.

Production `scheduled` checks the setting before constructing any runtime, acquiring a lease, constructing a D1/R2 client or issuing an outbound request. Disabled mode returns without scheduling work. The smoke scheduled wrapper checks before constructing its evidence writer as well, so a disabled invocation does not write observer rows. Native platform events remain observable externally.

With valid disabled mode, HTTP `acceptNew` is false even if `ARC_RESEARCH_EXECUTOR_ACCEPT_NEW` is accidentally true. Apply this to both the root and request-scoped HTTP runtime, and preserve the field in the smoke runtime's sealed environment projection. Existing signed status/result/acknowledge/close paths remain available.

Disabled mode must also prevent a repeated `submit` from bootstrapping an existing unstarted job. After exact job/hash matching, return the existing durable accepted proof if present; otherwise return the existing signed temporary/unavailable error, without calling `ensureWorkflow`, creating an instance, contacting Site acceptance, or claiming durable closure. Unknown jobs keep the existing closed-submission response. Enabled/default recovery remains unchanged. The request runtime exposes this parsed mode separately from `acceptNew`, because ordinary admission closure must continue to allow already accepted work to recover.

This is not a blanket ban on all authenticated recovery I/O: status consumes a nonce and receipt recovery may repair D1. A fully quiescent deployment therefore requires an independent zero-outstanding-work check and no scenario/control requests during the observation interval.

Do not put a blanket disabled guard inside `createMaintenanceRuntime`: `ResearchWorkflow.run` uses its delivery function to finish a recorded result. Existing Workflow execution and completion must remain possible. Do not change Provider behavior, retries, timeouts, receipt validation, accounting, authentication, nonce rules, sample expiry, migration schemas or public UI.

Invalid configuration rejects scheduled work before resource access. It may make the HTTP runtime unavailable through its existing generic 503 path; normal status compatibility is promised for valid `false`, not invalid configuration.

## Operational sequence

1. Close new admission while leaving scheduled maintenance enabled.
2. Finish or settle existing work, then independently verify no unclaimed jobs, running Workflows, pending delivery/import/cleanup or reserved budget.
3. Deploy the reviewed candidate with explicit maintenance disabled, admission false, Cron empty and private executor access. Preserve all old databases, buckets and Workflow identities and all failed evidence.
4. Read back the exact source/version, variable and binding mapping. Observe two independent maintenance-state snapshots at least 60 seconds apart after the deployment/propagation window; check expired lease, stable generation and cursors, and zero outstanding work. Use native event metadata to describe any residual dispatch.
5. Report application maintenance as stopped only if that evidence supports it. Never label no-op scheduled invocations as platform Cron deletion. Do not use the saturated observer table as evidence of event absence.
6. Prepare a fresh rehearsal separately; the exhausted current epoch is retained. A future activation must explicitly enable maintenance and admission and configure its Cron only when the user is ready to supply the control secret privately.

## Acceptance

- Actual production scheduled entrypoint: default/enabled executes maintenance; disabled performs no runtime/resource/outbound work; invalid values fail before resource access.
- Actual smoke entrypoint: disabled performs no observer writes and no delegation; existing enabled success/failure observation behavior is preserved.
- HTTP runtime: root and request-scoped `acceptNew` both deny new work when disabled, including through the built sealed smoke runtime. Existing submit returns a matching accepted proof or temporary error without bootstrap; conflicts still reject. Signed read/recovery behavior remains intact in valid disabled mode.
- Workflow recorded-result delivery remains callable with valid disabled maintenance, so a configuration change cannot strand an already running paid invocation.
- Targeted runtime, maintenance, smoke build/composition tests, TypeScript checking and candidate build pass, followed by independent specification and quality review.
- Cloud acceptance is separate from local test success and uses the exact new candidate. No reset, cap increase, rewritten old result or additional paid Research follows from this design.

## Self-review

This switch is limited to scheduled maintenance and Workflow bootstrapping. It deliberately does not forbid all authenticated recovery I/O. No unsupported platform root cause is claimed; the stop cannot eliminate the minimal cost of residual platform invocations. Final operational activation remains dependent on actual reconciliation results, not on this document's existence. The sealed projection and existing-submit gaps identified in `outputs/local-durable-executor-20261012/maintenance-stop-independent-review-r1.md` are incorporated above.
