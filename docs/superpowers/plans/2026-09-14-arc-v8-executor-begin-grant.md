# Arc v8 Begin Grant and Remaining Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute after Task4 passes SPEC and independent QUALITY. This implements the already-approved immutable begin grant and monotonic elapsed-time rule; it does not change the approved Provider policy.

**Goal:** Match a begin reply to the original job and reject dispatch when the full Provider budget plus result margin no longer fits.

**Architecture:** The shared protocol separates the grant's immutable execution identity from the response's fresh remaining-time observation. The later Site ledger creates the grant once and later executor integration authenticates replies before applying these checks. This unit neither grants database ownership nor proves an unsent outcome.

**Tech Stack:** Existing TypeScript, Zod, canonical JSON, Task4 SHA-256 job identity, WebCrypto and Vitest; no network or dependencies.

---

### Task5: Begin reply validation and budget assertion

**Files:**
- Create `app/server/research/executor/begin.ts`: strict reply shape, job/grant matching, bounded codec and elapsed-budget assertion.
- Create `tests/server/research-executor-begin.test.ts`: actual identity hashing, immutable reply snapshots and budget boundary tests.
- Evidence `outputs/local-durable-executor-20260914/task5-*`.

The grant contains protocol, job ID, canonical job SHA-256, original begin time and original execution expiry. It contains no independently selectable model, Provider deadline, endpoint or secret. The signed reply also contains the Site database's observation time and remaining milliseconds. Replays may refresh only that observation; later ledger CAS must preserve the original grant. Validation cannot turn a new grant into an authorized database transition.

- [x] **Step1: Write behavioral RED using safe failure exports.**

Initially export the intended types/functions from Step3 with throwing stubs, then write these concrete assertions. Missing import/process failures do not count as RED.

```ts
// @vitest-environment node
import { expect, it } from "vitest";
import { parseBridgeJob, hashBridgeJob } from "../../app/server/research/executor/job";
import { matchBridgeBeginReply, assertBridgeProviderBudget } from "../../app/server/research/executor/begin";

const job = parseBridgeJob({
  protocol: "arc-research-bridge-v1", executor: "cloudflare-workflow-v1",
  jobId: "11111111-1111-4111-8111-111111111111", runId: "research-run-1",
  requestId: "request-1", inputFingerprint: "p2-" + "1".repeat(32),
  configFingerprint: "p2-" + "2".repeat(32), policyId: "kimi-low-output32k-v3",
  role: "Frontend Engineer", locale: "en-US", createdAt: 1_800_000_000_000,
  queueExpiresAt: 1_800_000_120_000,
});
async function reply() {
  return {
    grant: { protocol: "arc-research-bridge-v1", jobId: job.jobId,
      requestHash: await hashBridgeJob(job), beganAt: job.createdAt + 100_000,
      executionExpiresAt: job.createdAt + 100_000 + 1_260_000 },
    observedAt: job.createdAt + 100_000,
    remainingMs: 1_260_000,
  };
}

it("binds the grant to the original job and retains a full budget after queueing", async () => {
  const value = await matchBridgeBeginReply(await reply(), job);
  expect(Object.isFrozen(value)).toBe(true);
  expect(Object.isFrozen(value.grant)).toBe(true);
  expect(() => assertBridgeProviderBudget(value, 30_000)).not.toThrow();
  expect(() => assertBridgeProviderBudget(value, 30_000.1)).toThrow();
});

it("does not renew an old grant when its remaining-time observation changes", async () => {
  const input = await reply();
  const value = await matchBridgeBeginReply({ ...input,
    observedAt: input.observedAt + 30_000, remainingMs: input.remainingMs - 30_000 }, job);
  expect(value.grant).toEqual(input.grant);
  expect(() => assertBridgeProviderBudget(value, 1)).toThrow();
});
```

Also exercise wrong job/hash, creation-before-begin and queue-end boundaries, invalid execution duration, incorrect remaining observation, deep snapshot ownership, changed run/request/config producing a mismatch, expired observations, unsafe times, extra fields and hostile plain-object shapes. Assert safe error codes/messages without source diagnostic text. For same job, a different valid begin time is structurally possible but is not authority to replace a ledger's stored grant; do not write a test pretending this stateless parser enforces the later CAS.

- [x] **Step2: Observe actual RED.**

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-executor-begin.test.ts --reporter=json --outputFile=outputs/local-durable-executor-20260914/task5-red.json
```

Save actual assertion failures. Preserve infrastructure failures separately and use only a narrow same-command local retry if required.

- [x] **Step3: Implement this complete baseline.**

```ts
import { z } from "zod";
import { canonicalJson } from "../../../lib/planning/fingerprint";
import { KIMI_RESEARCH_EXECUTION_POLICY } from "../execution-policy";
import { BRIDGE_AUTH_PROTOCOL } from "./auth";
import { BRIDGE_BODY_LIMITS, decodeBridgeJson } from "./body";
import { hashBridgeJob, parseBridgeJob } from "./job";

export const BRIDGE_RESULT_MARGIN_MS = 30_000;

export class BridgeBeginError extends Error {
  constructor(readonly code: "invalid-message" | "conflict" | "insufficient-time" | "unavailable") {
    super(`Research bridge begin failure: ${code}`);
    this.name = "BridgeBeginError";
  }
}

const time = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const grantSchema = z.object({
  protocol: z.literal(BRIDGE_AUTH_PROTOCOL),
  jobId: z.uuid(),
  requestHash: z.string().length(64).regex(/^[0-9a-f]{64}$/u),
  beganAt: time.max(Number.MAX_SAFE_INTEGER - KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs),
  executionExpiresAt: time,
}).strict().refine(value => value.executionExpiresAt === value.beganAt
  + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs);
const replySchema = z.object({
  grant: grantSchema,
  observedAt: time,
  remainingMs: time.max(KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs),
}).strict().refine(value => value.observedAt >= value.grant.beganAt
  && value.remainingMs === Math.max(0, value.grant.executionExpiresAt - value.observedAt));

export type BridgeBeginGrant = Readonly<z.infer<typeof grantSchema>>;
export type BridgeBeginReply = Readonly<{
  grant: BridgeBeginGrant;
  observedAt: number;
  remainingMs: number;
}>;

export function parseBridgeBeginReply(input: unknown): BridgeBeginReply {
  try {
    const bytes = new TextEncoder().encode(canonicalJson(input));
    if (bytes.byteLength > BRIDGE_BODY_LIMITS.status) throw new Error();
    const value = replySchema.parse(decodeBridgeJson(bytes));
    return Object.freeze({ ...value, grant: Object.freeze(value.grant) });
  } catch {
    throw new BridgeBeginError("invalid-message");
  }
}

export function encodeBridgeBeginReply(input: unknown): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(canonicalJson(parseBridgeBeginReply(input)));
}

export function decodeBridgeBeginReply(bytes: Uint8Array): BridgeBeginReply {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0
      || bytes.byteLength > BRIDGE_BODY_LIMITS.status) throw new Error();
    return parseBridgeBeginReply(decodeBridgeJson(bytes));
  } catch {
    throw new BridgeBeginError("invalid-message");
  }
}

export async function matchBridgeBeginReply(input: unknown, expectedJob: unknown): Promise<BridgeBeginReply> {
  const reply = parseBridgeBeginReply(input);
  let job: ReturnType<typeof parseBridgeJob>;
  try { job = parseBridgeJob(expectedJob); }
  catch { throw new BridgeBeginError("invalid-message"); }
  let expectedHash: string;
  try { expectedHash = await hashBridgeJob(job); }
  catch { throw new BridgeBeginError("unavailable"); }
  if (reply.grant.jobId !== job.jobId || reply.grant.requestHash !== expectedHash
    || reply.grant.beganAt < job.createdAt || reply.grant.beganAt >= job.queueExpiresAt) {
    throw new BridgeBeginError("conflict");
  }
  return reply;
}

export function assertBridgeProviderBudget(input: BridgeBeginReply, elapsedMs: number): void {
  const reply = parseBridgeBeginReply(input);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > Number.MAX_SAFE_INTEGER) {
    throw new BridgeBeginError("invalid-message");
  }
  const remaining = reply.remainingMs - Math.ceil(elapsedMs);
  if (remaining < KIMI_RESEARCH_EXECUTION_POLICY.researchTimeoutMs + BRIDGE_RESULT_MARGIN_MS) {
    throw new BridgeBeginError("insufficient-time");
  }
}
```

The actual executor caller must measure `elapsedMs` using its local monotonic clock from immediately before sending the begin request until the latest eligibility check. This includes the **entire** RTT, parsing/hash work and any subsequent local storage delay; it must not freeze only the first measured RTT and ignore later time. Call the assertion again immediately before fetch. No local wall clock is compared with the Site's absolute deadline. The Provider adapter keeps its complete 1200000ms timeout, not the remaining lease duration.

The Site will later compute `observedAt` and remaining milliseconds from its database clock and the original persisted grant. Replies observed before the original begin time fail closed rather than increasing the lease after a backward clock jump. Expired replies with zero remaining are valid historical observations, but cannot pass the dispatch budget assertion.

Only a later authenticated handler plus durable ledger CAS can authorize a grant or dispatch. A budget failure alone is not proof that another worker has not sent anything; it must not directly release a reservation or overwrite a recorded result. Closing unclaimed work and recording definitive unsent evidence remain explicit ledger operations in the approved design.

- [x] **Step4: GREEN, lint and type verification.**

Cover exact 1230000ms residual success and one millisecond/fraction below failure; subtracting all monotonic elapsed time independent of arbitrary client wall-clock skew; an updated observation with the same immutable grant; original queue expiry and one-millisecond-before boundary; expired observation; nonfinite/negative elapsed; invalid UTF-8/JSON/zero/over4096 byte input; same hash under property ordering and input mutation while awaiting crypto. Use actual WebCrypto and Node hashes for normal matching. Use controlled crypto rejection only for the unavailable branch.

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-executor-begin.test.ts tests/server/research-executor-job.test.ts --reporter=json --outputFile=outputs/local-durable-executor-20260914/task5-green.json
node node_modules/eslint/bin/eslint.js app/server/research/executor/begin.ts tests/server/research-executor-begin.test.ts
```

Root regenerates exact current type input scope with `verify-type-scope.mjs task5`, then runs the existing acceptance tsconfig nonincrementally. Preserve all earlier source, policy constants and compiler options.

- [x] **Step5: Self-review, SPEC then independent QUALITY/security.**

Save actual results and final two-file hashes. Review the distinction between shape/hash matching, HMAC authenticity, immutable ledger identity and dispatch ownership; none replaces the others. Confirm this module does not call a Provider, configure an endpoint, extend a deadline, reduce model timeout or release funds. Mark this unit complete only after sequential independent reviews pass.

## Root plan self-review

This plan covers the approved signed-begin identity, original deadline, original queue and full-RTT/monotonic budget constraints while preserving the fixed Kimi policy. It relies only on Task1/2/4 APIs and existing policy constants. The one-time grant CAS, dispatch CAS and all storage/HTTP/failure recovery still require later integration; the parser explicitly does not claim those properties. Sites validation context and Provider result normalization remain separate boundaries. No new business behavior or paid request has been authorized by this plan.
