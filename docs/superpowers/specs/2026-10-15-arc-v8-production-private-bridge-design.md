# Arc v8 Task16 — production private bridge

Status: local implementation within the user's existing implementation/migration authorization and latest instruction “暂时不方便，先完成本地准备”. This does not authorize an operational r6 command, cloud activation or a paid model request. Task15 remains incomplete. No commit or public deployment is part of this change.

## Evidence and scope

Work in the retained integration candidate `C:/Users/XF/.codex/worktrees/arc-v8-release-integration/v8-openrouter-research-beta` (C). The accepted 2026-10-14 manifest's 268 files were rechecked before edits; 18 relevant source files were copied byte-for-byte into `C/outputs/release-private-bridge-20261015/baseline/`, indexed by `baseline.json`. The previous acceptance remains a historical baseline, not acceptance of the changed candidate.

The production Site service factory, Site bridge handler and Executor runtime currently default to global HTTPS fetch. The isolated smoke adapter explicitly supplies service-binding fetch to the same protocol. Therefore the smoke configuration's private Worker (`workers_dev:false`, no routes) cannot be copied to production while leaving the production transport unchanged. Existing public HTTPS mode is not proven broken by this finding.

Cloudflare documents forwarding a Request through a binding's fetch method, with `services: [{ binding, service }]` in the caller configuration. This supports using a fully qualified canonical URL for signed protocol requests without making that hostname the network transport. See [HTTP service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/). Configuration and actual cloud connectivity still require separate verification.

Options considered:

1. **Use an explicit private service-binding mode.** Reuse the accepted signed HTTP protocol and private Executor topology. Small production adapter and wiring changes are required. Selected for this same-account deployment.
2. Expose an authenticated Executor HTTPS endpoint and keep global fetch. This uses the existing default but adds a public route and corresponding operational checks; not selected.
3. Convert the protocol to Workers RPC. This adds unnecessary protocol and recovery changes; not selected.

This component only adds the private transport and integrates its selection. It does not create the restricted deployment inventory, change app admission policy, modify SQL/schema, change the model/profile, alter timeouts/retries, or modify any frozen mock material.

## Selection contract

Add optional `ARC_AI_RESEARCH_BRIDGE_TRANSPORT`, `ARC_RESEARCH_EXECUTOR`, and `ARC_RESEARCH_SITE` to the typed bridge environment. Binding fields are structural fetch capabilities; no credential values are added to code or reports.

`resolveResearchBridgeFetch(environment, connection, target, legacyOverride?)` returns `typeof fetch | null`:

- `ARC_AI_RESEARCH_BRIDGE_TRANSPORT === undefined`: preserve legacy behavior (`legacyOverride ?? globalThis.fetch`) after a function check. This retains the existing local/mock injection contract.
- Exact `service-binding-v1`: target `executor` selects only `ARC_RESEARCH_EXECUTOR` and `connection.executorOrigin`; target `site` selects only `ARC_RESEARCH_SITE` and `connection.siteOrigin`. A missing/non-callable binding returns null. Do not consult or fall back to the override/global fetch in this mode.
- Any other mode, invalid target or invalid selected binding/origin returns null. Errors do not echo supplied values.
- Selected service-binding mode remains available for recovery after new admission flags are disabled. Do not require a model key, active cohort, current research profile or new-call flag to select the bridge.

Keep `readResearchBridgeConnection` responsible for credentials and canonical origin validation. The new resolver uses its returned connection and adds only transport validation.

## Bounded binding adapter

`createResearchServiceBindingFetch(binding, peerOrigin, target)` creates a fetch-compatible function. It accepts only a Request with no second init argument, POST, `redirect:manual`, exact peer HTTPS origin, no URL credentials/query/fragment, no Origin header, and one of these direction-specific paths:

- executor: `/internal/research-bridge/{submit,status,close,result,acknowledge}`
- site: `/api/internal/research-bridge/{begin,accepted,complete,metadata,maintenance,outbox}`

Read the request with the existing `readBridgeBody`, 4,096-byte limit and 5,000ms bounded read, propagating abort. Preserve body bytes, signed headers, URL and signal in the forwarded Request. Invoke the binding method with its original receiver. Reject redirected or 3xx responses and cancel their bodies. On abort after a late response, cancel its body and reject. Errors must use a fixed local message (AbortError is allowed), not raw binding exceptions.

The enclosing `BridgeTransport` retains its existing overall 5-second deadline, response-size/authentication/nonce checks and response cancellation. Do not reset or remove that deadline; do not implement an unbounded fallback or automatic retry. The binding adapter need not reinterpret signed DTOs or add new HMAC headers.

## Production integration

- Site service factory: select the Executor bridge at composition. A missing/invalid selected transport prevents new remote-call service creation before admission writes. Recovery still exposes already persisted results; where no valid transport exists, its executor delegate is null rather than silently using HTTPS or requiring new admission configuration.
- `readResearchProductionConfiguration`: remote mode returns null when the selected transport is unavailable. It must still avoid reading the Site's Provider key.
- Site bridge handler: use the selected Executor bridge and existing unavailable response if selection fails. Disabled new-call flags do not remove the valid transport used by recovery/result/outbox flows.
- Executor shared `bridge()` factory: use selected Site bridge, so HTTP, Workflow execution, maintenance and request-scoped factories all inherit it. Invalid selected transport fails closed.
- Provider transport stays `overrides.providerFetch ?? globalThis.fetch`; never pass the Site/Executor binding to OpenRouter. Keep the currently accepted profile, 1,200,000ms Provider timeout, 1,260,000ms lease and retry-zero Workflow unchanged.
- Update Worker environment declarations for Site binding/mode. No changes to default build configuration: local/shadow remain Research-disabled and no bindings are deployed by this component.

## Acceptance criteria

TDD must first expose an actual missing production behavior (valid private mode uses its binding without runtime fetch injection, or invalid private mode currently permits new calls). Unit coverage then checks both directions, exact request/body/signature forwarding, method receiver, bad route/origin/method/redirect/init, oversized/slow body, cancellation, 3xx/redirected responses, missing binding, unknown mode and no fallback. Exercise production factory paths, not just a standalone helper.

Integrate real bridge signing/verification with local test D1s. Test Site new-call selection, closed-admission recovery, Site callback transport and Executor HTTP/execution/maintenance selection. Assert Provider transport is separate. Global networking is stubbed to fail, with no real model call.

Run the new tests and affected existing transport/service/runtime/API bridge/private integration tests; run both main and Executor TypeScript checks. Independent specification review precedes independent quality/security review. Record exact changed-file hashes, actual test output and limitations. Broad unchanged test suites need not be repeated. Existing sealed smoke tests needing excluded manifests are not evidence for this component.

## Remaining dependencies

After this component, Task16 still needs an exact restricted target/build preflight, actual resource identities, destination schema/backup checks, secrets configured securely, explicit one-owner cohort with second-owner exclusion, and Task15 cloud acceptance. Site budgets/cohort do not replace a new capped single paid-run authorization. Task17 still needs complete old-site export/restoration, account continuity, domain/OAuth cutover and post-release verification.
