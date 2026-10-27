# Arc v8 saved handoff r126

The user requested saving progress and temporarily closing Codex. Goal status was actually changed to **paused**. All three current subagents are completed, all root execution sessions have closed, and no new cloud rehearsal or real-model request was started in this continuation. Resume only when the user asks to continue.

## Completed in this continuation

Task2 independent SPEC on `scenario-ops-r1` passed. Different QUALITY found a real lifecycle bug: historical activation reconstruction incorrectly required the current handoff/control/receipt/report namespaces to remain unused. Preserve that failed frozen candidate and both reviews.

The narrow successor is `outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261017-snapshot/scenario-ops-r2` (U). Among its 26 runtime files only `evaluate.mjs` changed. Historical provenance now remains verifiable after legitimate output, while both unchanged live activation paths still apply the complete unused-scope guard. Original identities, authority and clocks remain checked.

Author verification passed 73 focused tests, 38 syntax checks and 10 fixed CLI refusals. The new lifecycle regression first produced 2 expected failures against r1, then all 7 tests passed after the correction. Its 17 occupied-scope cases still reject live activation. The original 143-file directory was preserved.

Independent successor SPEC passed, including 15 focused tests and 22 live-operation guard-order cases. Different QUALITY passed, including 40 independent lifecycle/tamper observations and 7 focused tests. Root read and verified their references. Do not rerun these reviews without an actual change or new finding.

Root successfully generated the actual new preparation once and ran all three exact static deployment dry-runs: activate, admission-close and maintenance-close. Every child closed with exit 0, `commandSucceeded:true`, `mutationAttempted:false`, `LOCAL_DRY_RUN_ONLY` and a valid local output projection. Root reconstructed all three through the reviewed `loadOperation()` before writing acceptance. These were local packaging checks, not deployment, current native readback or activation.

## Exact current references

All following files are in U unless otherwise stated:

- `implementation-freeze-r1.json`: `e859f9ddf3e52c94c034f28a12c83cc2c321417900c12e387b39b3370f3b825d`
- `derivation-r1.json`: `951a1d2c208333e2de2e7dd1d38672d5a43ac7b69c06a1c75b077cc4fa327116`
- `local-offline-author-delivery-r1.json`: `b297f4c000dcee9be6bb028ce6b4022f347c0c8580f10d0c2ddac50360487e79`
- `spec-review-r1.json`: `f00bd36e91c608e8f1ec668c0e091d3f0b3fe6bd7b650827f0701ca02c4b0dbe`
- `quality-review-r1.json`: `526edb1ada2fff2b6a3f37163b834c2abf19a5b0d32701ab0c999dec3cdcee05`
- `local-offline-profile-r1.json`: `a8a3327ad8e66294a9ba2e39c23b3b0d0015ec458ed2b10f9a4bf6e56e03edae`
- `preparation.json`: `dbf7072b0321fbf03d34ce3b0d0b511308c98b767f2cd253b2cb416e27e34b9d`
- `activate-dry-run-result.json`: `ed5b11943b56b4717307222911cea0543ea003fb1840253639e4234bef1333c6`
- `admission-close-dry-run-result.json`: `dd24ad60c600883453cf35c62d0dde64a3aa05e917a0a0282fc0af7175ae19ce`
- `maintenance-close-dry-run-result.json`: `68155a3d7cb2aeff93aba524d2eb011ea79b91db914f0b4b58c585d57e894b3b`
- `root-task2-acceptance-r1.json`: `3631c15948b204cfecd02f5e134e581e19a1bc1f90b3e34d093903d46b0d4fa0`

The preparation, inventory, three configs, three dry-run attempts/results and root acceptance are **consumed and immutable**. Do not rerun `prepare.mjs` or those dry-runs. Actual activate/deploy, attended controls and Task3 acceptance remain absent. All old schema initialization and Task1 assembly acceptance also remain valid and must not be repeated.

## User direction and remaining review

The user explicitly requested necessary review without excessive review. See sibling `review-scope-user-direction-r1.md`. Reuse unchanged accepted evidence, test actual changed behavior and critical integration only, and use targeted follow-up for small fixes. Do not restart entire audits for formatting, optional strengthening or repeated counts.

Before the planned new cloud mock sequence, the remaining planned code-review rounds are now Task3 SPEC and different Task3 QUALITY. Task2 review is finished. Task3 itself has **not been implemented**: derive the nine attended commands from the accepted unchanged masked launcher and S's corrected terminal flow; measure the complete actual local handoff, including repeated validation and fault arming, against the finite profile. The profile remains 7,022,000 ms, cap256, initial254 rows at zero unmatched starts. Single-entrypoint timing is not proof of the full Task3 path. No timer may be enabled while awaiting user readiness.

The planned outstanding full mock acceptance is one sequence containing LONG, after-r2 and after-d1, their original status/receipts/replay/account-isolation evidence, and proper delayed closure. Earlier LONG success and repaired settlement remain useful historical evidence, not a retrospective PASS for an incomplete consumed epoch. Do not run old commands or reuse their clocks.

## First restricted real Research: read-only feasibility work started

The user questioned why many simulations had not yet led to real Research. Root explained that full fault simulation is not an absolute technical prerequisite to a first tightly restricted paid test, and offered to examine bringing that first experience forward while retaining full fault/account-isolation acceptance before public enablement. This is a proposed sequencing improvement under investigation, **not** permission to open admission, call a model, bypass verified data protection or mark Task15 complete.

Local read-only inspection confirmed the actual existing candidate directory:

`C:/Users/XF/.codex/worktrees/arc-v8-release-integration/restricted-research-candidates/research-local-closed-20261016-r5`

Its artifact/source manifests exist and the artifact state is `closed`. The authoritative production source is the sibling `C:/Users/XF/.codex/worktrees/arc-v8-release-integration/v8-openrouter-research-beta`. These paths are **not** under R16 outputs; current session write permission covers W, so do not silently edit that separate source worktree.

Read these existing documents and reuse their accepted work:

- `docs/superpowers/plans/2026-10-16-arc-v8-restricted-environment-initialization.md`
- `outputs/local-durable-executor-20261016/after-r3-settlement-next-steps.md`
- `docs/superpowers/plans/2026-10-15-arc-v8-restricted-research-configuration.md`
- Existing bootstrap SPEC/QUALITY files under `outputs/local-durable-executor-20261016/restricted-executor-bootstrap-local-r1/evidence` were found; read their actual verdicts/hashes before reuse rather than assuming new review is necessary.

The old initialization plan explicitly sequences operations after Task15 acceptance. Before bringing restricted testing forward, make the bounded changed ordering concrete and distinguish it from public acceptance. No implementation, cloud action or actual new target inventory was created during the feasibility read.

The genuine outstanding environment work includes fresh verification and preservation of the existing login-enabled shadow Site and its data, a distinct private production Executor/resources, required bridge/provider secrets, actual authenticated owner cohort, signed private connectivity, and a build using the real verified target identities. The already built synthetic closed target cannot simply be renamed into a deployment. The existing Google/GitHub login work and accepted source/build tests are reusable.

A real call still requires new explicit one-shot paid permission for the concrete owner/candidate/model and a dedicated non-renewing key cap. Existing plan proposes `moonshotai/kimi-k3`, low reasoning, 32k output, 20-minute Provider / 21-minute lease, USD5 maximum and zero Repair/paid retries; verify current availability before seeking that concrete permission. No old paid authorization is reusable. The user must handle all actual credential values privately.

## Pause and remaining goal

Tasks15,16,17 and public Research remain incomplete. Remaining goal groups are: prepare a restricted real environment; perform capped real Research plus login/account/learning-flow acceptance; finish the one complete fault/replay/closure mock sequence; then complete old-site export/restore, migration, domain/OAuth cutover and public post-release verification. Functional acceptance is separate from code review.

Latest actual cloud observation remains schema final `2026-10-18T08:12:32.390Z`, with admission and maintenance disabled and Cron empty. It is historical, not a fresh gate or proof of no platform invocation/fees. This continuation added no cloud deployment, native query, control or model request. No original job has been restarted.

Suggested resume request: `继续 Arc v8，从 r126 保存检查点继续，优先核对受限真实 Research 测试路径。`
