# Arc v8 Immutable Executor Job Envelope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute after Task 3 passes SPEC and independent QUALITY. The existing durable-executor design and local implementation are approved.

**Goal:** Give both services one bounded, canonical job identity whose SHA-256 changes when any immutable execution input changes.

**Architecture:** This unit defines the job message used by later outbox and executor ledgers. It reuses the existing Provider role normalization and fixed Kimi policy, but carries no owner/account/secret/URL or validation result. Sites retains the frozen validation context and publication authority. Job hashing is independent of HMAC authentication and cannot substitute for it.

**Tech Stack:** Existing TypeScript, Zod, WebCrypto, canonical JSON helper and Vitest; no network or new dependencies.

---

### Task 4: Canonical job messages

**Files:**
- Create `app/server/research/executor/job.ts`: strict job schema, immutable normalized snapshot, byte codec and SHA-256.
- Create `tests/server/research-executor-job.test.ts`: actual normalization, serialization and independent hash verification.
- Evidence only in `outputs/local-durable-executor-20260914/task4-*`.

This is a job-envelope unit. Begin grants, result receipts, persistent job/dispatch/import state, HTTP transport, fixed-origin handling and runtime endpoints remain subsequent units. No production entry point uses this module until those integrations exist. Existing synchronous configuration/fingerprints remain untouched.

- [x] **Step 1: Write behavioral RED with temporary safe failure exports.**

Use the API and full implementation contract in Step 3 as the intended interface, but initially make the functions throw `BridgeJobError("invalid-message")`. Test functions must execute and fail assertions; missing imports or process-launch errors are not behavioral RED.

```ts
// @vitest-environment node
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { canonicalJson } from "../../app/lib/planning/fingerprint";
import { decodeBridgeJob, encodeBridgeJob, hashBridgeJob, parseBridgeJob } from "../../app/server/research/executor/job";

function job() {
  return {
    protocol: "arc-research-bridge-v1",
    executor: "cloudflare-workflow-v1",
    jobId: "11111111-1111-4111-8111-111111111111",
    runId: "research-run-1",
    requestId: "request-1",
    inputFingerprint: "p2-" + "1".repeat(32),
    configFingerprint: "p2-" + "2".repeat(32),
    policyId: "kimi-low-output32k-v3",
    role: "  Ｆrontend   Engineer  ",
    locale: "en-US",
    createdAt: 1_800_000_000_000,
    queueExpiresAt: 1_800_000_120_000,
  };
}

it("normalizes the Provider role without lowercasing and owns its snapshot", () => {
  const input = job();
  const parsed = parseBridgeJob(input);
  input.role = "changed";
  expect(parsed.role).toBe("Frontend Engineer");
  expect(Object.isFrozen(parsed)).toBe(true);
  expect(decodeBridgeJob(encodeBridgeJob(parsed))).toEqual(parsed);
});

it("hashes all canonical execution inputs including requestId and createdAt", async () => {
  const parsed = parseBridgeJob(job());
  const expected = createHash("sha256").update(canonicalJson(parsed), "utf8").digest("hex");
  expect(await hashBridgeJob(parsed)).toBe(expected);
  expect(await hashBridgeJob({ ...parsed, requestId: "request-2" })).not.toBe(expected);
  expect(await hashBridgeJob({ ...parsed, createdAt: parsed.createdAt + 1,
    queueExpiresAt: parsed.queueExpiresAt + 1 })).not.toBe(expected);
});
```

Also write cases for every immutable field's valid change (where the field has multiple allowed values), stable hash despite property insertion order, equivalent role normalization, and raw-role case changes producing different hashes. Reject extra owner/session/key/callback/quality fields rather than silently projecting them away. Exercise accessors with a counter (must stay zero), custom prototypes, symbols, cycles, nonfinite/fractional/negative/unsafe timestamps, wrong protocol/executor/policy, malformed fingerprint/UUID, invalid locale and invalid retention. Reconstruct decoded messages and verify the same digest. Assert safe errors contain no supplied diagnostic marker.

- [x] **Step 2: Run and inspect RED.**

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-executor-job.test.ts --reporter=json --outputFile=outputs/local-durable-executor-20260914/task4-red.json
```

Record actual missing behavior. Infrastructure launch failures remain separate; retry only the same local command if needed.

- [x] **Step 3: Implement the strict shared contract.**

The following is the complete baseline. Preserve safe error translation around both plain-object serialization and schema parsing. The canonical serializer rejects getters without invoking them, and the JSON round trip owns all accepted data before any asynchronous hashing. This interface accepts trusted construction objects or already bounded, authenticated decoded messages; endpoints must perform Task 1 byte/time limits and Task 2 authentication before decoding their bodies.

```ts
import { z } from "zod";
import { researchPackageSchema } from "../../../contracts/research";
import { canonicalJson } from "../../../lib/planning/fingerprint";
import { KIMI_RESEARCH_EXECUTION_POLICY } from "../execution-policy";
import { parseProviderRequest } from "../provider";
import { BRIDGE_AUTH_PROTOCOL } from "./auth";
import { BRIDGE_BODY_LIMITS, decodeBridgeJson } from "./body";

export const BRIDGE_EXECUTOR_MODE = "cloudflare-workflow-v1";
export const BRIDGE_QUEUE_TTL_MS = 120_000;

export class BridgeJobError extends Error {
  constructor(readonly code: "invalid-message" | "unavailable") {
    super(`Research bridge job failure: ${code}`);
    this.name = "BridgeJobError";
  }
}

const time = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const fingerprint = z.string().length(35).regex(/^p2-[0-9a-f]{32}$/u);
const requestId = z.string().min(1).max(256).refine(value =>
  value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value));
const schema = z.object({
  protocol: z.literal(BRIDGE_AUTH_PROTOCOL),
  executor: z.literal(BRIDGE_EXECUTOR_MODE),
  jobId: z.uuid(),
  runId: researchPackageSchema.shape.id,
  requestId,
  inputFingerprint: fingerprint,
  configFingerprint: fingerprint,
  policyId: z.literal(KIMI_RESEARCH_EXECUTION_POLICY.profileId),
  role: z.string().min(2).max(640),
  locale: z.enum(["en-US", "zh-CN"]),
  createdAt: time.max(Number.MAX_SAFE_INTEGER - BRIDGE_QUEUE_TTL_MS
    - KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs),
  queueExpiresAt: time,
}).strict().refine(value => value.queueExpiresAt === value.createdAt + BRIDGE_QUEUE_TTL_MS);

export type BridgeJob = Readonly<z.infer<typeof schema>>;

export function parseBridgeJob(input: unknown): BridgeJob {
  try {
    const serialized = canonicalJson(input);
    const bytes = new TextEncoder().encode(serialized);
    if (bytes.byteLength > BRIDGE_BODY_LIMITS.request) throw new Error();
    const parsed = schema.parse(decodeBridgeJson(bytes));
    const request = parseProviderRequest({ role: parsed.role, locale: parsed.locale });
    return Object.freeze({ ...parsed, ...request });
  } catch {
    throw new BridgeJobError("invalid-message");
  }
}

export function encodeBridgeJob(input: unknown): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(canonicalJson(parseBridgeJob(input)));
  if (bytes.byteLength > BRIDGE_BODY_LIMITS.request) throw new BridgeJobError("invalid-message");
  return bytes;
}

export function decodeBridgeJob(bytes: Uint8Array): BridgeJob {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0
      || bytes.byteLength > BRIDGE_BODY_LIMITS.request) throw new Error();
    return parseBridgeJob(decodeBridgeJson(bytes));
  } catch {
    throw new BridgeJobError("invalid-message");
  }
}

export async function hashBridgeJob(input: unknown): Promise<string> {
  const bytes = encodeBridgeJob(input);
  try {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return Array.from(digest, value => value.toString(16).padStart(2, "0")).join("");
  } catch {
    throw new BridgeJobError("unavailable");
  }
}
```

`requestId` matches the current repository's bounded request identity; `runId` matches its existing ID schema and is not incorrectly narrowed to UUID. Only the newly generated `jobId` requires UUID. Fingerprints remain the existing `p2-` identities but are never used instead of the SHA-256 request hash or HMAC. `canonicalJson` retains timestamps/request IDs; the separate `fingerprint` function deliberately discards runtime metadata and must not hash this message.

The canonical job records creation and the original two-minute queue expiry only. It cannot grant dispatch or invent an execution deadline. Begin will initialize the existing 1260000ms execution lease exactly once in the later Site ledger. The site's frozen package ID, eight versions and validation dates remain site-owned and are not sent to the executor.

- [x] **Step 4: Run GREEN, lint and current-source type checking.**

Add malformed UTF-8/JSON/zero bytes/over-4096 bytes codec cases, multibyte role normalization and boundary timestamps. Compare SHA-256 with Node crypto, check caller mutation immediately after starting the hash cannot change it, and assert crypto failure is safely unavailable. Use actual WebCrypto for normal cases. No test should call the network or a Provider.

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-executor-job.test.ts tests/server/research-executor-auth.test.ts tests/server/research-executor-body.test.ts --reporter=json --outputFile=outputs/local-durable-executor-20260914/task4-green.json
node node_modules/eslint/bin/eslint.js app/server/research/executor/job.ts tests/server/research-executor-job.test.ts
```

Root runs `node outputs/local-durable-executor-20260914/verify-type-scope.mjs task4` and the existing acceptance tsconfig with `--noEmit --incremental false`. Preserve compiler options and actual source hashes.

- [x] **Step 5: Self-review, SPEC then independent QUALITY/security.**

Capture actual RED/GREEN/lint/type results and final source hashes. Confirm only two source/test files were added, no earlier module or configuration was changed, and the strict envelope rejects extra secret/URL/user-account metadata fields. The role remains the same user-supplied, Provider-normalized text accepted by the existing interface; this shape boundary does not claim to detect every possible sensitive string inside arbitrary role text. No hash claims authentication or publication permission. Mark complete only after both reviews pass. No Git operation is part of this isolated unit.

## Root plan self-review

This unit implements the normalized immutable request boundary required before either side's job ledger. The concrete interfaces were checked against `provider.ts`, `execution-policy.ts`, `d1-repository.ts`, `fingerprint.ts`, and Tasks 1/2. It preserves the raw-role case and the exact current Kimi profile, original queue deadline and all execution identity fields. It introduces no new user-facing behavior or Provider policy, and deliberately leaves complete receipt/ledger/HTTP integration for the next units. Those requirements remain in the approved overall design and are not claimed complete by this plan.
