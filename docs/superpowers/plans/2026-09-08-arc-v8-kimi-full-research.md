# Arc v8 Kimi full Research preparation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Follow TDD, independent specification review, then independent quality/security review. Preserve the existing dirty working tree.

**Goal:** Prepare the existing complete Research-to-planning validation path for Kimi K3 and verify it offline before requesting a new bounded live attempt.

**Architecture:** Reuse the approved provider-neutral Research, source audit, immutable package, owner resolver and deterministic planner. Change only the local validation model/config identity, account diagnostic target and launcher message. The application already accepts an explicit server model and uses the required Exa server tool and strict JSON schema; do not rewrite or relax those modules.

**Tech Stack:** Existing TypeScript, Vitest, PowerShell, Node and isolated in-memory SQLite. No new dependencies or migrations.

**Current result — 2026-09-08:** The user executed the authorized complete Kimi Research once. Key and Research HTTP status are 200, but the result is **incomplete/research-failed**, with no complete response/usage/Ready/planning evidence. Its permit is consumed; the handoff command below is historical and must not be rerun. Details are recorded at the end of this plan and in the latest checkpoint. Local preparation remains verified; full live acceptance remains incomplete.

## Context, decision and scope

The user asked “api的问题是不是解决了？那么继续剩余的功能搭建” after the Kimi minimal request succeeded. This resumes the approved Arc v8 implementation and validation path; Tasks 1–12 and the accepted local main-flow UAT are complete. A minimal OK response proves neither source-backed Research nor final production readiness. Continue local preparation now; do not repeat completed feature work or wait for the earlier GPT-model support case before making useful progress.

Three approaches were considered: continue waiting for the GPT-model investigation; replace the provider architecture; or use the successful Kimi model through the existing generic adapter. The third is the smallest change supported by current evidence and preserves all accepted contracts. The earlier GPT 403 cause remains unknown. This is a continuation of the approved Research design, not a new chat feature or redesign.

Public primary references checked 2026-09-08:

- [Kimi K3 model](https://openrouter.ai/moonshotai/kimi-k3): exact ID `moonshotai/kimi-k3`; advertises tools/tool_choice and structured response_format. Published price is USD 2.50/M input and USD 14/M output; these rates are not a test receipt or guaranteed total.
- [Structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs): support and strictness vary by endpoint; preserve require_parameters and all local schema/domain checks.
- [Web Search Server Tool](https://openrouter.ai/docs/guides/features/server-tools/web-search): supports models through Exa, bounded searches and citation annotations. Preserve Exa fast, 2 uses, 10 total results and 2,000 characters per result. The deprecated plugin is not used.

Prior minimal success: `summary-2026-09-08T12-48-19-648Z.json`, requested/actual Kimi K3, HTTP 200, expected-ok, costMicros 682. All five prior inference permissions are consumed. This preparation issues **zero real Key GETs, catalog GETs or inference POSTs**. A future complete Research attempt will need explicit approval; present its concrete reviewed scope at handoff, not an already-runnable paid command. Keep the USD 5 unused/non-resetting dedicated-key policy; the previously used Key no longer satisfies that preflight.

Preserve real-key secrecy, masked stdin, fixed destinations, no redirect/retry, no Repair, 30-second key / 120-second Research / 180-second launcher deadlines, numeric cost handling and safe summaries. Do not read real env files, raw provider outputs or secrets. Do not change the live website, production flags/secrets/D1/R2, master, commits, pushes, Sites candidates or deployment. Application model templates remain unset and Research remains closed online.

## Task 1: Prepare Kimi full Research and regression coverage

**Modify:**
- `scripts/live-research/validation.ts`
- `scripts/live-research/account-check.ts`
- `scripts/live-research/run.ps1`
- `tests/server/live-research-validation.test.ts`
- `tests/server/live-account-check.test.ts`

Root owns this plan, `docs/operations/v8-resume-checkpoint.md`, and the current-state correction in `docs/operations/v8-release-gates.md`.

- [x] Update tests first: assert literal Kimi model in offline summary, full Research request/summary and account catalog expectations; assert the full launcher prompt explicitly names Kimi. Run both files and observe model-contract RED before source changes.
- [x] Add meaningful injected-fetch integration checks through the real adapter/orchestrator/D1/planner: valid Kimi candidate yields Ready, sources/skills and owner-bound planning; a bare minimal `OK`, a valid-schema candidate missing skill evidence, and a minute-mismatched candidate cannot pass full acceptance or generate planning. Domain-invalid cases must enter Needs review, retain issue codes and any credible reported usage, and perform zero Repair or extra POSTs. A prior Astra model in the receipt must not be accepted as Kimi success.
- [x] Make only these runtime replacements:

```ts
// scripts/live-research/validation.ts
export const LIVE_POLICY = Object.freeze({ model: "moonshotai/kimi-k3", maximumMicros: 5_000_000, timeoutMs: 120_000 });
// Existing orchestrator configuration:
configFingerprint: "live-validation-kimi-k3-v1"

// scripts/live-research/account-check.ts
const REQUESTED_MODEL = "moonshotai/kimi-k3";
```

```powershell
# Existing full Research message in scripts/live-research/run.ps1:
Write-Host 'One live Research request: moonshotai/kimi-k3; dedicated unused USD 5 key; no repair or retry.'
```

All other runtime bytes must remain unchanged. Keep the previously fixed stdout/stderr forwarding and minimal probe intact. If the new domain-invalid tests reveal a real pre-existing defect, report it for a bounded follow-up rather than weakening assertions or expanding source scope silently.

Example behavior assertions to use with existing synthetic key/fixture helpers:

```ts
expect(await runValidation()).toMatchObject({
  mode: "offline-dry-run", requestedModel: "moonshotai/kimi-k3",
  actualModel: "moonshotai/kimi-k3", outcome: "passed", realRequestCount: 0,
  runState: "ready", ownerWrongReadRejected: true, planningGenerated: true,
});
// Inject candidateWithMissingCitations() or candidateWithMinuteMismatch()
// as choices[0].message.content in fixtureResponse(); return safeKeyData for KEY_URL.
expect(result).toMatchObject({ outcome: "incomplete", runState: "needs-review",
  planningGenerated: false, freshAccountActivated: false, repairRequestCount: 0,
  researchRequestCount: 1, databaseDisposed: true });
expect(result.quality.issueCodes).toContain(expectedIssue);
expect(fetch).toHaveBeenCalledTimes(2);
```

- [x] Focused GREEN: `npm run test:unit -- tests/server/live-research-validation.test.ts tests/server/live-account-check.test.ts`.
- [x] Root regression: run those two files plus `tests/server/openrouter-provider.test.ts`, `tests/server/research-environment.test.ts`, `tests/server/research-planning-integration.test.ts`, `tests/server/live-launcher-output.test.ts`, `tests/server/minimal-probe-transport.test.ts`, `tests/server/live-minimal-probe.test.ts`, and `tests/server/provider-failure-diagnostic.test.ts`. Run nonincremental TypeScript, targeted lint and diff checks. All tests use authored fixtures, no real provider requests.
- [x] Root actual default PowerShell invocation (no live switch, no Key) must visibly report offline-dry-run / passed / Kimi / zero real requests / Ready / sources / owner / planning / disposal. Record the newly generated safe summary separately from the old live Kimi result.
- [x] Independent specification review then independent quality/security review; resolve material findings and record exact final source hashes.
- [x] Save the updated checkpoint and release-gate status. Explain that local Kimi full preparation is complete while real Research and production activation remain separate gates. No commit/push/deploy in this slice.

## Verification baselines

Branch `codex/v8-openrouter-research-beta`; HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`; 17 intentional uncommitted files before this plan. This plan and the release-gates edit bring the expected total to 19; existing files must not be reset.

| Source | SHA256 before this slice |
| --- | --- |
| validation.ts | `6f5a1d8538dfda1a49b5da7270a4eee82f64004cc991a80240511a1d48cf662a` |
| account-check.ts | `7353d74d985035bd1caa33e77875679fbb749ca395dfee50500b6941bffdab57` |
| run.ps1 | `9253c413e2d2666ec31c5a9f1863c64f56150a7df7b5fb8ae72f436b442a2a26` |
| app/server/research/openrouter-provider.ts (preserve) | `cefcebc65ca658596e46785fa14499804d6668bed7227376751b7f29d8a8a37d` |
| app/server/research/service-factory.ts (preserve) | `2a091fbf7573bff671d41494352bee3b226ff89ab6c5bb97d42b6ae8c950589b` |

## Remaining sequence after local preparation

1. Obtain explicit approval for one complete Kimi Research attempt for the public test role `Data Product Manager` / `en-US`, maximum USD 5, at most one Key GET plus one Research POST, 2 searches / 10 results / 12,000 output tokens, no Repair/client retry. User alone supplies a fresh unused dedicated non-resetting Key capped at no more than USD 5 in the masked prompt; do not ask them to send it in chat. No personal learning/profile/Proof data is sent. Do not consume a permit by assuming the minimal success authorizes this.
2. Read only the resulting safe summary. Require actual Kimi, HTTP 200, real search usage, valid citations/skills/units, Ready, owner isolation, planning integration and numeric cost within the cap. Failed/Needs review/unknown cost remain incomplete and are not retried automatically.
3. After full Research evidence passes, prepare authenticated target-environment acceptance, server configuration and controlled Research activation. Existing migration/recovery/artifact and account-login evidence gaps remain explicit. A separate production scope is required before activation/deployment.
4. Review and back up the final source under the user's then-current integration scope; do not treat the earlier closed-Research deployment or development-branch backup as approval to merge master or enable paid public access now.

## Implementation and verification evidence

Corrected functional RED: **15 failed / 164 passed, 7.52 seconds**. Initial sandbox spawn EPERM happened before test collection and is not RED. An earlier test incorrectly grouped bare OK with domain Needs review; it was corrected to the existing Failed/research-failed behavior before the authoritative RED above. All corrected failures were the intended model/catalog/banner mismatch, with runtime source still at its baseline.

Implementer GREEN: **2 files / 179 passed, 8.33 seconds**. Targeted ESLint and scoped diff check passed. The four added integration cases cover bare OK, missing citations, minute mismatch and a prior Astra receipt. Failed and Needs-review outputs retain credible fixture usage but never activate an account or generate planning; no extra request or Repair occurs. The valid Kimi fixture becomes Ready and produces owner-bound planning. Wrong-model receipt prevents the full acceptance verdict; this check is distinct from the existing in-memory domain/plan validation.

Root fresh verification: **9 files / 494 tests passed, 11.94 seconds**; nonincremental TypeScript, targeted ESLint and diff check passed. Default PowerShell in a real tool PTY exited 0 and visibly printed the safe JSON and Summary path. Its new report `summary-2026-09-08T13-35-19-614Z.json` was read back as **offline-dry-run / passed / requested+actual Kimi / realRequestCount 0 / Ready**, 6 fixture citations, 3 fixture skills, 6 planned units; owner rejection, repeat-call rejection, fresh activation, planning and database disposal all true. Its USD 0.10 usage is synthetic and is not a real charge or estimate. No real Key, catalog or inference request was sent.

Root inverse-replaced only the four intended runtime strings in memory; all three source SHA256 values exactly restored the baseline table above. This demonstrates preservation of all other runtime bytes, including the PowerShell output fix. App adapter/factory remain unchanged, as do runner, minimal probe, guarded transport and safe-error explanation. The original live Kimi success summary remains separate and unchanged.

| Source | Final SHA256 |
| --- | --- |
| validation.ts | `08f118d97372e81aef68e4991ad19210ec6edf2d59e1b20c0916f36376a9f424` |
| account-check.ts | `f1d53c4dd18eb2618ede427c1aa0093ea94d5205a4b8fa1d29daae8efbf6369f` |
| run.ps1 | `72af6004cbd6636305aa567696d76c2237fa81ecfccf502f279319444ab4373c` |
| live-research-validation.test.ts | `ee81aa82da66d6774958c7c69284d34c8de0c9742a8390ee2f668a3e1048bbc9` |
| live-account-check.test.ts | `1c1a5ea79398ff682a2a2985c64bb4309361860bab66216f0cc6504b8a5987d4` |

Independent specification review **READY, no actionable gaps**; the reviewer independently checked final and inverse baseline hashes, the actual tests and unchanged adapter/factory. Subsequent independent quality/security review also **READY, no material correctness, security, scope or test-quality findings**; all five reviewed file hashes match this plan. Both reviews were read-only and performed no live requests.

**Local preparation is complete.** All 19 expected uncommitted files and HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc` are retained. No application/build input, dependency, migration, environment template or hosting configuration changed, so no new site build/deployment or repeated browser UAT was needed for this local validation-script slice. Root completed the targeted regression and actual offline launcher verification above. Full live Research acceptance, source integration/backup and production enablement remain separate; no new real permit is consumed or assumed. The next user-visible action is approval of the concrete one-request scope in the remaining sequence above.

Root offline report SHA256: `0a256b157ae23e76a086d1de3759a2b4395c0b0fdb17f0204372524c85057e45`. The prior real minimal Kimi report remains SHA256 `748232ec2fc42b5c43014c84ae3445ee7d3b502baab1c428f060899741f516e3`; do not treat the newer offline report as a live attempt.

## Authorized one-request handoff

Root rechecked all three prepared runtime hashes plus runner `47305aa27df034bea1e669016bb8b2d83338425e4e67da476d050a2b4858a226` and guarded transport `1eb21e6eaf07ba9bb6d7c61bd060b03bf767775a046b87b9c7a1838442ff8a00`; all match the reviewed preparation. HEAD and 19 intentional uncommitted files are unchanged. No new tests or source edits are needed merely to record approval.

The user creates a dedicated unused inference Key capped at USD 5 with no periodic reset; suggested label `arc-v8-kimi-research-once-20260908`. The earlier successful minimal-probe Key has usage and must not be reused by weakening preflight. Only the user supplies the credential to the masked interactive prompt; do not send it to the agent or store it in source.

Run once from the user's interactive PowerShell (absolute path works outside the worktree):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2\.worktrees\v8-openrouter-research-beta\scripts\live-research\run.ps1" -ExecuteOne
```

First line must begin `One live Research request: moonshotai/kimi-k3`. Enter the new Key only at the masked prompt and let the command finish. This mode performs at most one Key GET followed by one Research POST, no Repair or automatic retry. Do not run `-ProbeMinimal` or `-CheckAccountOnly` as part of this permit.

After any outcome, including missing output or timeout, stop and report “已运行”. Root reads only the new allowlisted `summary-*.json`, requires mode `live-one` and the prepared requested model, records actual request counts/status/usage/cost/quality/owner/planning/disposal, and marks the observed attempt appropriately. No automatic retry on incomplete evidence. This authorization does not include production changes, master integration, commits/pushes, Sites candidates or deployment.

## Authorized attempt result

User reported “已运行”. Safe report `summary-2026-09-08T13-52-03-953Z.json`, 989 bytes, SHA256 `4969ecaff86d720a54a99fe658afc1b4622655784d66e8ca1d90729fecf4a62b`: start UTC13:52:03.953 / Beijing21:52:03, file written UTC13:54:04.8135985 (approximately120.861 seconds later). Key200/complete/814ms, Research200, mode live-one, requested Kimi; outcome incomplete/research-failed, Failed run, actualModel/usage/diagnostic null, citations/skills/planning0, activation false, one audit, owner/repeat rejection true, database disposed. Exactly one Key GET and one Research POST, zero Repair. The temporary ledger recorded conservative-hold with maximum5,000,000 micros and settled0 before disposal; missing provider usage means cost unknown, not zero.

All reviewed runtime hashes matched before reading the report. Timing is consistent with the Research deadline after key preflight, but the original summary omitted the existing application failure classification, so timeout is an inference only. Subsequent user-provided Activity details identify two children under the same parent: first native completion12000/reasoning11334/native length, 94.864seconds and USD0.1581398; second Exa10results, 232.585seconds, cancelledtrue, USD0.11268125 including web0.014. These are real inference/search observations, not complete parent output, aggregate billing or the missing client receipt. Sanitized details and interpretation are in `2026-09-08-arc-v8-research-failure-summary.md`; the full account/Key metadata was not copied to the repository. No more Activity exports are required to prepare the next local design around reasoning allocation and coordinated multi-stage timing/cancellation.

The offline diagnostic projection repair is complete: root498/498 tests, nonincremental types/lint/diff and sequential independent spec/quality reviews passed. Current validation.ts SHA256 is `a49a276e736e425d30b066266670d3339dfe15d6f00e357d3abb70e9a752d696`, superseding the preparation hash only for future source state; this attempt's historical baseline and JSON remain unchanged. No new request or permissive parameter change is authorized; no full Goal2 success, production activation or deployment follows from HTTP200, search results or child costs alone.
