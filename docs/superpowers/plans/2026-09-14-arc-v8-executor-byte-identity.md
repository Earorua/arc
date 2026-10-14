# Arc v8 Intrinsic Byte Identity Hardening Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development and systematic-debugging/TDD. This is the local repair required by Task5 independent QUALITY, within the already-approved transport/security design. Complete before Task5 is closed or Task6 starts.

**Goal:** Enforce the actual Uint8Array view length and copy its actual contents across bridge boundaries, regardless of shadowed JavaScript metadata.

**Root cause hypothesis:** Begin/job decoders check the overridable `bytes.byteLength`, while TextDecoder consumes the intrinsic view. Oversized valid JSON plus whitespace can pass if `.byteLength` is shadowed with1. Canonicalization later removes padding. The same property is used by stream accounting and authentication snapshot allocation; truncation or padding can result from mismatched advertised/intrinsic lengths. This is a local API boundary issue; no external exploit has been demonstrated.

**Scope:**
- `app/server/research/executor/body.ts`: shared intrinsic byte-length helper and stream accounting.
- `app/server/research/executor/auth.ts`: actual-length checks and actual typed-array copy.
- `app/server/research/executor/job.ts`: decoder actual size guard.
- `app/server/research/executor/begin.ts`: decoder actual size guard.
- New `tests/server/research-executor-byte-identity.test.ts`: focused cross-module regressions.
- Evidence `outputs/local-durable-executor-20260914/task5-bytes-*`.

Keep previous tests/source behavior except the proven byte metadata defect. No endpoint, provider, policy, migration, Git, dependencies or production changes. Do not expand into unrelated custom-object APIs.

- [x] **1. Reproduce before modifying implementation.**

Write actual tests importing the existing modules. A valid job and begin reply can be encoded using existing APIs, then padded with spaces to4097 bytes. Use `Object.defineProperty(bytes, "byteLength", {value:1})`; both decoders must reject with their safe invalid-message error. Current implementation is expected to accept these inputs. Save actual RED; failed setup/import/process launch is not RED.

Also reproduce stream-accounting behavior with a real ReadableStream: enqueue UTF-8 bytes for `abc`, shadow byteLength with1, and require output to preserve all3 bytes. A shadowed larger advertised length must not pad or reject an otherwise valid3-byte view. An actual oversized chunk must produce body-limit and cancellation even if its advertised length is small.

For auth, construct synthetic signing inputs using the real existing contract. A16-byte key reporting32 must reject; a valid32-byte key reporting1 must be accepted based on its actual bytes. A body reporting a different length must sign/verify the same actual contents as an unmodified owned copy, without zero padding or truncation. Use actual WebCrypto and existing synthetic keys only.

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-executor-byte-identity.test.ts --reporter=json --outputFile=outputs/local-durable-executor-20260914/task5-bytes-red.json
```

If any hypothesis does not reproduce, record that result and narrow its fix scope. Do not claim hypothetical failures as observed. Preserve Node Buffer and ordinary Uint8Array behavior, zero-length stream chunks, cancellation and snapshot isolation.

- [x] **2. Implement one shared source of actual length.**

Expose `bridgeByteLength(value: Uint8Array): number` from body.ts. Read actual length using the captured intrinsic getter on `%TypedArray%.prototype`, not `value.byteLength`, `value.length`, `value.buffer` or an overridable iterator. For example, obtain the descriptor getter from `Object.getPrototypeOf(Uint8Array.prototype)` at module initialization, then apply it to a validated Uint8Array receiver. Reject a fake/proxied non-internal typed array safely as `BridgeBodyError("body-read")`; do not invoke a supplied metadata getter or leak its exception. Check the intrinsic exists rather than asserting an unavailable runtime feature. Do not allocate a whole oversized copy merely to determine its length.

Use this helper for stream accounting and the actual byte caps in auth/job/begin. Existing normal byte caps and safe outer error categories remain. In stream drain compute actual chunk size once, enforce max before `.set`, then update totals with that same intrinsic size. The built-in target TypedArray `.set` consumes intrinsic typed-array elements.

In authentication, allocate/copy with `new Uint8Array(value)` for a validated real Uint8Array: that typed-array constructor overload copies intrinsic elements into an owned ArrayBuffer and handles Node Buffer correctly. Avoid `new Uint8Array(value.byteLength)` followed by `.set`, which can add zeros or throw based on the shadow. Preserve body/key capture before the first await, exact32 actual key bytes, maximum actual body bytes and the existing HMAC protocol.

Job and begin decoders continue to reject empty and over-limit intrinsic views before TextDecoder. They must retain unconditional safe invalid-message translation. This helper is not permission to accept a body larger than existing limits or to change canonical hash identity.

- [x] **3. GREEN and compatibility verification.**

Add tests for ordinary Buffer input, a shadowed throwing metadata getter (counter remains zero when using intrinsic length), and forged/proxy receivers failing safely. Keep tests focused on actual byte behavior and the reproduced paths, rather than asserting helper internals.

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-executor-byte-identity.test.ts tests/server/research-executor-body.test.ts tests/server/research-executor-auth.test.ts tests/server/research-executor-job.test.ts tests/server/research-executor-begin.test.ts tests/server/research-executor-nonce-store.test.ts --reporter=json --outputFile=outputs/local-durable-executor-20260914/task5-bytes-green.json
node node_modules/eslint/bin/eslint.js app/server/research/executor/body.ts app/server/research/executor/auth.ts app/server/research/executor/job.ts app/server/research/executor/begin.ts tests/server/research-executor-byte-identity.test.ts --format json --output-file outputs/local-durable-executor-20260914/task5-bytes-lint.json
```

Root regenerates exact current type scope under label `task5-bytes` and runs existing acceptance tsconfig nonincrementally. Save five-file hashes and actual command/count/exit receipts. Preserve all preceding evidence; affected older source manifests become baselines, not current hashes. Do not broaden into old unrelated tests/builds.

- [x] **4. Self-review and sequential independent reviews.**

Use a fresh SPEC reviewer for this cross-module repair, then return the final five-file candidate to the independent QUALITY reviewer. Both must pass before Task5 completion, and Root must verify current hashes/type inputs. Describe all source changes, including affected Task1/2/4 primitives, rather than presenting this as a begin-only edit. No paid requests or remote resources are required.

## Root self-review

The common assumption is visible in current body.ts accounting, auth.ts copy/checks, and job/begin decoding. This plan first requires actual reproductions, then changes only actual typed-array measurement/copy behavior through a shared primitive. It preserves the original contracts and fixed Provider policy. It does not treat this newly found issue as failure of the already repaired safe-error hypothesis, and does not introduce new business scope or an approval gate.
