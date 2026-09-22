# Authentication migration readiness

2026-09-22. Read-only dependency audit; no real secrets, user rows or provider calls inspected. This is a proposed fallback for later verification, not an executed data transformation.

## Current finding

The user did not find the original BETTER_AUTH_SECRET in Bitwarden. The original Sites environment lists it and both Google/GitHub integrations as configured; encrypted values have not been retrieved. The user subsequently found both the Arc GitHub OAuth app and the matching Google OAuth client; actual credential availability is not yet verified. Neither app was changed. Losing the application secret does not inherently require recreating users or losing their business data.

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

No transformation script or synthetic migration test has been implemented yet. Real provider coverage, ownership of OAuth apps, complete database export and source snapshot consistency remain unresolved. Do not change the old site's secret or delete its sessions to test this proposal.

## Locate the OAuth applications without changing them

GitHub: profile picture → Settings → Developer settings → OAuth Apps. Find the existing Arc app or a callback pointing at the old Arc hostname. Do not reset its secret, change callback URLs or create a duplicate merely to search for it.

Google: open the existing project in Google Cloud Console → Google Auth Platform → Clients. Look for the web client associated with Arc. If the project is not owned by this account, ask the Site platform about provisioning/ownership. An empty list is not evidence that the old login configuration never existed.

Official instructions checked on 2026-09-22:
- https://docs.github.com/en/apps/oauth-apps/maintaining-oauth-apps/modifying-an-oauth-app
- https://developers.google.com/identity/protocols/oauth2/web-server

Only report whether the app exists and is accessible. Secret values should be entered directly through the approved secure configuration channel, never copied to chat or Git.
