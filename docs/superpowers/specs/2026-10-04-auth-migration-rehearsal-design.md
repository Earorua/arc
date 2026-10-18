# Arc authentication migration: synthetic offline rehearsal

Date: 2026-10-04. This refines the local validation work in the approved September 22 Cloudflare migration design. It does not authorize real-data conversion or alter the public site's authentication behavior.

## Purpose and boundaries

The original BETTER_AUTH_SECRET was not found. The user has the original Google/GitHub applications and their saved secrets and has saved a new shadow secret. The destination must preserve original users, provider subjects, owner relationships, learning plans, proofs and Research records while requiring fresh authentication.

Two preparatory tasks are feasible before Dashboard configuration or source export: verify a narrow cleanup against synthetic SQLite copies, then exercise the installed Better Auth/Drizzle path with synthetic provider results. Both are offline. The complete release still requires a full consistent D1/R2 export, validated restore, real same-app OAuth continuity, account isolation, controlled cutover and the remaining Research release gates.

This phase has no file-import CLI, remote D1 adapter, network client or app-route integration. The cleanup module accepts only an isolated in-memory SQLite database and reads only trusted repository schema files. It refuses file-backed databases and attached databases other than SQLite's own empty in-memory temp bookkeeping: native integrity_check can create that metadata entry. The temp schema must contain no tables, views, triggers or other objects; even a TEMP trigger acting on main is refused. Tests create independent synthetic source and destination databases from immutable migrations 0000–0006. The source is never passed to the cleanup component.

The trusted test caller constructs DatabaseSync(':memory:') explicitly. The guard validates the native handle, empty filenames and the supported main journal_mode=memory profile, and refuses ordinary unnamed temporary databases before BEGIN. It reads journal_mode without changing it. SQLite metadata does not prove constructor provenance against a caller who reconfigures or overrides its own handle; this internal fixture helper is not an operational database-input sandbox. No caller-supplied external database facility is introduced.

Existing options remain: securely recover the old secret and verify its compatibility, or verify fresh-secret destination cleanup while preserving identities. The latter is the locally testable path given current availability. An empty new-user launch does not meet the already approved data-preservation requirement.

## Exact allowed changes

| Table | Allowed destination change |
| --- | --- |
| users | None; preserve every row and field |
| accounts | Only google/github rows with password IS NULL: null access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at and scope |
| sessions | Remove imported sessions |
| verifications | Remove imported transient verification state, without guessing its type from hashed identifiers |
| account_link_intents | pending_reauth, verified, consumed and completing become failed with failure_code AUTH_MIGRATION_RESET and one explicitly supplied updated_at timestamp |
| All other tables | None |

Account IDs, provider/account subjects, user IDs, account timestamps and password fields remain exact. Unknown-provider and password-bearing rows remain entirely unchanged and are reported as categories requiring separate real-data review. All-null social rows do not count as changes.

For account-link intents, preserve identity, token hash, expiration and historical verified/consumed/completed/created timestamps. Pre-existing completed/failed/expired rows are byte-for-byte equivalent at the value level. A completing intent may already have inserted its target account; that account mapping stays authoritative and must not be removed.

The migration-only operation must not call the runtime repository's fail() method: it intentionally excludes completing and some expired active rows. All four active states allow failed as a terminal state in the existing contract.

## Preconditions, atomicity and evidence

Validate the trusted baseline schema, absence of unsupported triggers/views/extra attached databases, identity uniqueness, foreign keys, known intent statuses and finite integer millisecond timestamps before any change. Unexpected schema or orphan identity records refuse the rehearsal.

Capture deterministically ordered row/value and schema snapshots. Apply only the allowlisted statements within a single owned transaction. Compare exact expected differences and unchanged tables/columns, then verify integrity/foreign keys before commit. On any failure, roll back only the transaction this operation successfully began and return a bounded error category. A failed nested BEGIN must not roll back the caller's existing transaction.

The second application must have zero changes and preserve the first result. Injected mid-operation failure and invariant failure must leave the destination unchanged. Source snapshots remain identical throughout. Preserve tables without user_id as well as directly owned tables; matching row counts alone is insufficient.

Output contains aggregate check names/counts and failure categories only. Never print fixture or real tokens, account identifiers, row content, raw SQL errors or authentication context. This phase never reads real user rows or credentials.

## Real-library authentication proof

Use existing SqliteD1 plus the actual Drizzle D1 adapter, buildAuthOptions and installed Better Auth 1.6.24 / core 1.6.25. Supply explicit synthetic secret/rotation options and reject every unexpected outbound request. Do not replace identity resolution or account joins with a hand-written mock.

Installed findOAuthUser first matches provider_id/account_id; the core adapter fallback join obtains the owner using account.user_id. If malformed imported data lacks that joined owner, a later email fallback exists. Preconditions and tests must prevent that fallback from being accepted as migration success.

Required cases:

1. Google and GitHub with unchanged provider subject return the original user and workspace after cleanup, including a changed email.
2. Both providers already linked to one user still resolve that one identity with unchanged business ownership.
3. Missing mapping with matching email is not silently linked; a new-user result for a new email is classified as failed identity preservation.
4. A fresh login that supplies no refresh token leaves no old encrypted refresh token. New fixture tokens, when supplied, are protected under the new fixture secret; account listing handles null scope.
5. Imported sessions, OAuth verification state and old signed link proofs cannot resume. Test session/cookie validation through the installed library where applicable.
6. All four active link states, including expired consumed/completing, become inert while completed/failed/expired history and existing target-account mappings remain.
7. Existing cross-owner access and direct-link bypass protections still hold; a callback response alone is not sufficient evidence.

The test D1 adapter may need raw result-array support for the real Drizzle path. Add it as a narrow tested helper method, not a production adapter change. First execute the real-library integration gate; if the locked SDK/context shape is incompatible, report and resolve the actual error rather than substituting a fake passing identity test.

## Implementation and release boundaries

Follow TDD with separate SPEC and QUALITY/security reviews. C1 owns the memory-only cleanup and invariants. C2 is the bounded real-library characterization gate: actual Google/GitHub owner lookup with changed email, no stale refresh token, and narrowly tested raw-array support in the test adapter. The remaining cookie, OAuth-state and account-link acceptance cases above form C3, whose concrete integration plan follows the executed gate; they remain required before claiming the whole rehearsal complete. Keep app runtime, schema migrations, dependencies, flags and remote resources unchanged. Root records actual results before committing/backup.

The new raw-array rehearsal uses Node's StatementSync.setReturnArrays, available from Node 22.16 (current local runtime 24.14.1). An explicit capability guard reports unsupported test runtimes. The repository's application engine declaration stays unchanged; no claim is made that this new rehearsal runs on Node 22.13–22.15.

Passing this rehearsal supports the destination conversion approach. It is not a complete backup, native D1 conversion, real provider authentication or public Research acceptance. Any eventual real-data runner needs an immutable source export, destination identity and consistency checks, an explicit conversion receipt and its own operational review before use.

## Current source evidence

- db/schema.ts: users/accounts/sessions/verifications at lines 10–64; account-link intents at 260–284.
- app/server/auth/runtime.ts: encrypted tokens, database OAuth state, hashed identifiers, disabled implicit linking and the real Drizzle adapter.
- app/server/account-link/contracts.ts and d1-repository.ts: state transitions, blocked in-flight states and restricted runtime fail() behavior.
- Installed better-auth/dist/oauth2/link-account.mjs: undefined token values are filtered from updates; createSession uses resolved user.id.
- Installed better-auth/dist/db/internal-adapter.mjs and @better-auth/core/dist/db/adapter/factory.mjs: provider-subject lookup and account-owner joins.
- Independent read-only audit completed October 4; no real data inspected.

Sites metadata recheck October 4 returned all 41 application table names without omission and latest saved version 10, source commit 2b0ed9376e8693250277c194c297076ff975a257. These observations do not prove current row contents, snapshot consistency or full export availability. Current native table reads are bounded previews; no full D1/R2 export mechanism has been established.
