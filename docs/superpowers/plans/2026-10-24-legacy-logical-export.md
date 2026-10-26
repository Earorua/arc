# Legacy Arc v18 logical export implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent R2 module and one final focused review. The root owns integration, source workflow and publication. This implements the user's already-authorized migration; no additional design approval is needed for routine implementation choices.

**Goal:** Obtain a complete, private, verifiable logical backup of the old Site and prove that its database and objects can be rebuilt in an isolated destination.

**Architecture:** Add a temporary, default-off, exact-owner session-authenticated export to the verified public v18 source. D1 is read in one transactional batch with typed encodings, schema checks and explicit size limits; R2 is enumerated completely and checked before/after reading. A local restore uses the same encoding to compare all row multisets and metadata. D1 and R2 are not a shared atomic snapshot: final cutover still requires a quiet write window and final comparison.

**Tech Stack:** Existing Vinext/TypeScript/Better Auth, D1 SQL, R2 Worker API, Node 24 SQLite for offline restoration tests.

## Scope and files

Stage: `work/legacy-export-v18-r144` (the Sites source helper opened this checkout at `e2c012c01d55935c2eb542ebf3fdd6799f1aea5f`). Preserve its DB / PROOF_ASSETS bindings, authentication and migration history. Do not publish the newer Cloudflare application's schema to this old Site.

- `app/server/data-export/database.ts`: schema inventory, typed SQL encoding, bounded transactional reads, counts and integrity checks.
- `scripts/data-export/restore.mjs`: local reconstruction into a new empty SQLite database and full verification; never print row content.
- `app/server/data-export/r2.ts`: full paginated inventory, conditional body reads, checksums, stable inventory verification.
- `app/server/data-export/http.ts`: default-off policy, fixed exact owner ID, bounded activation dates, same-origin POST, private download and safe failure messages.
- `app/api/admin/data-export/route.ts`, `app/admin/data-export/page.tsx`, download component: existing session integration and a private download UI.
- `worker-configuration.d.ts`, `.env.example`: export configuration declarations only; no actual credentials or owner values in source.
- `tests/data-export/*.test.mjs`: real SQLite round trips, simulated R2 transport, authorization and boundary tests.

## Task 1 — database export and reconstruction

- [x] First write failing tests using `node:sqlite`: integer limits, NULL vs empty text/blob, Unicode/NUL, >64 KiB text, real values, quoted identifiers, generated columns, indexes/triggers/views, foreign keys and sqlite_sequence. Verify the absent implementation fails assertions before adding code.
- [x] Encode every cell as `[storageClass, encodedValue]`: signed integers as decimal text, real values with SQLite round-trip precision, TEXT/BLOB as hex bytes, NULL as null. Example: `json_array(typeof(col), CASE typeof(col) WHEN 'integer' THEN CAST(col AS TEXT) ELSE hex(CAST(col AS BLOB)) END)`; REAL and NULL have explicit separate cases.
- [x] Inventory schema and table columns; preserve empty tables and migration ledgers. Only known SQLite/Cloudflare internal infrastructure is excluded and listed. Reject unsupported virtual tables explicitly. Guard rows/bytes/cells in SQL before materializing rows, and bound generated statements below D1's SQL-size limit.
- [x] Use one `db.batch()` for schema start, guarded data statements, integrity checks and schema end. Reject schema drift, count discrepancies, any cap exceedance or missing query result. No source writes.
- [x] Restore into a fresh local DB only. Create tables, insert writable columns with bound typed values, restore sequences, then secondary indexes/triggers/views. Re-export and compare exact schema and row multisets; verify FK/quick_check. Test omission/tamper and over-limit rejection.

Run: `node --test tests/data-export/database.test.mjs` from the stage. No real data is involved.

## Task 2 — complete R2 export

- [x] Write failures for multi-page inventories, non-count-based pagination, cursor loops, changing/missing objects, body size mismatch and configured bounds.
- [x] `exportR2(bucket, limits)` lists all objects including unreferenced keys, retains HTTP/custom metadata, uploaded/version/storage class/checksums, conditionally reads by etag, computes SHA-256 and stores body base64.
- [x] Re-list after reads and require the same inventory; errors return no claimed complete backup. Restoring body/metadata creates new provider versions/timestamps, so retain originals as backup metadata without claiming Cloudflare can assign those original values.

Run: `node --test tests/data-export/r2.test.mjs`.

## Task 3 — authenticated delivery and deployment candidate

- [x] Test default-off, invalid/expired/too-long activation, wrong owner, no session, cross-origin/GET rejection and safe no-store response. Check configuration before DB/R2 access.
- [x] Enable only with `ARC_DATA_EXPORT_ENABLED=true`, exact verified `ARC_DATA_EXPORT_OWNER_ID`, fixed start/end dates no more than 24 hours apart. Require the existing authenticated user ID to match; never grant export by email alone. Require same-origin POST and custom confirmation header.
- [x] Produce a private JSON attachment with schema version, project/source identity, captured interval, DB/R2 hashes/counts and a clear non-atomic cross-resource label. Do not log the body, cookies, OAuth tokens or raw exceptions. The user privately downloads the backup; raw data never enters chat/Git.
- [x] Run focused tests, type check and one build; do one focused security/fidelity review. Prepare the default-off public v18 update through the Sites helper. Only activate after verifying the old-site owner identity and private download destination; existing migration authorization covers necessary changes, but credentials remain user-entered.

## Later migration stages

After a real complete export is obtained: restore into new isolated Cloudflare D1/R2; compare all row counts, typed hashes, FK relationships and object hashes; reconcile old provider account identities with test-site data without silent email merges; verify fresh login and retained plan/history. Then final quiet export, domain/OAuth cutover, rollback checkpoint and removal/disablement of the temporary export. Existing migration-shadow Research data must be retained. No new paid model requests are authorized by this work.

