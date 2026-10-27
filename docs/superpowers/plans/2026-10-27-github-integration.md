# Arc v8 GitHub integration

## Design and scope

The source backup at `03a0d7d` copied the released migration code without merging the migration branch's ancestry. Master at `99c68c9` independently contains that migration. The resulting 41 conflicts include 34 files differing only in line endings.

Integrate master into the latest backup branch with a normal merge. Keep the released application and the current README; restore master's Node 24.14.1 minimum. Preserve both branch histories and the older backup branches. Do not rewrite the r207 source manifest or its historical receipts.

Clean-checkout verification also exposed stale test expectations and an untracked dependency in the smoke builder. Update those to the already released prompt v6, quality v5, and migration 0013. Keep fixed request hashes, source hashes, negative tests, authority checks, and byte limits. Commit a source-only build inventory instead of requiring a private machine's historical output file. No production application behavior, cloud deployment, model request, credentials, or database changes are involved.

## Implementation plan

- [x] Compare master, the released source base, and every conflicting file; resolve the 41 conflicts without dropping current application changes.
- [x] Restore `engines.node` in `package.json` and the lockfile to `>=24.14.1`.
- [x] Reproduce clean-checkout failures with the existing full test suite; retain the original results.
- [x] Use declared SQLite and repository types in `planning-history.test.ts`; update schema, request, configuration, and source-authority fixtures to their current contracts.
- [x] Replace the historical output dependency in `build-research-executor-smoke.mjs` with `tests/fixtures/research/smoke-build-inputs.json`; refresh the two changed reviewed source hashes and the smoke provider's fixed policy hash. Historical artifacts are unchanged and cannot be reused as new build receipts.
- [x] Re-run every failing test file and static checks. Verify remaining regressions without weakening assertions. Generated `outputs`, `.wrangler`, and `.vinext` directories are excluded from source linting.
- [ ] Commit and push the merge normally, open a PR against master, verify GitHub checks, and merge with the expected head SHA.
- [ ] Verify remote master ancestry, record the merge result, and preserve the released site's state.

Future application updates should branch from the merged master and use normal commits or merges. The r207 manifest describes its original snapshot, not subsequent integration fixes.
