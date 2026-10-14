# Arc v8 Executor Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Implement sequentially with TDD, SPEC then independent QUALITY/security review. User already selected this workflow; do not ask again.

**Goal:** Build and verify the bounded byte transport shared by the Sites bridge and independent executor, with complete deadline/cancellation behavior before authentication or JSON parsing.

**Architecture:** This first independently testable transport unit has no runtime environment, Provider, network fetch or database dependency. Subsequent approved-design units add signing/nonces, immutable messages and ledgers, Site admission/import, Worker/Workflow, then browser/recovery integration. Splitting plans by unit does not narrow the full durable-executor or public-release goal.

**Tech Stack:** Existing TypeScript, Web Streams, TextDecoder, Vitest node environment; no new package or production configuration.

**Approved source:** `docs/superpowers/specs/2026-09-14-arc-v8-durable-research-executor-design.md`, SHA256 `7f4c33ae18a95e3a87ea8a5d9b9e11893c8ee8d88316fdad85f40020ecc20411`. User approval and future deployment authorization are recorded in `outputs/local-durable-executor-20260914/authorization.json`; the frozen design header is historical.

---

## Full-design implementation sequence

1. This plan: real streamed byte limits, whole-read deadlines, cancellation and safe JSON decoding (design acceptance 2).
2. Signing/nonces and exact message schemas: two directional HMAC keys, request/response context, persistent replay protection, immutable normalized job/result identities (acceptance 1–3).
3. Site and executor ledgers/migrations: atomic run+alias+outbox, partial admission closure, begin/dispatch CAS, frozen receipts/import stages (acceptance 3–5, 10–12).
4. Site integration: preserve absent selector, historical paths/fingerprints and no-Key remote validation; split admission/result import, database-clock publication, late-cost accounting (acceptance 1, 4–5, 7–8, 11).
5. Worker/Workflow and three Cron maintenance passes: same-ID creation, no paid retries, receipt storage/recovery, signed callbacks, cleanup and metadata-only reconciliation (acceptance 3–7, 10, 12).
6. Client and complete integration: fast durable-accept state, old default false, owner/mutation recovery, real local D1/Provider adapter/validator/planner fault scenarios, independent build and review (acceptance 6–9).

Each later unit receives its detailed source-grounded plan before changing that unit. No unapproved design variation or new approval loop is required for routine decomposition. Root is mapping actual Site interfaces concurrently with this isolated unit.

### Task 1: Bounded streamed body reader and JSON decoder

**Files:**
- Create `app/server/research/executor/body.ts`: byte caps, safe error type, streaming reader and fatal UTF-8/JSON decoder only.
- Create `tests/server/research-executor-body.test.ts`: actual ReadableStream/Response tests under `// @vitest-environment node`.
- Evidence `outputs/local-durable-executor-20260914/task1-*`: actual RED/GREEN receipts, exact final source hashes, root current-scope type/lint and sequential reviews.

- [x] **Step 1: Write behavioral RED tests.** Start with the real successful multi-chunk read below, then test exact/over byte boundary (multibyte UTF-8 included), dishonest Content-Length, never-ending body, abort before/during read, stream rejection and malformed UTF-8/JSON. New tests must fail because the implemented reader behavior is missing, not because a test process could not spawn.

```ts
// @vitest-environment node
import { expect, it } from "vitest";
import { readBridgeBody, decodeBridgeJson, BridgeBodyError } from "../../app/server/research/executor/body";

it("counts real bytes across chunks without trusting Content-Length", async () => {
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([123, 34, 120]));
      controller.enqueue(new Uint8Array([34, 58, 49, 125]));
      controller.close();
    },
  }), { headers: { "Content-Length": "1" } });
  const bytes = await readBridgeBody(response, { maxBytes: 7, timeoutMs: 5_000 });
  expect(decodeBridgeJson(bytes)).toEqual({ x: 1 });
});

it("times out a stalled read even if cancellation itself never resolves", async () => {
  const stream = new ReadableStream<Uint8Array>({ cancel: () => new Promise(() => {}) });
  const response = new Response(stream);
  const work = readBridgeBody(response, { maxBytes: 4_096, timeoutMs: 10 });
  await expect(work).rejects.toMatchObject({ code: "timeout" });
});

it("does not include raw stream failures in a safe error", async () => {
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(controller) { controller.error(new Error("synthetic-sensitive-marker")); },
  }));
  const error = await readBridgeBody(response, { maxBytes: 32, timeoutMs: 100 }).catch(value => value);
  expect(error).toBeInstanceOf(BridgeBodyError);
  expect(error.code).toBe("body-read");
  expect(String(error)).not.toContain("synthetic-sensitive-marker");
});
```

- [x] **Step 2: Run RED and inspect output.** Use installed tools only:

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-executor-body.test.ts --reporter=json --outputFile=outputs/local-durable-executor-20260914/task1-red.json
```

If a minimal module is needed to make the missing behavior fail as assertions, define the below exported signatures with `throw new BridgeBodyError("body-read")`, then observe behavioral RED before replacing the stubs. This temporary stub must not remain in the reviewed implementation. Spawn EPERM is infrastructure, not RED; root can arrange a narrow same-command local retry if required.

- [x] **Step 3: Implement the following contract and complete algorithm.** No fetch, env lookup, Key handling, timers per chunk, logging, Provider imports or persistent storage.

```ts
export const BRIDGE_BODY_LIMITS = Object.freeze({
  request: 4_096, status: 4_096, outbox: 16_384, result: 1_048_576,
});
export type BridgeBodyErrorCode = "invalid-limit" | "timeout" | "aborted" | "body-limit" | "body-read" | "invalid-json";
export class BridgeBodyError extends Error {
  constructor(readonly code: BridgeBodyErrorCode) {
    super(`Research bridge body failure: ${code}`);
    this.name = "BridgeBodyError";
  }
}
export interface BridgeReadOptions { maxBytes: number; timeoutMs: number; signal?: AbortSignal }

export async function readBridgeBody(
  message: Pick<Request, "body">, options: BridgeReadOptions,
): Promise<Uint8Array> {
  const { maxBytes, timeoutMs, signal } = options;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > BRIDGE_BODY_LIMITS.result
      || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new BridgeBodyError("invalid-limit");
  }
  if (signal?.aborted) {
    void message.body?.cancel().catch(() => undefined);
    throw new BridgeBodyError("aborted");
  }
  if (!message.body) return new Uint8Array();
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try { reader = message.body.getReader(); }
  catch { throw new BridgeBodyError("body-read"); }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const stop = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BridgeBodyError("timeout")), timeoutMs);
    if (signal) {
      onAbort = () => reject(new BridgeBodyError("aborted"));
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    }
  });
  const chunks: Uint8Array[] = [];
  let count = 0;
  const deadline = performance.now() + timeoutMs;
  try {
    for (;;) {
      if (performance.now() >= deadline) throw new BridgeBodyError("timeout");
      const item = await Promise.race([reader.read(), stop]);
      if (performance.now() >= deadline) throw new BridgeBodyError("timeout");
      if (item.done) break;
      if (!(item.value instanceof Uint8Array)) throw new BridgeBodyError("body-read");
      count += item.value.byteLength;
      if (count > maxBytes) throw new BridgeBodyError("body-limit");
      if (item.value.byteLength) chunks.push(item.value.slice());
    }
    const result = new Uint8Array(count);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result;
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error instanceof BridgeBodyError ? error : new BridgeBodyError("body-read");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

export function decodeBridgeJson(bytes: Uint8Array): unknown {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new BridgeBodyError("invalid-json"); }
}
```

The contract/algorithm is the baseline, not permission to preserve defects found by RED tests or review. Tighten cancellation/ownership details in the same two-file scope if actual tests expose them. Body parsing remains separate from authentication: callers will authenticate the returned raw bytes before schema parsing. Context-specific limits are mandatory at those later call sites. Test an immediately resolving zero-byte stream with controlled monotonic time: it cannot starve the overall deadline by keeping the timer callback queued, nor grow the stored chunk list indefinitely. Byte chunks are copied so a producer cannot mutate previously returned bytes during later reads.

- [x] **Step 4: Run GREEN and self-review.** Repeat the exact Vitest entry with output `task1-green.json`; all assertions must pass and no unhandled rejection or open timer remains. Add explicit tests for timer/listener disposal after success/failure, locked-body error, null body, invalid limits and concurrent independent reads. Observe a new RED before each bug fix. Root then typechecks current source inputs excluding only historical outputs in a temporary non-product tsconfig and lints these two files.

```powershell
node node_modules/eslint/bin/eslint.js app/server/research/executor/body.ts tests/server/research-executor-body.test.ts
```

- [x] **Step 5: SPEC then independent QUALITY/security review.** Review actual code, tests, and command JSON at exact file hashes. The quality reviewer runs only after SPEC passes. Close findings with TDD where behavior changes, re-review, then mark Task1 complete. Preserve the current Git worktree and evidence; no broad staging/commit of accumulated unrelated files as part of this isolated task.

## Root plan self-review

This unit implements approved actual-byte and full-read deadline requirements. No message auth, persistent executor or public behavior is claimed complete here. Future units are explicitly mapped above to all 12 acceptance requirements; the next detailed plan consumes this stable byte-reader API. File names, signatures, safe error codes and exact commands are consistent; no placeholders or undefined later-task helper calls appear in this unit.
