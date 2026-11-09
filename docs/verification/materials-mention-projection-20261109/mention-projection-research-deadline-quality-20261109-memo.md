PASS — independent QUALITY review of the minimal Research control deadline fix, 2026-11-09. The two-file patch is ready for the parent's fresh full-checkout acceptance run. This is not full Task 4 acceptance or authorization for release.

Critical: none. Important: none. Minor: none. No actionable finding from the actual diff, surrounding control/authentication/body/nonce code, new tests, or bounded verification.

Reviewed `scripts/test-research-cloud-smoke.mjs` and `tests/server/research-cloud-smoke-composition.test.ts` on `codex/materials-replan-recovery-20261106`, HEAD `4d6bc823e5609a008acf86644ddc8a3b33f844ca`. Read both routing sources via the local index and parent's saved live GitHub routing text/results, offline. Applied the requesting-code-review template and verification-before-completion checklist. Parent-owned plan and verification documents were preserved and excluded from review.

The latch is scoped to one control invocation and set before watchdog abort/rejection (`scripts/test-research-cloud-smoke.mjs:227`, `:241`). The shared check and retry condition consume it (`:235`, `:253`), while the check after signing runs inside the existing cleanup boundary (`:238`, `:251`). Ordinary quick failures do not set the latch, preserving reconciliation and the 3/1 start/status attempt limits. No authentication, nonce persistence, identity, source, sealed-artifact, CLI, Worker, runtime, or materials-v3 logic was changed. The two exact-source tests explicitly identify synthetic isolation and assert pending/no acceptance, call counts, paths, and signal cleanup (`tests/server/research-cloud-smoke-composition.test.ts:121–159`).

Fresh reviewer evidence, each executed through `node work/grounded-verification/run.mjs` with an unused label and zero non-loopback denials:

| Label suffix, following `mention-projection-research-deadline-quality-20261109-` | Command after label | Result | Log SHA-256 |
| --- | --- | --- | --- |
| `regression-a` | `node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-composition.test.ts -t 'isolated control deadline boundary' --reporter=verbose` | Exit 0; 2 passed, 87 filtered/skipped | `8b7d263d5e7d00cf620a3450a7aaa6b31a3faa0e62caa63f5019c6239df4f914` |
| `lint-a` | `node_modules/eslint/bin/eslint.js scripts/test-research-cloud-smoke.mjs tests/server/research-cloud-smoke-composition.test.ts` | Exit 0, no diagnostics | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `probe-a` | `work/grounded-verification/mention-projection-research-deadline-quality-20261109-probe.mjs` | Exit 0; 14/14 local adversarial cases; frozen manifest verified before/after | `fdfdaeef136124c5c703ba41cc23d53deff1aae0f4d632a75de95574e8137a10` |

The independent exact-source probe covers synchronous/asynchronous quick failures, status's single attempt, early body failure without latching, 503-to-accepted reconciliation, accepted-start cleanup, signing at/after the 5s/10s boundaries, signing crossing the deadline during retry, a fractional status watchdog, and late transport/body/authentication/nonce completions. All dispatched signals are aborted and no timers remain. Late transport cannot resume body parsing; late body/authentication/nonce completion fails closed without acceptance. Detailed events are in `mention-projection-research-deadline-quality-20261109-probe-results.json`.

All 1,007 non-document source files match the approved freeze before and after the probe. Identity:

- Manifest: `12b789509f1fcee928f0e97c5cfcf055cca470c6f41db38b47dad475f94314c0`.
- Driver: `6f351aecd1d5723b6f8dd8737965e036a637ee49d5d452944e452d82e0445e20`.
- Composition test: `da97fada6f1898704331dd7295e93fda085362e527bc53ddfb0c7b8e080681df`.

Limits: the adversarial probe supplies synthetic scheduling, signing, body reading, verification and nonce storage around the exact current private functions; it proves local control flow, not native cryptography or persistence. Late-completion probes release their dependencies and do not assert cancellation of indefinitely hung signing/authentication/storage. The native pair, 87 filtered tests, full repository and full-checkout build were not rerun here. Prior author/spec execution was context, not relabeled as reviewer execution. No source/test edits, commit, model call, network, deployment, migration or push occurred. Only ignored review evidence was added. Full Task 4 remains HOLD until the parent's fresh full-checkout gate passes.
