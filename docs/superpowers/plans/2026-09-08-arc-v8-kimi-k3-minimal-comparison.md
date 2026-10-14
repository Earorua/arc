# Arc v8 Kimi K3 minimal comparison

> Use the already approved subagent-driven development, TDD, specification review, then quality/security review. Preserve every existing uncommitted change and historical result.

**Goal:** Prepare one user-run Kimi K3 minimal comparison with the previous Astra test.

**Architecture:** Reuse the isolated minimal probe and masked launcher, replacing only their fixed model selection/message and existing test contracts. Keep the full Research path unchanged.

**Tech Stack:** Existing TypeScript, Vitest, PowerShell and Node runner; no new dependencies.

**Current status — 2026-09-08:** The user-run Kimi minimal request **passed (HTTP 200, expected OK)**. Its one-shot permission is consumed. The handoff command below is historical; do not rerun it or infer authorization for full Research. This is a minimal invocation success only.

## Design and authorization

The user requested “换用kimi k3试试” after the GPT-6 minimal request returned 403. This authorizes preparation and one new user-run minimal comparison with `moonshotai/kimi-k3` through the same OpenRouter endpoint and masked launcher. It does not authorize a full Research request, additional automatic attempts, production changes or agent access to real credentials. The previous four POST permissions remain consumed.

Change only the fixed minimal-probe model and its launcher message/contract expectations. Keep the public sentence `Reply exactly OK.`, `max_tokens: 512`, `stream: false`, and `provider: { require_parameters: true, data_collection: "deny", zdr: true }`. Keep key preflight requiring an unused, non-resetting dedicated key with a cap at most USD 5; one GET then at most one inference POST, no client retry/repair, 120-second inference deadline, 65,536-byte response limit, screened diagnostics and numeric receipt preservation. No search, JSON Schema, proxy/TLS changes or database operations.

The existing `-ProbeMinimal` / `--probe-minimal` entry now targets Kimi K3. Full Research and account-check model settings remain Astra; those modes are outside this comparison. The website remains on the deployed Research-closed version. Keep original GPT-6 implementation-plan hashes and summaries as historical evidence. Kimi's listing and public capabilities do not prove the user's key has a permitted route. Empty output remains incomplete without retry. A success only demonstrates this model's minimal call, and does not establish full Research readiness or diagnose the earlier Astra rejection.

## Implementation task

- [x] Save initial hashes of the three change targets, then update test expectations first and observe valid RED for the requested model change using synthetic fetch only.
- [x] Set the minimal-probe fixed model to `moonshotai/kimi-k3`; change only the minimal-mode launcher message. Update `tests/server/minimal-probe-transport.test.ts` contract fixtures/expectations, including reported requested/actual model. Do not change full Research/account-check scripts, transport, runner dispatch, error classifier or historical documents.
- [x] GREEN: run the focused minimal-probe transport tests; root verifies the five existing diagnostic/regression files (previously 331 tests), nonincremental TypeScript, targeted lint and diff checks. No valid-key live CLI execution or real model request during verification.
- [x] Independent specification review, then independent quality/security review, focused on this delta and preserved request boundaries; fix any actionable findings before handoff.
- [x] Record verified source fingerprints and preparation state in this plan and the resume checkpoint. Hand off the one masked command below; no commit, push or deployment in this preparation.

Change targets:

- `scripts/live-research/minimal-probe.ts`
- `scripts/live-research/run.ps1`
- `tests/server/minimal-probe-transport.test.ts`

Implementation is the literal model replacement below, plus the same replacement in the existing minimal test response/request/actual-model expectations. The full Research launcher message stays Astra.

```ts
const MODEL = "moonshotai/kimi-k3";
// Add to existing summary assertions:
expect(result).toMatchObject({ requestedModel: "moonshotai/kimi-k3" });
```

Focused RED/GREEN command: `npm run test:unit -- tests/server/minimal-probe-transport.test.ts`.

Root regression command: `npm run test:unit -- tests/server/minimal-probe-transport.test.ts tests/server/live-minimal-probe.test.ts tests/server/live-research-validation.test.ts tests/server/live-account-check.test.ts tests/server/provider-failure-diagnostic.test.ts`.

## Baseline fingerprints

SHA256 before this comparison (working files, not necessarily HEAD versions):

| File | SHA256 |
| --- | --- |
| `scripts/live-research/minimal-probe.ts` | `225fffac735695c414780500de227f57293d7b2ef35a33c83ea7a7d7c4db407d` |
| `scripts/live-research/run.ps1` | `99b1c79fa1814b7c5ba72515091ac07c336e67862b68b74c3dc951fcbc73f4f6` |
| `tests/server/minimal-probe-transport.test.ts` | `93ce775045c294e0905778913795e30c0bae1d9002e80e10a284b28553d919f4` |
| `scripts/live-research/validation.ts` (preserve) | `6f5a1d8538dfda1a49b5da7270a4eee82f64004cc991a80240511a1d48cf662a` |
| `scripts/live-research/account-check.ts` (preserve) | `7353d74d985035bd1caa33e77875679fbb749ca395dfee50500b6941bffdab57` |
| `scripts/live-research/runner.mjs` (preserve) | `47305aa27df034bea1e669016bb8b2d83338425e4e67da476d050a2b4858a226` |
| `scripts/live-research/transport.ts` (preserve) | `1eb21e6eaf07ba9bb6d7c61bd060b03bf767775a046b87b9c7a1838442ff8a00` |
| `scripts/live-research/safe-error-explanation.ts` (preserve) | `459cba6c52bb46a093ca8d8abc59bdebeeaedef28e3731b0c500748468d0eba92` |

## Handoff

Historical handoff command, already executed once successfully (do not rerun):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\live-research\run.ps1 -ProbeMinimal
```

The first message must say `One minimal inference request: moonshotai/kimi-k3`. The key is entered only at the masked prompt. Stop after any outcome; do not rerun or use `-ExecuteOne`. On “已运行”, inspect only the new allowlisted summary: mode `minimal-probe-one`, requested model Kimi K3, key/inference counts at most one each, Research/Repair zero, status and safe diagnosis, output class and numeric receipt. Missing cost stays unknown. Mark this one permission consumed after an observed attempt rather than replaying a previous handoff.

## Evidence and current state

Preparation and the one user-run comparison are complete. One Kimi inference POST followed one key preflight GET and passed. Branch `codex/v8-openrouter-research-beta`, HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`; 14 existing modified/untracked files are intentional. This plan makes 15 expected local changes. No commit, push, deployment or production operation was performed.

Implementer TDD RED observed: focused suite **15 failed / 14 passed (29 tests), 5.60 seconds**, exit 1. The direct offline assertion received requested model Astra instead of Kimi; injected live request assertions also rejected the old model. All credentials and fetch responses were synthetic. This is an expected contract failure, not a sandbox startup failure.

Implementer GREEN: **29/29 passed, 4.61 seconds**. Root fresh regression: **5 files / 331 tests passed, 15.40 seconds**, exit 0. Nonincremental TypeScript, targeted ESLint and diff checks passed; existing SQLite experimental/Git line-ending warnings only. Independent specification review returned **READY, no actionable gaps**; subsequent independent quality/security review also returned **READY, no actionable P0/P1/P2 findings**.

Prepared Kimi source SHA256:

| File | SHA256 |
| --- | --- |
| `scripts/live-research/minimal-probe.ts` | `16837a59f9b22e10271d69267c416788d1feb1129bb9f0e35a6c7d0b13cddf9a` |
| `scripts/live-research/run.ps1` | `0c07cb167063d0746a8c0720f7cf7cd76deff2175a37c8e2c69fea4fed6ab45f` |
| `tests/server/minimal-probe-transport.test.ts` | `26eedd26b1304ced007720bdb34b25a4ed86595c2412470fec261caefccd331a` |

Root verified all five preserve-marked baseline files still match. Replacing Kimi back to Astra only in memory makes both runtime source hashes exactly equal their baseline hashes, demonstrating no other runtime-byte changes in this comparison. This check reads source text, not credentials or outputs.

### User-run success

- Start UTC **2026-09-08 12:48:19.648** / GMT+8 **20:48:19**; allowlisted summary `outputs/live-research/summary-2026-09-08T12-48-19-648Z.json`, 689 bytes, SHA256 `748232ec2fc42b5c43014c84ae3445ee7d3b502baab1c428f060899741f516e3`. Runtime minimal module and launcher hashes were rechecked and match the prepared hashes above.
- `mode: minimal-probe-one`, **`outcome: passed`**, reason null. Requested and actual model both `moonshotai/kimi-k3`. Key 200 / complete / 2,396 ms; inference 200; `output: expected-ok`. No inference error diagnosis or message explanation.
- Receipt: prompt 127, completion 27, total 154 tokens; **costMicros 682 = USD 0.000682**. No post-run balance or billing query was made.
- Exactly key GET 1 + minimal inference POST 1; real request count 2, full Research 0, Repair 0, no client retry. The one permission is consumed and the key now reports a nonzero usage receipt; do not relax the unused-key preflight for a rerun.
- This proves the minimal Kimi call under the retained request/privacy constraints worked. It does not establish why earlier models returned 403, independently confirm unchanged credentials/egress across attempts, validate full Research, or permit production enablement. Root recorded the result only, without any new model call or implementation changes.

Official source checked on 2026-09-08: [OpenRouter Kimi K3 model page](https://openrouter.ai/moonshotai/kimi-k3), exact slug `moonshotai/kimi-k3`, text input/output and a completion cap supporting the existing 512-token bound. Public page access used no key and no inference. No `latest` alias or batch variant is used.
