# Auth Secret inheritance — local integration evidence

## Scope

The shadow config declares exactly five required names: BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET. Local-only config has no Secret declaration. The artifact preflight retains exact comparison; it rejects missing, extra, duplicate or literal-valued declarations, plaintext auth secrets in vars and keep_vars=true. No credential values are used in implementation or fixtures.

This is a local deployment-preparation change, not a new cloud version or a completed login/data migration. The user resumed work on October 4 and confirmed Dashboard Secrets still need to be configured. Workers Paid remains unverified despite permission to continue.

## Evidence

- September 24 implementation: behavioral RED 5 failed / 80 passed, then GREEN 87 passed. Independent SPEC PASS, distinct QUALITY/security READY with no blocking findings.
- October 4 Root regression: 102 tests across target, build, auth runtime, auth policy and Research environment suites passed.
- October 4 TypeScript and targeted ESLint: exit 0.
- October 4 actual artifact preflight: passed against cloudflare.shadow.json.
- October 4 existing rendered/client tests: four passed, zero failed. Includes public development notice and secret-name/client-boundary checks.
- Five-phase build was completed September 24. It was revalidated, not rebuilt, on October 4.
- Exact generated target: arc-v8-migration-shadow-20260922; both AI flags false; shadow auth origin; original isolated DB and private R2 identities. No routes or new bindings are accepted.
- Artifact inventory: 92 files; SHA-256 of the recorded inventory JSON: 31c18a9f9fb45c48732cc65ad24c07ea68bc93ff1dfa553c1815d3d2974c834b.
- Detailed source hashes, per-artifact hashes and bounded metadata are in ignored outputs/cloudflare-migration-20261004/auth-secret-inheritance-b2-verification.json. Historical September 22 deployment receipts were not overwritten.

## Remaining remote acceptance

Only the user enters values directly in Cloudflare. Verify the five remote names are Secret bindings, the expected ordinary variables/resources remain correct, and the configuration deployment is active before testing OAuth. Native missing-secret rejection and actual inheritance are not established by offline tests. Do not redeploy code as part of this local integration.

Add exact shadow Google/GitHub callback addresses while preserving old callbacks, then verify real login. The empty shadow database cannot establish original-account continuity; full source export/restore and account/data acceptance remain prerequisites for a DNS cutover.

Final independent integration quality/security review: READY for local commit/backup, with no P1/P2 blockers. The reviewer independently matched all six source hashes and all 92 artifact hashes/byte counts to the safe receipt and confirmed the inventory digest. This is not approval to cut over production. The resulting commit and remote-backup outcome are recorded in the main Arc recovery checkpoint after Git operations.
