# Authentication migration readiness

## October 4 local rehearsal progress

C1 synthetic cleanup is implemented and independently reviewed: SPEC PASS, then a distinct QUALITY/security reviewer READY. Root ran the cleanup and schema suites together: 64 tests passed; the implementer's final cleanup suite has 46 passing tests, with typecheck and targeted lint exit 0. Exact source/destination row snapshots, ownership and account mapping preservation, bounded rollback failures and zero-write repeated application are covered. All data is synthetic and local.

An initial quality finding exposed SQLite unnamed temporary databases sharing an empty filename with memory databases. The retained regression first failed, then passed after a read-only journal profile guard was added before BEGIN. Empty SQLite temp bookkeeping is permitted, but temp objects, ordinary unnamed temporary mode and other attachments are refused. The trusted caller constructs ':memory:' explicitly; this internal fixture helper is not a provenance sandbox for arbitrary reconfigured handles or an operational real-data converter.

Final C1 source SHA256: module `f0f538a001bb23a8111c66ae78b92980071f135b793de3b9df4a277e207ee55e`; test `e2bcc4f6f92066f1dda175437bf9d6ef00188d3da4f15e7d066387aa8d081c54`. Local evidence is under ignored `outputs/cloudflare-migration-20261004/c1/`, with final revision in `r2/`; original failures/reviews remain. Implementation: `scripts/cloudflare-migration/rehearse-auth-cleanup.mjs` and `tests/server/auth-migration-cleanup.test.ts`.

C2 installed-library characterization now has six passing tests after an observed six-test RED. It uses the real locked Better Auth public helper, Arc options/hooks and Drizzle D1 adapter: for each Google/GitHub provider, the unchanged subject resolves owner-a even when the incoming email belongs to owner-b; users, account mapping and profile ownership remain, and no old refresh token/expiry survives. Outbound fetch is denied and asserted unused. This is public-helper characterization, not an actual OAuth callback/cookie test or verification of a real provider's subject.

The test D1 helper now supplies ordered raw arrays using native setReturnArrays, retaining duplicate column values, binding/order and row limits. A fixed unsupported-capability error documents that this new rehearsal requires Node 22.16+ (checked on 24.14.1), while the application engine declaration is unchanged. No application code or dependency was modified. Root's nine-suite integration run passed 226 tests, including auth policy/options, account-link protections, schema, C1 and C2; C2 typecheck/lint also passed. Frozen C2 hashes and review records are in ignored `outputs/cloudflare-migration-20261004/c2/`. Independent C2 SPEC passed; a distinct QUALITY/security and final C1–C2 integration review returned READY with no remaining P1/P2 findings. This authorizes reviewed local commit/backup only. The main recovery checkpoint records the resulting commit and remote verification separately.

C3 actual cookie/state/link handling remains separately planned after this gate. None of these local checks establishes real OAuth subject continuity, source export completeness, destination restore or production-cutover readiness. Five shadow Dashboard auth Secrets still await user configuration; Workers Paid remains unverified.

## Original dependency audit and remaining operational scope

2026-09-22. Read-only dependency audit; no real secrets, user rows or provider calls inspected. This is a proposed fallback for later verification, not an executed data transformation.

## Current finding

The user did not find the original BETTER_AUTH_SECRET in Bitwarden. The original Sites environment lists it and both Google/GitHub integrations as configured; encrypted values have not been retrieved. The user subsequently found both the Arc GitHub OAuth app and the matching Google OAuth client and confirmed both Client Secrets are saved. This is user-reported availability, not value validation or successful new-site authentication. Neither app was changed. Losing the application secret does not inherently require recreating users or losing their business data.

Locked and installed versions are better-auth 1.6.24, @better-auth/drizzle-adapter 1.6.24 and @better-auth/core 1.6.25. Arc resolves the existing user using `(provider_id, account_id)` and the stored `user_id`. A fresh OAuth callback can update new tokens and create a new session without decrypting previous OAuth tokens first. This is source evidence only; real provider subject continuity remains unverified.

## Secret-dependent state

- `accounts.access_token` and `refresh_token` are encrypted under the application secret. A new secret cannot decrypt the imported ciphertext.
- The ordinary installed callback writes `id_token` directly; it is still transient sensitive credential material and is not evidence that all token columns are encrypted.
- Session cookies, OAuth-state cookies and Arc account-link proofs depend on the secret. Session database tokens are random values; verification identifiers are hashed, with state/PKCE information in the verification value.
- The separate account-link intent cookie is a random credential matched using a hash. Changing the secret alone does not invalidate every resumable intent. Verified intents may mint a new proof after login; consumed/completing states can block another link attempt.
- Users, durable provider-account mappings and business owner IDs do not depend on the secret in the inspected application code.

Evidence: app/server/auth/runtime.ts; app/server/account-link/crypto.ts; app/server/account-link/service.ts; app/server/account-link/d1-repository.ts; db/schema.ts; installed better-auth/dist/oauth2/link-account.mjs, oauth2/utils.mjs, db/internal-adapter.mjs, api/routes/account.mjs and cookies/index.mjs.

## Fallback to validate before using real data

Preserve the source/export unchanged. In the isolated destination copy, preserve users, provider/account mappings, all business ownership and relationships exactly. Adopt a new securely configured secret only as part of the controlled destination conversion, requiring users to log in again.

Clear imported sessions and pending OAuth verification state. For known social-account rows, clear old access/refresh/ID tokens, expiry fields and stale scope metadata while preserving account rows and identity fields. Do not rewrite unknown account types or password fields. Explicitly terminalize in-flight account-link statuses pending_reauth, verified, consumed and completing while retaining completed history. Do not rely on secret rotation or expiry alone.

This token cleanup is necessary even when ordinary login succeeds: Better Auth omits undefined fields from updates, so a login without a new refresh token can otherwise leave the old undecryptable refresh token behind.

Prefer the original OAuth apps if the user can administer them. New apps may work because Arc does not include client ID in its identity lookup, but cross-client subject continuity must be verified, not assumed. Google uses token `sub`; GitHub uses the profile ID. A matching email is not an identity migration: implicit linking remains disabled. Unexpected new-user creation is a failed migration check, not an empty workspace to accept.

## Required tests and acceptance

1. Exact users/account IDs and all business owner relationships survive conversion; uniqueness and foreign keys remain valid.
2. Old signed sessions fail; fresh callbacks under a new fixture secret resolve the original user with no duplicates, including changed email and already-linked Google/GitHub cases.
3. Unknown provider account IDs cannot pass migration validation through email matching or silently created users.
4. A callback returning no refresh token leaves no old ciphertext. Linked-account listing, fresh login and workspace access still work.
5. Old OAuth state, proofs and all in-flight link statuses cannot resume or block a new valid link; completed history remains.
6. Existing cross-owner and direct-link-bypass protections remain effective.
7. Before cutover, controlled real login for each supported provider proves callback reachability, provider subject continuity, the original Arc user ID and existing workspace data.

The October 4 C1 helper above performs synthetic in-memory cleanup only; no real-data transformation runner is implemented. The user has located both original OAuth apps and saved secrets; actual provider coverage, complete database export and source snapshot consistency remain unresolved. Do not change the old site's secret or delete its sessions to test this proposal. The shadow auth setup guide uses a new secret and an empty isolated database; its login test cannot establish preservation of an original account ID.

## Locate the OAuth applications without changing them

GitHub: profile picture → Settings → Developer settings → OAuth Apps. Find the existing Arc app or a callback pointing at the old Arc hostname. Do not reset its secret, change callback URLs or create a duplicate merely to search for it.

Google: open the existing project in Google Cloud Console → Google Auth Platform → Clients. Look for the web client associated with Arc. If the project is not owned by this account, ask the Site platform about provisioning/ownership. An empty list is not evidence that the old login configuration never existed.

Official instructions checked on 2026-09-22:
- https://docs.github.com/en/apps/oauth-apps/maintaining-oauth-apps/modifying-an-oauth-app
- https://developers.google.com/identity/protocols/oauth2/web-server

Only report whether the app exists and is accessible. Secret values should be entered directly through the approved secure configuration channel, never copied to chat or Git.
