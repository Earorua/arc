# Arc standalone Cloudflare migration evidence

Date: 2026-09-22. This is an isolated migration rehearsal of the public Research-closed baseline, not a production cutover or completed data migration.

## Source and local baseline

- Branch: codex/v8-cloudflare-migration.
- Baseline commit: cd2b9abead3a98d635850461e2b49bb650618a6d.
- Baseline tree: fd4c50e8989e3ea5e189b15dd2283a6e0324f32c.
- Original Research working tree remains separate and unchanged except progress documentation.
- `npm ci --offline` initially failed because one locked package was absent from cache. Normal `npm ci --no-audit --no-fund` then installed 810 packages successfully with the original lockfile; no dependency upgrade.
- Baseline `npm test` passed all five build phases and four rendered/client-boundary tests before adaptation.
- A1 implementation is frozen. Independent SPEC and a different QUALITY/security reviewer both passed, with no blocking findings.
- Root independently reran 88 target/preflight/auth/Research tests and four rendered/client tests; all passed. Actual shadow artifact preflight, TypeScript, targeted ESLint and git diff whitespace checks passed.
- Native Wrangler deploy --dry-run passed: total upload 4565.62 KiB, gzip 978.01 KiB; exact DB/R2/ASSETS and four non-secret variables. No cloud Worker deployment was performed by dry-run.
- Root receipt with artifact hashes and the seven baseline migration hashes: ignored outputs/cloudflare-migration-20260922/root-a1-verification.json.

## Local Workerd validation

- The first local D1 initialization failed with SQLITE_CANTOPEN before application SQL. The long output root would produce a 264-character hashed SQLite path; metadata.sqlite at 208 characters was created while the main database was not. A fresh shorter ignored `.wrangler/migration-a2` path produces 237 characters and the same seven migrations then completed. No application or SQL change was needed; the failed state was retained.
- Native local D1 verification returned exactly 41 application tables, seven ordered baseline migration entries and zero foreign-key violations. Users, accounts and Research runs remained zero. Two sanitized operational error events were produced by the intentionally unconfigured-auth probe.
- Local Workerd served `/`, `/sign-in`, `/setup`, `/today`, `/path` and `/stack` with status 200 and the development notice. CSS returned 200 and homepage canonical metadata points to arcmaps.net.
- `/api/auth/providers` correctly reports no configured providers; eligibility rejects with 503/UNAVAILABLE. The initial probe expected the Research write endpoint to use 503 as well, but it returned the baseline 500/INTERNAL because absent auth runtime is classified generically before service construction. This is a recorded missing-auth limitation, not a passing login or Research acceptance. No Provider key exists and both enable flags remain false.
- Native local R2 synthetic attachment put/get completed with identical SHA-256. It contains no source user data and was not uploaded to cloud R2.
- Miniflare's optional Request.cf metadata fetch timed out and fell back to defaults; local Workerd still became ready. These measurements do not establish real cloud CPU usage or geographic access.
- The local server was stopped after verification. Safe receipts: local-http-receipt.json, local-d1-receipt.json and local-r2-receipt.json in the ignored output directory above.

## Isolated cloud resources

Native Wrangler authenticated through the already-authorized local HTTP proxy, using its existing OAuth credential without reading token values. Direct connectivity failed first; proxied native requests succeeded. All listed identities are non-secret.

| Resource | Identity | Verified state |
| --- | --- | --- |
| Account | 54eaadb89014252836694203c1e22546 | Existing OAuth login and account verified |
| D1 | arc-v8-migration-db-20260922 | Created successfully; UUID 83a47917-a4f4-4121-baad-1032677f18a8; WNAM |
| R2 | arc-v8-migration-proofs-20260922 | Created successfully; Standard; r2.dev public access disabled; no custom domains |
| Proposed Worker | arc-v8-migration-shadow-20260922 | Native deployments lookup returned not found, code 10007; deployment next |

The Worker-name lookup then encountered a Windows libuv exit assertion. The API response explicitly reports that this exact Worker does not exist; the command is not recorded as a successful deployment. No source or existing smoke resource was changed.

The exact non-secret target is `cloudflare.shadow.json`. Required application bindings are `DB` and `PROOF_ASSETS`, not the suggested generated binding names printed by resource creation. This inventory has no routes, production custom domain, triggers, model key or authentication secrets. After the local checks, a native query confirmed that the new remote D1 contained only Cloudflare's `_cf_KV` table. The seven baseline migrations were then applied successfully to this exact new database. No source user data was imported.

Existing smoke D1 UUIDs fe4952d0-da78-4c85-b1fa-8a5706d42fa3 and 81d44533-40d9-4544-a03d-81a01e2719ae, their Workers and arc-v8-smoke-receipts-20260921 remain untouched. arcmaps.net still serves the existing Sites version.

## Authentication and transfer dependencies

User searched Bitwarden and did not find the original BETTER_AUTH_SECRET. The three smoke secrets A/B/C are unrelated. Read-only dependency audit is evaluating how to preserve provider/user/owner identity while forcing fresh authentication; no old secret has been changed and no encrypted token has been read or transformed.

User found both the Arc GitHub OAuth app and the matching Google OAuth client. No client ID/secret was requested or exposed and existing callback URLs have not been changed. Actual availability of client secrets remains to be checked through a safe configuration process.

The read-only auth audit found that fresh provider login can preserve existing user IDs without decrypting old OAuth tokens first, conditional on exact provider-account continuity. Residual encrypted refresh tokens and in-flight account-link state require deliberate destination-only handling. This fallback is documented in auth-migration-readiness.md and has not been implemented or tested against real accounts.

Native Sites metadata confirms 41 application tables and configured encrypted auth secrets, but does not provide a verified complete source D1/R2 export. Full consistent transfer, safe authentication configuration and real account acceptance remain prerequisites for DNS cutover. Empty or synthetic target tests do not satisfy these prerequisites.

Workers Paid remains Processing by user report. This does not block local build work or isolated resources; it is not evidence that paid limits are active. No real Provider request is authorized or performed by this migration preparation.
