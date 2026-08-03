# Arc. Sites OAuth feasibility gate

**Status:** Product release v7.1 is publicly deployed; primary hosted OAuth flows, current-provider reauthentication, cancellation, and the post-deploy transport smoke passed, while target-provider linking and fresh runtime-log checks remain open.

**Reviewed:** 2026-08-04

**Production origin:** `https://arc-precision-path.jiahe-xu.chatgpt.site`

Arc. requires an independent public account backed by Google and GitHub. The Sites-provided ChatGPT/SIWC client is intentionally not used as the Arc. product identity.

## Version 7 production — 2026-08-02

Version 7 was publicly deployed from the exact saved Sites artifact `appgprj_6a6678d3e3848191a352778c6db1e7b1~appgver_692d37ca0724819198f151bda4d83846` in deployment `appgdep_6a6f48344d848191bd34fe500e2e4d3a`. Its source commit is `22c5096eb840ce610e0b39df99475b27ccbd9c67`, and its archive hash is `sha256:118c3939910e8567c2eba35fe0c8f8d630d5066fde629b1624b6ec2f1ee5c5d8`. No runtime variable or OAuth configuration was changed during deployment.

Fresh local component and operational-event tests cover the account-link confirmation dialog, heading focus and exact trigger restoration, native keyboard actions, result live regions, reduced-motion behavior, mobile target sizing and popover containment, callback-query email non-rendering, rejection of sensitive diagnostic counter names, stale target-OAuth recovery, safe ownership-conflict messaging, and verified-grant cancellation. The final suite passed 60 files / 510 tests, with a focused route/security smoke of 6 files / 171 tests. These tests use mocked local status and callback inputs; mocked callbacks do not prove that either external provider completed successfully.

The post-deploy smoke opened the public `/today` page with the expected Arc. title. Recent production Worker evidence showed successful 200 responses for `/today`, the core RSC routes, session and account-provider APIs, `/api/workspace`, and `/api/account-link/status`; the error-only query returned zero events. No external provider authorization, identity ownership change, or account merge was attempted during this automated smoke. Version 6 remains the direct rollback artifact.

## Version 7.1 authentication edge hardening — 2026-08-03

Product release v7.1 was saved by Sites as version number 8 and publicly deployed from artifact `appgprj_6a6678d3e3848191a352778c6db1e7b1~appgver_86e9c4efe8e881918ecd579584e10e55` in deployment `appgdep_6a6f7a4710cc819191dd0d8af31b76dd`. The isolated Sites source commit is `242a7fdb14364ffadd66de59c656c9200ee08aa1`; its file tree exactly matches verified GitHub commit `fd28276249f40b2a443d0129d1c834b734e09af8` while preserving the prior Sites release history. No runtime variable, OAuth credential, D1 schema, or R2 binding changed during this deployment.

The release configures Better Auth to trust only Cloudflare's `cf-connecting-ip` header for IP-based rate limiting and replaces raw Better Auth warning/error payloads with fixed `[Arc Auth]` severity markers. The independent release snapshot passed 60 test files / 511 tests, ESLint, the five-stage Vinext production build, and 2/2 rendered HTML tests. After deployment, unauthenticated HTTPS smoke returned 200 for `/today` and `/api/auth/get-session`, and the protected `/api/auth/list-accounts` route returned the expected 401. The Sites deployment status is `succeeded` and the error-only Worker query returned zero events. The general Worker log query returned no events after the smoke requests, so runtime confirmation that the former shared-bucket warning is absent remains open rather than inferred from an empty result.

On 2026-08-04, the user repeated the existing GitHub and Google primary sign-in flows in private windows. Both returned to `/today` with the expected Arc. account and existing learning state, and both sign-out flows completed normally. No account-link control was opened. The error-only Worker query remained empty, while the general Worker log query still returned no events; primary-provider continuity is therefore verified, but runtime log redaction remains open.

The user then opened `Link Google` from the pre-existing one-provider GitHub Arc. user, reauthenticated with the same GitHub identity, and returned to the `Identity verified` state with its five-minute continuation window. Selecting `Cancel` before target OAuth produced `Connection cancelled. Nothing changed.`, preserved the existing provider connections, and was followed by a normal GitHub sign-out. This verifies the source-provider reauthentication, verified-grant display, and cancellation subflow. An unauthenticated direct-bypass probe was stopped by a Cloudflare edge 403 before Arc. application handling could be established, so application-layer bypass behavior remains unverified. The general Worker log stream remained empty, so runtime log redaction also remains open.

This Sites version number 8 is a hosting-system sequence only. It does not mark the start of Arc. product v8.

## Capability record

| Capability | Status | Evidence / completion condition |
| --- | --- | --- |
| Public HTTPS origin | passed | The Sites project is active, public, and currently serves the production origin above. |
| Hosted runtime variables and secrets | passed | Production runtime values are configured through Sites; secret values remain masked, live AI remains disabled, and no model key is present. |
| Same-origin catch-all auth route | passed-hosted | `/api/auth/:all+` completed both hosted provider callbacks and initializes runtime configuration lazily. |
| Secure production session behavior | partial-hosted | Arc. sessions were created over the public HTTPS origin, survived fresh navigation, and both provider sign-out flows removed private session state. Current-provider reauthentication and verified-grant cancellation preserved account connections. Code and tests enforce secure production cookies, database OAuth state, and no implicit linking; stale, replay, and invalid-state checks remain. |
| D1 runtime binding | passed-auth-path | The reviewed 19-table migration is packaged and the hosted auth path persists users, accounts, sessions, and OAuth state through D1. Product-workspace mutation smoke tests remain part of the final gate. |
| R2 runtime binding | wired-hosted-flow-pending | `PROOF_ASSETS` is deployed with owner-scoped storage code; verify a private put/get and metadata-compensation path before release. |
| Google callback | primary-flow-passed | Hosted sign-in, callback, session refresh, and Arc. sign-out passed. Cancellation, invalid-state rejection, and second-provider linking remain. |
| GitHub callback | primary-and-reauth-passed | Hosted sign-in, callback, session refresh, sign-out, current-provider reauthentication, and pre-target cancellation passed. Invalid-state rejection and second-provider linking remain. |
| Explicit provider linking | source-stage-passed-target-pending | Version 7 adds the approved proof-bound cross-email flow without enabling Better Auth's unsafe implicit different-email linking. Production verified the source-provider reauthentication, five-minute grant display, and cancellation without connection mutation. Safe unowned-target linking and owned-target no-merge checks still require controlled test identities. |
| Independent Arc. identity | passed-hosted | Google/GitHub are the only product providers; real hosted sessions contain no ChatGPT identity dependency or reserved SIWC route. |
| Deterministic AI fallback | passed-local-build | The protected preview uses the mock provider only and requires the runtime kill switch, D1 cohort, rate, quota, and budget gates; no live model key is configured. |
| Production smoke and rollback | partial-hosted | Version 7 deployment, read-only route smoke, primary OAuth, source-provider reauthentication, and cancellation passed. Version 6 is retained as the direct rollback target. Ownership-conflict denial, stale/replay/application-bypass behavior, observable sanitized logs, and post-link cloud-state checks remain. |

Because Google and GitHub were each first used as standalone sign-ins before the explicit-linking interface existed, those external identities may currently belong to separate Arc. users. The first hosted link attempt should therefore exercise the required conflict path: no merge, no ownership disclosure, and no change to either account.

The first hosted link attempt on 2026-08-01 did preserve both accounts, but it stopped one guard earlier than expected: Better Auth rejected the differing provider email before reading the existing provider ownership. Enabling cross-email manual linking would allow the ownership-conflict check to run, but Better Auth documents that option as an account-takeover risk. Arc. will not relax it without an explicit security decision and compensating reauthentication design.

## Decision rule

Proceed on Sites while all platform-dependent rows can be verified with same-origin secure cookies and owner-managed secrets. If either external provider cannot complete its hosted flow because Sites cannot preserve the required callback, cookie, or runtime contract, move the identity-bearing worker to the approved owner-controlled Cloudflare deployment without changing the browser API or product interaction model.

## Secret boundary

- Real secrets belong only in Sites production environment variables or an owner-controlled Cloudflare secret store.
- `.env.example` contains names and non-sensitive sample limits only.
- OAuth secrets, session secrets, and model keys must never be serialized into client state, logs, source control, proof payloads, or public share responses.
