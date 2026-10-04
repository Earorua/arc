# Cloudflare Auth Secret Inheritance Implementation Plan

## Resumed integration — 2026-10-04

User explicitly resumed migration despite the billing UI remaining Processing. Continue independent work; paid activation is unverified, not assumed successful. User confirmed the five shadow Dashboard Secrets have not been configured and requested guidance; the Bitwarden value is already saved.

Root revalidated the existing September 24 artifact without rebuilding: exact preflight passed; all four rendered/client tests passed; 102 focused regression tests across five files passed; typecheck and targeted lint exited 0. The 92-file artifact inventory and source hashes are recorded in ignored outputs/cloudflare-migration-20261004/auth-secret-inheritance-b2-verification.json; the historical deployed-version receipt was preserved.

B1's earlier independent SPEC PASS and distinct QUALITY/security READY remain the implementation reviews. B2's final independent integration quality/security review is READY, with no P1/P2 blockers; all six source hashes and 92 artifact hashes were independently matched. Root is completing the reviewed commit/backup; its resulting SHA and remote outcome are recorded in the main Arc recovery checkpoint after Git operations. No code deployment, cloud-data write, DNS change or Provider request is performed by this task. The pause section below is historical.

## Pause checkpoint — 2026-09-24 14:06 Asia/Shanghai

The user explicitly asked to save and pause. Do not continue tests, deploys or implementation until resumed. This status supersedes unchecked historical execution steps below.

- Task B1 completed: implementer RED 5 failed / 80 passed, GREEN 87 passed; independent SPEC PASS and distinct QUALITY/security READY with no blocking findings.
- Root integration: 102 tests across five files passed; typecheck and targeted ESLint exited 0. Actual shadow build completed all five phases, exit 0, without real credential inputs.
- Task B2 remaining: actual-artifact preflight, non-secret manifest inspection, four rendered/client tests, artifact hashes/new receipt, final docs/diff checks, reviewed local commit and GitHub backup. Do not overwrite the historical deployed-version receipt. No native code deployment is included.
- Migration HEAD remains 330ed9d6d1738fce68817280e910c0f999f17981. Current changes and this plan are local, uncommitted, unpushed and undeployed.
- User confirmed the Bitwarden record Arc Cloudflare shadow BETTER_AUTH_SECRET 20260922 is saved. Five Dashboard Secrets are not confirmed configured; the user paused in response to that step. Do not regenerate the value or request its contents.
- Cloudflare Paid activation, real OAuth, source export/restore and original-account continuity remain unverified. No new Provider request, DNS switch or source-data mutation occurred.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. One bounded implementation, then independent SPEC, then a different QUALITY/security review. The user's existing workflow selection applies.

**Goal:** Make the next shadow code deployment explicitly require and inherit its five Dashboard auth Secrets without ever putting their values in code or build inputs.

**Architecture:** Extend the existing shadow-only config with Wrangler's `secrets.required` names. The exact artifact comparison already derives its expected manifest from this config; retain that strict comparison and add independent manifest fixtures and rejection tests. Local-only builds remain credential-free. The already deployed bootstrap version is not redeployed during this task.

**Tech Stack:** Existing locked Wrangler4.92.0, Cloudflare Vite plugin1.37.1, TypeScript, Vitest, vinext. No dependency updates.

## Basis and boundaries

This implements the follow-up already documented and independently reviewed in docs/operations/cloudflare-shadow-auth-setup.md, under the approved 2026-09-22 migration design. The user asked to continue on 2026-09-24. The code review found plain deploy lacks explicit secret preservation unless requested; `secrets.required` produces named inherit bindings. This does not prove service-side deletion always occurs, and offline checks cannot prove remote secrets exist.

Exact remote names, in order:

```ts
const required = [
  "BETTER_AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
];
```

No real values, `.env` or credential files are read or created. No network/provider request, cloud write, source data transfer, DNS change, new billing purchase or production flag change. Root controls Git commits and backup after both reviews. Existing target resource identities, closed Research flags and local-only defaults stay the same.

## Task B1: Required names and strict artifact validation

**Files:** Modify build/cloudflare-target.ts, tests/build/cloudflare-target.test.ts, tests/build/cloudflare-build.test.ts. Modify the descriptive comment in scripts/check-cloudflare-build.mjs if needed; do not weaken its comparison or allow arbitrary secret bindings. Root owns operations docs and this plan.

- [x] RED: In target tests, assert remote `config.secrets` deeply equals `{ required: [the five literal names above] }`; assert local config has no secrets declaration. Independently update manifest() in artifact tests with the five literal names and retain its successful read-only/CLI cases.
- [x] RED: Add artifact rejection cases for omitted secrets, empty required list, each individually missing name, extra OPENROUTER_API_KEY, duplicate name, unknown nested key or literal value, plaintext BETTER_AUTH_SECRET in vars, and keep_vars=true. Exercise checkCloudflareBuild against the temporary fixture; do not replace it with a mock.

```ts
const config = manifest();
delete config.secrets;
await expect(checkCloudflareBuild(await fixture(config))).rejects.toThrow();
```

Keep a CLI rejection case that inserts only a synthetic secret sentinel and proves stdout/stderr do not disclose it. Existing bounded error output is retained.

- [x] Run RED before production edits: `npm run test:unit -- tests/build/cloudflare-target.test.ts tests/build/cloudflare-build.test.ts`. Record behavioral failures, not just a harness failure. Some strengthened rejection cases may already pass because the current comparison is strict; the new successful required-manifest case and remote-config expectation must fail.
- [x] GREEN: Replace only the shadow portion of createCloudflareConfig's spread with the following (use a fresh array for each returned config):

```ts
...(target.stage === "shadow" ? {
  account_id: target.accountId,
  secrets: { required: [
    "BETTER_AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
    "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET",
  ] },
} : {}),
```

The parser still refuses caller-supplied secrets/values/extra inventory keys. No keep_vars, unsafe bindings or secretsFile workaround. The preflight's expected config derives this declaration automatically; only its comment needs to clarify that required names are allowed while literal values and undeclared names are refused.

- [x] Run focused GREEN, then `node ./node_modules/typescript/bin/tsc --noEmit --incremental false` and targeted ESLint with --no-ignore for the changed build/script/test files. If locked plugin types or behavior reject secrets.required, report the actual error; do not suppress it or change dependency versions.
- [x] Self-review scope, reports and synthetic-only fixtures. Report RED/GREEN outcomes and concerns to Root. Do not commit until independent reviews finish.
- [x] Independent SPEC reads code/tests against these exact requirements; independent QUALITY/security follows SPEC PASS. Fix any blockers through the implementer and repeat the affected review.

## Task B2: Root integration and handoff

- [x] After reviews, Root reruns focused tests and performs one actual shadow build with process-only `ARC_CLOUDFLARE_TARGET=cloudflare.shadow.json` and `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false`. Do not configure process auth values. No real secret file is created for build.
- [x] Run `node --experimental-strip-types scripts/check-cloudflare-build.mjs cloudflare.shadow.json`; inspect only the non-secret manifest and ensure the exact five required names, original four runtime vars, and exact resources are present. Run the existing four rendered/client tests against that build. Build/CLI integration failures require investigation, not a looser validator.
- [x] Record generated-artifact hashes and tested results without overwriting the prior deployed-version receipt. A newer local artifact is not deployed by this task.
- [x] Update auth setup and migration progress: Dashboard entry and real OAuth remain user-dependent, paid activation still unverified, source export/restore still required. The next native code deployment must first confirm each remote binding is Secret by name/type, then inherit by name. Missing-secret service rejection remains a later native validation, not something offline tests establish.
- [ ] After whitespace checks and both reviews, commit only reviewed migration files; back up the exact migration branch under existing authorization. Do not merge master or include the original Research worktree's unrelated dirty files.

The first-ever shadow bootstrap deployment intentionally had no auth secrets. After this change a new remote deployment requires those names to be configured; do not bypass this gate by removing the declaration. User can configure and test auth on the existing deployed code before any later code upload.
