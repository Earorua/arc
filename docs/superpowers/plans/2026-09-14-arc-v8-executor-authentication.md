# Arc v8 Executor Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. User has approved the local design and future deployments. Execute after the byte-reader unit passes SPEC and independent QUALITY; no repeated workflow/design approval.

**Goal:** Authenticate immutable raw bridge messages with directional HMAC, request/response context and replay protection before any task effect.

**Architecture:** Pure WebCrypto signing/verification consumes bounded bytes and a required atomic nonce-store port. It does not read runtime keys or create a production nonce database; the following ledger unit supplies the durable D1 implementation before endpoints can be wired. Actual network clients later enforce fixed HTTPS origins and redirect refusal.

**Tech Stack:** Existing TypeScript/Zod/WebCrypto/Vitest. Cloudflare documents HMAC sign/verify, SHA256 and raw key import support: [Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/). No Node crypto dependency in application code.

---

### Task 2: Context-bound HMAC primitive and atomic nonce-store port

**Files:**
- Create `app/server/research/executor/auth.ts` for the following typed context, canonical encoding, signing and verification.
- Create `tests/server/research-executor-auth.test.ts` with node environment and actual WebCrypto. Use Node crypto only in tests for an independently assembled HMAC vector.
- Do not change the byte-reader implementation, public endpoints, runtime configuration or database migrations in this unit.

- [x] **Step 1: Write RED tests against the complete API below.** Use a 32-byte synthetic key, receiver `https://executor.example`, request `POST /internal/research/jobs`, job UUID `11111111-1111-4111-8111-111111111111`, time `1_800_000_000_000`, body bytes for `{"x":1}`. Both directions must verify with the corresponding key, while wrong key/direction/kind/status/method/path/audience/job/body all reject. Check header duplicates, invalid time/header/config values, timestamp window exact boundaries, concurrency, store failures and mutable input snapshots. Stub with the safe failure class only to observe real missing-behavior assertions before implementation.

```ts
// @vitest-environment node
import { expect, it } from "vitest";
import { signBridgeMessage, verifyBridgeMessage, type BridgeNonceStore } from "../../app/server/research/executor/auth";
const key = new Uint8Array(32).fill(17);
const context = {
  direction: "site-to-executor" as const, kind: "request" as const,
  method: "POST" as const, path: "/internal/research/jobs", status: null,
  audience: "https://executor.example", jobId: "11111111-1111-4111-8111-111111111111",
};
it("permits one effect for concurrent valid copies of one nonce", async () => {
  const claimed = new Set<string>();
  const store: BridgeNonceStore = {
    async claim({ scope, nonce }) {
      const id = `${scope}:${nonce}`;
      if (claimed.has(id)) return false;
      claimed.add(id);
      return true;
    },
  };
  const body = new TextEncoder().encode('{"x":1}');
  const now = () => 1_800_000_000_000;
  const headers = await signBridgeMessage({ context, body, keyId: "synthetic-1", keyBytes: key, now });
  const attempt = () => verifyBridgeMessage({ context, body, headers,
    keyId: "synthetic-1", keyBytes: key, now, nonces: store });
  const results = await Promise.allSettled([attempt(), attempt()]);
  expect(results.filter(value => value.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(value => value.status === "rejected")).toHaveLength(1);
});
```

- [x] **Step 2: Run and inspect RED.**

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-executor-auth.test.ts --reporter=json --outputFile=outputs/local-durable-executor-20260914/task2-red.json
```

Expected missing-behavior assertion failures. A spawn error is not RED; record actual process errors separately and obtain a narrow local retry through Root if necessary.

- [x] **Step 3: Implement the complete primitive below, tightening any issue demonstrated by RED or self-review.** Context is assembled from trusted routing/configuration, never copied from peer JSON. All inputs that survive an await are copied first. Extra canonical fields (kind, status, audience) prevent request/response or destination substitution; they are compatible strengthening of the approved signed identity.

```ts
import { z } from "zod";
import { BRIDGE_BODY_LIMITS } from "./body";

export const BRIDGE_AUTH_PROTOCOL = "arc-research-bridge-v1";
const WINDOW_MS = 120_000;
const FUTURE_SKEW_MS = 30_000;
const KEY_ID = /^[A-Za-z0-9_-]{1,32}$/u;
const HEX_NONCE = /^[0-9a-f]{32}$/u;
const HEX_SIGNATURE = /^[0-9a-f]{64}$/u;
const contextSchema = z.object({
  direction: z.enum(["site-to-executor", "executor-to-site"]),
  kind: z.enum(["request", "response"]),
  method: z.enum(["GET", "POST"]),
  path: z.string().min(1).max(256).regex(/^\/[A-Za-z0-9/_-]*$/u),
  audience: z.string().max(256).refine(value => {
    try { const url = new URL(value); return url.protocol === "https:" && url.origin === value && !url.username && !url.password; }
    catch { return false; }
  }),
  jobId: z.union([z.uuid(), z.literal("collection")]),
  status: z.number().int().min(200).max(599).nullable(),
}).strict().refine(value => value.kind === "request" ? value.status === null : value.status !== null);
export type BridgeMessageContext = z.infer<typeof contextSchema>;
export type BridgeAuthErrorCode = "invalid-config" | "invalid-message" | "expired" | "unauthorized" | "replay" | "unavailable";
export class BridgeAuthError extends Error {
  constructor(readonly code: BridgeAuthErrorCode) {
    super(`Research bridge authentication failure: ${code}`);
    this.name = "BridgeAuthError";
  }
}
export interface BridgeNonceStore {
  claim(input: { scope: string; nonce: string; expiresAt: number; now: number }): Promise<boolean>;
}
interface MessageInput {
  context: BridgeMessageContext; body: Uint8Array; keyId: string;
  keyBytes: Uint8Array; now: () => number;
}
export type BridgeSignInput = MessageInput;
export interface BridgeVerifyInput extends MessageInput { headers: Headers; nonces: BridgeNonceStore }
const bytes = (value: Uint8Array) => new Uint8Array(value);
const hex = (value: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(value instanceof Uint8Array ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) : value), item => item.toString(16).padStart(2, "0")).join("");
const unhex = (value: string) => new Uint8Array(value.match(/../gu)!.map(item => parseInt(item, 16)));
function clock(now: () => number): number {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - 180_000) throw new BridgeAuthError("invalid-config");
  return value;
}
function snapshot(input: MessageInput) {
  if (typeof input.keyId !== "string" || !KEY_ID.test(input.keyId)
      || !(input.keyBytes instanceof Uint8Array) || input.keyBytes.byteLength !== 32) throw new BridgeAuthError("invalid-config");
  const context = contextSchema.safeParse(input.context);
  if (!context.success || !(input.body instanceof Uint8Array) || input.body.byteLength > BRIDGE_BODY_LIMITS.result) throw new BridgeAuthError("invalid-message");
  return { context: context.data, body: bytes(input.body), key: bytes(input.keyBytes), keyId: input.keyId, now: input.now };
}
async function canonical(context: BridgeMessageContext, body: Uint8Array, keyId: string, timestamp: number, nonce: string) {
  const digest = hex(await crypto.subtle.digest("SHA-256", bytes(body).buffer));
  return new TextEncoder().encode(JSON.stringify([
    BRIDGE_AUTH_PROTOCOL, context.direction, context.kind, context.method, context.path,
    context.audience, context.jobId, context.status, keyId, timestamp, nonce, digest,
  ]));
}
function assertWindow(timestamp: number, now: number) {
  if (timestamp > now + FUTURE_SKEW_MS || now - timestamp > WINDOW_MS) throw new BridgeAuthError("expired");
}
export async function signBridgeMessage(input: BridgeSignInput): Promise<Headers> {
  try {
    const message = snapshot(input);
    const timestamp = clock(message.now);
    const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
    const encoded = await canonical(message.context, message.body, message.keyId, timestamp, nonce);
    const key = await crypto.subtle.importKey("raw", message.key.buffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = hex(await crypto.subtle.sign("HMAC", key, encoded.buffer));
    return new Headers({
      "x-arc-bridge-key-id": message.keyId, "x-arc-bridge-time": String(timestamp),
      "x-arc-bridge-nonce": nonce, "x-arc-bridge-signature": signature,
    });
  } catch (error) { throw error instanceof BridgeAuthError ? error : new BridgeAuthError("unavailable"); }
}
export async function verifyBridgeMessage(input: BridgeVerifyInput): Promise<void> {
  try {
    const message = snapshot(input);
    const headers = new Headers(input.headers);
    const keyId = headers.get("x-arc-bridge-key-id");
    const time = headers.get("x-arc-bridge-time");
    const nonce = headers.get("x-arc-bridge-nonce");
    const signature = headers.get("x-arc-bridge-signature");
    const nonces = input.nonces;
    if (keyId !== message.keyId || !time || !/^(0|[1-9][0-9]{0,15})$/u.test(time)
        || !nonce || !HEX_NONCE.test(nonce) || !signature || !HEX_SIGNATURE.test(signature)) throw new BridgeAuthError("unauthorized");
    const timestamp = Number(time);
    if (!Number.isSafeInteger(timestamp)) throw new BridgeAuthError("unauthorized");
    assertWindow(timestamp, clock(message.now));
    const encoded = await canonical(message.context, message.body, keyId, timestamp, nonce);
    const key = await crypto.subtle.importKey("raw", message.key.buffer, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("HMAC", key, unhex(signature).buffer, encoded.buffer)) throw new BridgeAuthError("unauthorized");
    const now = clock(message.now);
    assertWindow(timestamp, now);
    const accepted = await nonces.claim({ scope: `${message.context.direction}:${keyId}`, nonce, expiresAt: timestamp + WINDOW_MS + 1, now });
    if (accepted !== true) throw new BridgeAuthError("replay");
    assertWindow(timestamp, clock(message.now));
  } catch (error) { throw error instanceof BridgeAuthError ? error : new BridgeAuthError("unavailable"); }
}
```

`BridgeNonceStore.claim` is mandatory and must atomically reject a previously claimed scope+nonce. This unit tests that port with an atomic in-process store, never calls it for invalid signatures, and fails closed if it rejects/throws. The later D1 ledger task implements durable cross-worker uniqueness and expiration using SQL; this unit alone must not be reported as durable replay protection. Keeping nonce metadata beyond its acceptance window is permitted; forgetting it while the signature remains valid is not.

The bounded body reader runs before this verifier. This verifier runs before JSON schema parsing or job mutations. A valid signature is service authentication, not owner authorization or permission to bypass run/quota/budget/lease guards.

- [x] **Step 4: Run GREEN, independent vector and negative matrix.** Assemble the canonical array in test code from fixed known values and compute HMAC with Node `createHmac` as an independent implementation; verify it through the application. Check exact past120000/future30000ms acceptance and one millisecond outside rejection, and expiration while cryptography/nonce claim is pending. Verify copied inputs by mutating body/key/context/headers immediately after invoking the async function; accepted content must remain the snapshot. Verify response-status substitution and opposite direction rejection even if the test uses the same bytes as both synthetic keys.

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-executor-auth.test.ts tests/server/research-executor-body.test.ts --reporter=json --outputFile=outputs/local-durable-executor-20260914/task2-green.json
node node_modules/eslint/bin/eslint.js app/server/research/executor/auth.ts tests/server/research-executor-auth.test.ts
```

- [x] **Step 5: Self-review then SPEC and independent QUALITY.** Capture current files and actual RED/GREEN/type/lint receipts. All errors stay fixed categories with no raw body/key/header/exception. Unknown signing key IDs do not select arbitrary config. No nonce record is claimed on invalid/expired signatures; one valid duplicate wins; storage unavailability never authorizes an effect. No public endpoint is enabled in this unit. Mark complete only after both sequential reviews pass.

## Root plan self-review

This unit maps approved signature identity/time/nonce requirements to the explicit API. Request/response and audience binding strengthens that identity without changing Provider policy or lease semantics. Atomic persistence, fixed-origin network fetching, endpoint-specific schemas and the actual D1 nonce implementation remain explicitly assigned to subsequent ledger/integration units; no test-double result is promoted to their evidence. No undefined helper names or placeholder implementation steps remain.
