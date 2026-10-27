# Arc v8 legacy Cloudflare reconstruction

Continue the already-authorized full migration using the r144 verified private backup. No new paid model request, public route, destination overwrite or silent account merge is included. The previous goal turn is progress: it produced a full real backup and a matching local restore.

## Implementation

1. Generate bounded SQLite SQL from the typed snapshot. Preserve integers as decimal SQL literals and text/blob via hex, real round-trip encodings, all table/index/trigger/view definitions and sqlite_sequence. Create schema before rows, defer FK validation through the D1 import transaction, then create secondary objects. Refuse an overlong statement rather than truncate. Verify local import/re-export against all original typed table/schema hashes; use synthetic edge cases for the new conversion.
2. Prepare a fixed Cloudflare native CLI operation wrapper using the existing authorized Wrangler login/account/proxy and sanitized records. Create one new isolated D1 and one private R2 bucket, recording returned IDs before later use. Never reuse an uncertain creation or import without readback. Validate destination is empty and that its ID is distinct from both existing shadow databases.
3. Import the private SQL file once through Wrangler. The file and any complete readback remain in the XF/SYSTEM-only private directory, not Git or ordinary logs. Verify the complete imported database using typed readback and schema/count/hash/FK comparisons; native D1 export alone may lose int64 precision and therefore is not the sole comparison.
4. Record real cloud results and limitations. Plan old/shadow provider identity and history reconciliation next. Existing shadow data is retained and old live writes require a final quiet snapshot before domain cutover.

Use one bounded review for the new conversion/operation boundary before cloud writes, without repeating the previously passed exporter tests. Implement and run only relevant new checks. Resource names proposed: `arc-v8-legacy-restore-db-20261024` and `arc-v8-legacy-restore-proofs-20261024`; these are not public Worker endpoints.

Official basis: https://developers.cloudflare.com/d1/best-practices/import-export-data/ and https://developers.cloudflare.com/d1/sql-api/foreign-keys/ . D1 SQL import omits explicit BEGIN/COMMIT and uses `PRAGMA defer_foreign_keys=ON` to defer constraints. All SQL types must be checked against actual D1 runtime behavior, not just Node SQLite.
