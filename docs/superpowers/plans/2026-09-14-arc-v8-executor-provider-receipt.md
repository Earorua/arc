# Arc v8 Normalized Provider Receipt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development after Task5 and its shared intrinsic-byte repair pass SPEC and independent QUALITY. The overall durable executor design and local implementation are already approved.

**Goal:** Preserve one bounded, immutable normalized Provider outcome and its original begin identity for private storage and later Site validation/accounting.

**Architecture:** The executor will persist this canonical receipt in private R2 and fix its SHA-256 in its own D1. This unit provides the codec and identity comparison; storage, dispatch ownership, HMAC and Site publication remain later units. A successful Provider response does not assert candidate or course quality.

**Tech Stack:** Existing TypeScript, Zod, WebCrypto, canonical JSON and Provider contracts. No network or new dependency.

---

### Task6: Private normalized receipt protocol

**Files:**
- Modify `app/server/research/executor/begin.ts` only to expose an independently usable parser for its existing immutable grant schema.
- Create `app/server/research/executor/receipt.ts` for strict normalized outcomes, byte codec, matching and SHA-256.
- Create `tests/server/research-executor-receipt.test.ts` for receipt and standalone grant boundary coverage.
- Evidence: `outputs/local-durable-executor-20260914/task6-*`.

The receipt contains an original grant, an executor-local production timestamp, monotonic Provider latency and either a normalized response or a safe Provider failure. It does not contain a refreshed begin response observation, account data, callback URL, raw HTTP envelope/headers, parsed candidate, diagnostic body or quality decision. A whole model content string remains private and is not displayed by this protocol.

- [x] **Step1: Write behavioral RED with safe exports.**

Add the new standalone grant parser as a throwing stub without changing the existing begin reply APIs. Add safe throwing receipt exports matching Step3. Write tests first and run them with actual assertion failures:

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-executor-receipt.test.ts --reporter=json --outputFile=outputs/local-durable-executor-20260914/task6-red.json
```

Use a valid synthetic job and its real `hashBridgeJob` digest to build the grant. Set `beganAt=job.createdAt+100000`, `executionExpiresAt=beganAt+1260000`; initialize no database. A response fixture has content `{"example":"unvalidated model content"}`, one shape-valid citation, a bounded model string and valid usage. Assert the private content is preserved but no candidate/quality decision is produced.

Concrete RED assertions include successful parse/encode/decode, actual SHA-256 matching Node crypto, deeply owned frozen grant/outcome/usage/annotation objects, original grant matching and safe classified failure round trip. Wrong grant identity must fail even if the job ID alone matches. Missing imports and process launch errors are infrastructure failures, not RED.

- [x] **Step2: Cover the full boundary matrix.**

1. Standalone grant parser accepts the same schema as Task5 and owns its snapshot; rejects extras, invalid duration, unsafe/negative/fractional times, malformed UUID/hash and hostile object shapes without invoking getters.
2. Response content is nonempty after a whitespace check, preserved verbatim, and limited to196608 actual UTF-8 bytes. Exercise exact byte limit and one byte above using multibyte text, not just character counts. A malformed candidate JSON string may pass this transport schema; Site validation remains separate.
3. Annotations use the existing strict schema and count at most256. Exercise256/257 and malformed nested fields. Preserve order. URL/title trimming follows the existing contract; this is not source auditing or URL fetching.
4. Model is null or the existing safe model identifier shape. Usage is null or the existing strict schema. Exercise token totals, search count, unsafe/nonfinite values and an actual cost greater than USD5 that must remain unchanged.
5. Failure accepts only the existing seven safe Provider error codes, explicit retryable boolean, and charged boolean or `unknown`. Reject diagnostic message, cause, headers, candidate and unknown account fields. Unknown thrown errors are not parser input authority; their safe conversion remains the later executor adapter's responsibility.
6. Production time is an executor clock value and must not be compared to the Site's absolute begin time. A valid receipt may have `producedAt < grant.beganAt` because clocks differ. Validate its own safe bounds and the24-hour retention addition without silently moving the grant. Monotonic latency is nonnegative safe integer; never compute it by subtracting two services' wall clocks.
7. Malformed UTF-8/JSON/empty/non-Uint8Array/over1048576 byte input rejects safely. Raw HTTP response cap524288 remains upstream in the unchanged Provider adapter; do not raise it.
8. All accepted input is copied before asynchronous digest; mutate source grant/content/annotations/usage immediately after starting hashing and confirm original digest. Property insertion order is canonical; changing content, usage, latency, producedAt or any valid grant identity field changes the digest. Only crypto-failure tests mock crypto; normal tests use actual WebCrypto and independent Node SHA-256.

- [x] **Step3: Implement the bounded contract.**

First expose the existing Task5 schema without duplicating it. The new function in `begin.ts` is:

```ts
export function parseBridgeBeginGrant(input: unknown): BridgeBeginGrant {
  try {
    const bytes = new TextEncoder().encode(canonicalJson(input));
    if (bytes.byteLength > BRIDGE_BODY_LIMITS.status) throw new Error();
    return Object.freeze(grantSchema.parse(decodeBridgeJson(bytes)));
  } catch {
    throw new BridgeBeginError("invalid-message");
  }
}
```

The existing reply parsing and budget behavior remain unchanged. A receipt must use this standalone schema, rather than fabricate a fresh remaining-time observation or copy a second grant definition.

Implement `receipt.ts` against these complete contracts:

```ts
export const BRIDGE_RECEIPT_RETENTION_MS = 86_400_000;
export class BridgeReceiptError extends Error {
  constructor(readonly code: "invalid-message" | "conflict" | "unavailable") {
    super(`Research bridge receipt failure: ${code}`);
    this.name = "BridgeReceiptError";
  }
}
```

Use `providerUsageSchema`, `providerCitationAnnotationSchema` and corresponding inferred types from `app/contracts/research.ts`; `RESEARCH_PROVIDER_LIMITS` and `fitsUtf8` from `provider.ts`; `parseBridgeBeginGrant`/`BridgeBeginGrant` from Task5, plus existing canonical JSON/body helpers.

- `actualModelSchema`: `z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/u).nullable()`; equivalent to current `ResearchProviderError` metadata sanitization.
- Strict response outcome: `{kind: "response", content, annotations, actualModel, usage}`. Content is a string `.min(1).max(RESEARCH_PROVIDER_LIMITS.contentBytes)` refined by `value.trim().length > 0 && fitsUtf8(value, RESEARCH_PROVIDER_LIMITS.contentBytes)`; do not transform content. Annotations is `z.array(providerCitationAnnotationSchema).max(256)`. Usage is `providerUsageSchema.nullable()`.
- Strict error outcome: `{kind: "error", code, retryable, charged, actualModel, usage}`. Code is enum `missing-key`, `timeout`, `rate`, `balance`, `unavailable`, `filtered`, `invalid-transport`; retryable is boolean; charged is union boolean/literal`unknown`. No arbitrary message or original exception.
- Outcome is a discriminated union on `kind`.
- Strict outer schema: `{grant: z.unknown(), producedAt, latencyMs, outcome}`. `producedAt` is safe integer0..MAX_SAFE_INTEGER−BRIDGE_RECEIPT_RETENTION_MS; `latencyMs` is safe integer0..MAX_SAFE_INTEGER. After outer parsing, always parse `grant` through the standalone grant parser. There is no independent job ID, request hash or policy field outside the grant that could disagree with it.
- `BridgeProviderReceipt` is deeply readonly: grant, outcome, usage and annotations plus each annotation. Use explicit readonly mapped outcome types over the Zod inferred shapes as needed; avoid converting readonly arrays back to mutable arrays in public types.

Exports and algorithm:

```ts
parseBridgeProviderReceipt(input: unknown): BridgeProviderReceipt
encodeBridgeProviderReceipt(input: unknown): Uint8Array<ArrayBuffer>
decodeBridgeProviderReceipt(bytes: Uint8Array): BridgeProviderReceipt
matchBridgeProviderReceipt(input: unknown, expectedGrant: BridgeBeginGrant): BridgeProviderReceipt
hashBridgeProviderReceipt(input: unknown): Promise<string>
```

`parse`: canonical JSON before schema access, UTF-8 bytes<=BRIDGE_BODY_LIMITS.result, decode into owned plain data, strict outer/outcome parse, standalone grant parse, freeze the resulting whole graph. For usage null leave null; otherwise freeze its copied flat object. For response annotations freeze every copied annotation and the array. Catch all parse/shape/bounds errors into `BridgeReceiptError("invalid-message")` without supplied text. The schema never accepts a quality conclusion.

`encode`: parse to owned normalized data, canonical UTF-8 serialize, enforce the result byte cap again. `decode`: use the completed shared `bridgeByteLength` helper to require a real Uint8Array, nonzero and within the result cap based on its intrinsic view size; do not trust an overridable `bytes.byteLength` property. Use the fatal existing JSON decoder then parse, translating every invalid input exception to a fresh safe error. Endpoint streaming time/byte bounds precede this decoder in later handlers. Add a regression with valid receipt JSON padded beyond the result limit whose byteLength property reports1; it must reject before parsing the oversized view.

`match`: snapshot the receipt and expected grant synchronously, translate invalid expected grant to invalid-message, compare `canonicalJson(receipt.grant) === canonicalJson(parsedExpectedGrant)`; otherwise conflict. The expected grant comes from the already matched, authenticated and durably accepted begin identity. This stateless function neither queries the original job nor authorizes a new begin. Comparing all original fields also rejects a second valid deadline for the same job/hash.

`hash`: obtain owned encoded bytes before the first await, call actual WebCrypto SHA-256, return64 lowercase hex. Crypto failures translate to unavailable. This hash identifies a receipt, not an HMAC or durable first-result CAS.

Do not infer billing from the presence of content, absence of logs, timeout or a missing object. `charged:false` is only an explicit safe Provider classification in an error outcome; a pre-begin closed/unsent proof belongs to separate ledger state, and must not be manufactured by this receipt codec. A retryable classification never enables automatic Provider replay.

- [x] **Step4: Run GREEN, scoped lint and current-source type verification.**

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-executor-receipt.test.ts tests/server/research-executor-begin.test.ts tests/server/research-executor-job.test.ts --reporter=json --outputFile=outputs/local-durable-executor-20260914/task6-green.json
node node_modules/eslint/bin/eslint.js app/server/research/executor/begin.ts app/server/research/executor/receipt.ts tests/server/research-executor-receipt.test.ts --format json --output-file outputs/local-durable-executor-20260914/task6-lint.json
```

Root regenerates the exact current input scope with `verify-type-scope.mjs task6` then runs the acceptance tsconfig nonincrementally. Preserve old policy constants/compiler options. Save final three-file hashes and commands/exits/counts, keeping initial RED intact.

- [x] **Step5: Self-review, SPEC then independent QUALITY/security.**

Verify receipt normalization does not project away hidden extra metadata, mutable nested input cannot alter the stored hash, actual costs are not capped by the admission budget, and grant identity is independent of refreshed observation/client clock skew. Verify no integration falsely treats this parse as authorization, quality approval or unsent evidence. No actual R2/D1 writes, Provider call, endpoint enablement or deployment in this unit. Mark complete only after both sequential reviews pass.

## Root plan self-review

This protocol follows the approved normalized-result data boundary using actual current Provider content/annotation/usage limits. Exposing the already existing grant schema avoids repeated time/identity rules. Production timestamp bounds permit retention arithmetic without relating different machines' wall clocks; immutable Site grant and monotonic Provider latency retain their separate purposes. Storage publication/cleanup, safe error production, actual Provider use, result CAS and metadata-only accounting remain explicit later work. The plan must be checked against completed Task5 source before dispatch; it does not claim those future integrations complete.
