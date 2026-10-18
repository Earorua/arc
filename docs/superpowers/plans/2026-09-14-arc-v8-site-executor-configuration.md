# Arc v8 Site Executor Configuration Implementation Plan

> **For agentic workers:** Use the approved superpowers:subagent-driven-development workflow: new implementer, behavioral TDD, self-review, fresh SPEC then independent QUALITY/security. Begin only after Task8 passes both reviews. Existing implementation/deployment approval applies; this unit performs local work only and no Git writes.

**Goal:** Extract credential-free Site policy validation and fixed bridge connection configuration, while preserving every existing synchronous policy fingerprint and refusing to route remote jobs into the synchronous Provider.

**Architecture:** A pure policy module owns the existing environment policy schema and fingerprint object. A separate server-only bridge configuration module owns fixed HTTPS origins and two independent synthetic-testable signing credentials. The existing factory continues to construct only its working synchronous service in this intermediate unit; explicit remote selection fails closed at that factory until the subsequent remote admission/recovery service is wired. A valid parsed remote configuration is not evidence that execution is available.

**Tech Stack:** Existing TypeScript, Zod, policy constants, fingerprint implementation and bridge authentication API. No new dependencies or runtime resources.

## Task9 scope and interfaces

Files:

- Create `app/server/research/production-policy.ts`: current public configuration/environment types, reusable key-free policy parsing, stable version constants and exact execution selector.
- Create `app/server/research/executor/connection-config.ts`: fixed origins and independent directional HMAC credential parsing, usable with switches off for existing work.
- Modify `app/server/research/service-factory.ts`: consume the extracted policy, preserve existing exports/signatures and synchronous construction, keep explicit remote selection unavailable at this intermediate factory.
- Modify `worker-configuration.d.ts`: optional string declarations for the new selector and bridge configuration names, no values or resource bindings.
- Modify `.env.example`: commented selector/origin/key-ID/secret-format guidance only; keep default switches false and actual secrets empty.
- Modify `tests/server/research-policy-migration.test.ts`: add the captured selected-Kimi literal and compatibility tests.
- Create `tests/server/research-executor-configuration.test.ts`: pure selection/connection, key access isolation, factory availability and private serialization tests.

Do not change Provider requests, existing versions, budgets, timers, fingerprints of synchronous modes, schemas/migrations, route response shapes, production bindings or hosting configuration. Do not read any real environment or Key. Root's actual pre-refactor capture already exists as `outputs/local-durable-executor-20260914/site-policy-baseline.json`; do not regenerate or replace it after edits.

### A. Policy selection and extraction

Use these internal types/exports; `ResearchProductionConfiguration` keeps its current field set exactly, and the old factory re-exports it and `ResearchProductionEnvironment` for existing callers:

```ts
export type ResearchExecutorSelection = "synchronous" | "cloudflare-workflow-v1";
export type ResearchPolicySelection = Readonly<{
  executor: ResearchExecutorSelection;
  configuration: ResearchProductionConfiguration;
}>;
export function resolveResearchExecutor(value: unknown): ResearchExecutorSelection | null;
export function readResearchPolicyConfiguration(environment: ResearchProductionEnvironment): ResearchPolicySelection | null;
export function readConfiguredResearchOrigin(environment: ResearchProductionEnvironment): string | null;
export const RESEARCH_CONFIGURATION_VERSIONS = Object.freeze({
  ...RESEARCH_PROVIDER_VERSIONS,
  blueprintVersion: "2026.09.1",
  registryVersion: "2026.09.1",
  templateVersion: "2026.09.1",
});
```

Import the existing RESEARCH_PROVIDER_VERSIONS from provider.ts and infer the version type from this moved constant; do not import the orchestrator into the pure module. Preserve its eight existing fields and values byte-for-byte. Preserve the existing public configuration's optional profile field semantics and budget value shape; this is not a new public response schema.

`resolveResearchExecutor(undefined)` is synchronous; exactly `"cloudflare-workflow-v1"` selects remote. Every other value, including `"synchronous"`, empty/whitespace, null, object, array, numeric and newline-suffixed strings, returns null. The selector is a server environment field, not a browser request parameter.

Read the selector before projecting common environment fields. Explicitly project only the existing policy fields other than `OPENROUTER_API_KEY`; never spread/enumerate the entire environment or probe/read the Provider key in this pure parser. Keep all existing switch, origin, salt, model, budget, quota/rate, timeout, cache and profile checks. Reuse the existing origin behavior for synchronous compatibility. Keep existing configured origin/salt values out of the stable fingerprint, as before. Any malformed selection or policy fails before constructing D1 or Provider.

For synchronous selection, construct the exact pre-extraction stable policy object, with no `executor`, null, undefined, reordered array or renamed nested fields. The actual baseline fingerprints, produced using the unmodified parser with synthetic inputs, are:

```text
legacy:         p2-2f912248ea8be6becb1d8614acbf92ca
legacy variant: p2-f20d7dbe8d9fe6c8883212924cff093c
selected Kimi:  p2-6e32d7563ab8083820f1c5128b673744
```

All three full public snapshots are in the baseline JSON. Retain existing fingerprint-change tests for cache/quota/rate/budget policy changes and fingerprint stability after key/salt rotation. Do not replace literal comparisons with a second implementation of the same fingerprint builder.

Remote selection requires the exact selected Kimi profile already validated by `resolveResearchExecutionPolicy`: model `moonshotai/kimi-k3`, profile `kimi-low-output32k-v3`, Research timeout1200000, Repair reservation0, positive Research reservation at most5000000. Keep all other current constraints. An absent/legacy profile is not allowed remotely. Add this exact stable top-level descriptor to the otherwise identical stable policy object before fingerprinting:

```ts
executor: {
  kind: "cloudflare-workflow-v1",
  protocol: "arc-research-bridge-v1",
  queueTtlMs: 120_000,
  lease: "begin-once-v1",
}
```

Reuse BRIDGE_AUTH_PROTOCOL from executor/auth.ts and BRIDGE_EXECUTOR_MODE/BRIDGE_QUEUE_TTL_MS from executor/job.ts; do not change them. The existing policy already fingerprints the1260000 active TTL. Endpoint origins, HMAC key IDs/bytes and all private credentials remain absent from the fingerprint. Parsing policy itself does not require bridge credentials: the complete remote construction gate will combine this pure selection with the separate validated connection. Document that distinction and never use policy-only success as an enabled flag.

### B. Fixed private bridge configuration

Add optional string fields to the environment type and worker declarations:

```text
ARC_AI_RESEARCH_EXECUTOR
ARC_AI_RESEARCH_EXECUTOR_URL
ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID
ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX
ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID
ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX
```

Only `ARC_AI_RESEARCH_EXECUTOR` belongs to selection. Define a narrow `ResearchBridgeEnvironment` in connection-config.ts for BETTER_AUTH_URL plus the five connection fields; the production environment type may intersect/extend that type. Do not import service-factory or `cloudflare:workers` into connection-config.ts or production-policy.ts. No module reads runtime bindings on import.

```ts
export type BridgeChannelCredential = Readonly<{
  keyId: string;
  copyKeyBytes(): Uint8Array<ArrayBuffer>;
}>;
export type ResearchBridgeConnection = Readonly<{
  siteOrigin: string;
  executorOrigin: string;
  siteToExecutor: BridgeChannelCredential;
  executorToSite: BridgeChannelCredential;
}>;
export function readResearchBridgeConnection(environment: ResearchBridgeEnvironment): ResearchBridgeConnection | null;
```

Both origins must be HTTPS with no credentials/query/fragment and with an empty or `/` pathname. Accept only input equal to `url.origin` or `url.origin + "/"`; output the exact canonical origin, length at most256 as required by existing bridge auth. Reject leading/trailing whitespace, other paths, noncanonical spellings, missing values, HTTP/file/data/javascript protocols and the same Site/executor origin. This stricter rule applies only to bridge parsing; do not narrow the existing synchronous origin parser. URLs remain fixed server configuration; this function accepts no request URL or callback override.

Each key ID contains1..32 ASCII letters/digits/underscore/hyphen with no trailing newline. Each secret is exactly64 lowercase hexadecimal characters representing32 bytes. No trimming, coercion, padding or default credentials. The two decoded secrets must differ even when IDs differ; identical IDs with different directional secrets are valid because authentication scope includes direction. Errors return null without values, underlying exceptions or logging.

Capture the validated secret bytes in a private closure. Freeze each credential object and the connection object; expose only a fresh byte copy from `copyKeyBytes()` for the existing signer/verifier, which itself snapshots bytes. Mutating one returned byte array cannot change the next copy or the opposite credential. `JSON.stringify(connection)` must not contain secret strings/byte arrays: it may contain origins and key IDs only. Never export a public API response serializer that includes this connection.

Bridge parsing is independent of switches, active Provider profile and OPENROUTER_API_KEY. Existing maintenance/recovery will require the same connection even when new Research is disabled. A throwing Provider-key accessor or irrelevant switch accessor must never be invoked. Use explicit field reads and safe catch-to-null for malformed configuration; no object enumeration. Implement exactly one hex-to-bytes conversion locally, with the validated32-byte constraint, not a new authentication algorithm.

### C. Existing factory compatibility and intermediate availability

Replace duplicated policy construction in `trustedConfiguration` with `readResearchPolicyConfiguration`. First reject null or non-synchronous selection, then validate the real current `OPENROUTER_API_KEY` with the unchanged secret schema. Retain the existing IP salt validation and extraction. Do not pass a dummy key to make the old parser accept remote selection. Preserve provider configuration fields and the optional researchProfile omission for legacy callers.

`readResearchProductionConfiguration`, `createNewCallService` and `rateLimitPerMinute` must remain consistent: explicit remote selection returns null/null/0 in this unit, regardless of bridge validity; they must not read the Provider key, construct repositories/providers, or fetch. Thus current admin/eligibility cannot announce enabled remote execution before there is a real remote service. Add a concise code comment that the remote admission service must replace this guard during integration; no false claim of complete remote support.

Default synchronous policy still requires all original fields including the key and salt. `createRecoveryService` remains credential-free and usable with invalid new-call configuration or disabled switches, with its exact existing synchronous historical behavior. Do not claim persisted-mode recovery is complete: a subsequent Site integration task adds that dispatch alongside real remote run records. Keep `configuredOrigin`, `deriveIpSubject`, cohort behavior and old route signatures unchanged.

Example configuration guidance is entirely commented and names the exact opt-in selector, HTTPS origin form, independent32-byte secret/64-lowercase-hex format and separate key IDs. State that only the executor receives OPENROUTER_API_KEY in the completed remote mode. Keep actual `.env.example` values, switches and original synchronous instructions unchanged; no environment-file copying or runtime mutation.

## Implementation sequence and evidence

- [x] Step1 — Preserve/cross-check the existing baseline JSON and its four source hashes. Add the selected-Kimi literal to the existing test. Create pure API stubs returning null with the exact types above, then add behavior tests that distinguish key-free remote policy from unavailable current service. Record a genuine RED with callable modules, not missing-file or child-spawn errors.

```ts
const remote = { ...syntheticKimi, ARC_AI_RESEARCH_EXECUTOR: "cloudflare-workflow-v1" };
delete remote.OPENROUTER_API_KEY;
Object.defineProperty(remote, "OPENROUTER_API_KEY", {
  get() { throw new Error("Provider key must remain unread"); },
});
expect(readResearchPolicyConfiguration(remote)?.executor).toBe("cloudflare-workflow-v1");
expect(readResearchProductionConfiguration(remote)).toBeNull();
expect(factoryFor(remote).createNewCallService()).toBeNull();
expect(getD1).not.toHaveBeenCalled();
expect(createProvider).not.toHaveBeenCalled();
```

The test must use actual synthetic Kimi fields from existing tests; factoryFor/getD1/createProvider are local test fixtures built with `createResearchServiceFactory` and Vitest spies, not undefined production APIs. Add tests for bridge connection normalization, independent secrets, copies and invalid input matrix before its implementation.

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-executor-configuration.test.ts tests/server/research-policy-migration.test.ts --reporter=json --outputFile=outputs/local-durable-executor-20260914/task9-red.json
```

- [x] Step2 — Move the exact common schema, versions, policy and origin reader to production-policy.ts. Implement the selector and stable remote descriptor. Re-export old types from service-factory. Replace synchronous policy duplication and retain unchanged key validation after mode selection. Implement connection-config.ts with fixed origins, private copies and no imports of runtime environment.
- [x] Step3 — Add optional declarations and commented example guidance. Complete the tests below and self-review the exact source diff before GREEN.

Required cases:

1. Exact three baseline fingerprints and complete public snapshot equality; legacy absent profile/provider selector semantics and current Kimi options/lease unchanged. No secret in public snapshots. Mutation of irrelevant origin/salt/keys does not change fingerprints; policy changes still do.
2. Absent executor means synchronous; every invalid type/spelling fails before D1/Provider/network. Valid remote requires exact current Kimi; missing/legacy/wrong profile/model/timeout/Repair/budget rejects. Throwing Provider-key accessors are untouched on pure remote parsing, remote factory rejection, invalid selector rejection and independent bridge parsing. The pure policy reader never reads the Provider key even for synchronous policy, while the synchronous factory still requires one.
3. Remote fingerprint differs from synchronous Kimi and uses the exact specified descriptor. Rotating connection origins/IDs/secrets does not alter it. No automatic selection via model name, bridge presence or key absence. A parsed policy with missing bridge credentials must not enable current admin/eligibility/factory.
4. Valid HTTPS origins with optional root slash normalize identically; credentials/query/fragment/path/whitespace/noncanonical URL/same origin and length overflow reject. Plain HTTP remains accepted by the old nonproduction synchronous origin logic only; bridge requires HTTPS in every environment.
5. Key IDs at1/32 ASCII boundaries, empty/33/nonstring/nonASCII/newline reject; secrets exactly64 lower hex, wrong lengths/case/characters/nonstring reject; matching secrets reject, independent secrets with same IDs valid. Returned arrays are actual32 bytes and match independent Buffer.from(hex,"hex") in tests. Mutation tests prove per-call and directional ownership. Frozen objects and JSON serialization never expose private material. No Buffer or Node-only dependency in production code.
6. Disabled new-call switches do not block direct bridge parsing or credential-free current recovery. Actual existing local SQLite recovery test passes; no provider construction or request. Do not claim this is the remote run recovery integration.
7. Existing API routes, runtime enabled policy, environment example checks and successful policy integration still pass. No fetch, actual secrets, new DDL, dependency or hosting change.

- [x] Step4 — Record actual GREEN, scoped lint and final source hashes. Root captures fresh exact current nonhistorical type inputs with unchanged compiler options and runs nonincremental acceptance type checking. Investigate only failures caused by this diff; do not rewrite unchanged old tests or loosen compiler rules.

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-executor-configuration.test.ts tests/server/research-policy-migration.test.ts tests/server/research-environment.test.ts tests/api/research-routes.test.ts tests/server/research-policy-migration-integration.test.ts --reporter=json --outputFile=outputs/local-durable-executor-20260914/task9-green.json
node node_modules/eslint/bin/eslint.js app/server/research/production-policy.ts app/server/research/executor/connection-config.ts app/server/research/service-factory.ts tests/server/research-policy-migration.test.ts tests/server/research-executor-configuration.test.ts --format json --output-file outputs/local-durable-executor-20260914/task9-lint.json
```

The fifth file is the existing actual SQLite/Provider-adapter/validator/planner successful-policy integration test; keep its existing implementation unchanged. Use only synthetic local execution, not the live Research launcher. All exact commands/exits/counts and known infra failures go in `task9-implementation-receipt.json`, final seven file hashes in `task9-final-hashes.json`. Root owns type/review receipts. Do not stage or commit.

- [x] Step5 — Fresh SPEC compares this contract and baseline against actual code; independent QUALITY traces secret access, availability consistency, exact fingerprint compatibility and old recovery behavior. Both reviews must PASS before the subsequent Site admission/ledger implementation starts.

## Root plan self-review and later boundary

This unit implements only approved configuration compatibility evidence. It does not create an outbox, admit/dispatch a remote task, wire remote recovery, perform a signed fetch or claim working background execution. The intermediate unavailable factory guard is an intentional migration boundary and must be replaced when the real remote service is integrated; deployment must never represent this unit alone as remote functionality.

Subsequent work remains Site durable run/alias/outbox and guarded reservation admission, shared fixed-context result import/publication, independent Worker/Workflow/maintenance, truthful backgroundAccepted UI, real local failure-chain verification and two builds. Hosting/real credentials, a newly authorized paid attempt and publication checks remain separate concrete steps under existing authorization.
