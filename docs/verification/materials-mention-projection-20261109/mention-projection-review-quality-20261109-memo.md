# Task 3 independent quality review

Verdict: **PASS**. No actionable Critical, Important or Minor finding in the frozen Task 3 change. It is ready for root's full-repository acceptance gate; this review does not authorize merge, policy activation or release.

Baseline: `c36aa0e8049e3b8f245dc6004ac9d2c23b89ae29`, branch `codex/materials-replan-recovery-20261106`. The actual two-product-file diff, three modified test files and two new test/helper files were reviewed, together with their contract, validator, editor queue and repository context. All seven files match the author freeze before and after verification. Freeze manifest SHA-256: `0f0cf48f75a46d84b65f83b11458920f147f401ecbf8575e2b76fc5742fd53c3`. The specification memo matches `e120f0d169b14b0fa6ebbf877d4697f1f02e6bd153202e8b73d7d7157fcfe290`; its conclusions were not substituted for reading the implementation.

Routing: read the local source index and root's saved live GitHub index text/fetch record. No network request was made by this reviewer. Historical paused-checkpoint instructions were treated as historical context, not commands to overwrite this accepted baseline.

## Strengths

- **Architecture and compatibility:** `app/server/documents/review-service.ts:33`, `:151` and `:257` use the exact known v2/v3 identities and preserve the actual extraction marker. The server retains authority over the rule; neither the request contract nor the UI sends a marker. `material-confirmation.tsx:14`, `:69` and `:76` reuse the accepted versioned helpers for addition and raw-source display. No new grammar, policy activation, migration, adoption path or protocol behavior is introduced.
- **Source and state integrity:** `review-service.ts:54` binds an explicit addition to the original candidate, exact source, current/prior kind and user provenance. `:63` through `:73` preserve the reviewed word list without restoring removed terms. Existing ownership, revision, receipt and atomic commit guards remain in place at `:209` through `:274`; the new v3 path passes their focused adversarial checks.
- **Error handling and UI behavior:** raw HTTP schema violations return 400 and semantic/provenance violations return 422 without changing the saved draft. Competing additions produce exactly one accepted save and one 409 conflict; a changed request cannot reuse the winning mutation identity. Receipt-write failure rolls back the draft update. Delaying the real addition response does not overwrite a subsequently queued removal or text edit.
- **Real tests:** `tests/helpers/material-mention-review-fixture.ts:16` constructs real client, route factory, runtime, ReviewService and SQLite-backed D1/memory R2 state. Only inert analysis delivery is seeded, with analysis disabled. The integration tests exercise confirmation, selection, context persistence and reload, alongside real `MaterialTextPanel` interactions. Expected mapping, practice and adoption outcomes are asserted independently of the implementation helper results.

## Issues

- **Critical:** none.
- **Important:** none.
- **Minor:** none.

## Independent verification

Every Node invocation used `node work/grounded-verification/run.mjs UNIQUE-LABEL ...` after checking that its label was unused. Each has a distinct `-results.json`; all four wrappers exit 0, report zero non-loopback denials, and have independently verified raw-log hashes.

| Label suffix after `mention-projection-review-quality-20261109-` | Observed result | Raw log SHA-256 |
| --- | --- | --- |
| `focused-01` | 338 passed, 0 failed/pending, 12 files | `68492ec6c4163dc27e7f83d323b5c08a4381f3e75fe71ee905552708fb5520f3` |
| `probes-01` | 4 passed, 0 failed/pending, 1 file | `22a328559cc3c8a91d85338817d973fa3d736348fd1c6bb4a73d86cbfe5f66ba` |
| `types-01` | Scoped TypeScript config, exit 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `lint-01` | Seven frozen files; 0 errors, 0 warnings | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

The focused run covers the four changed suites plus confirmation, deletion, extraction, storage, confirmed skill labels, learning intents, practice priorities and selection. Four additional quality probes cover competing additions/retry identity, rollback after the draft write but before its receipt, seven raw HTTP rejection variants with an accepted control, and the delayed-response editor queue. Total independently passing tests: **342**. `git diff --check` passes. Logs contain only the expected Node experimental SQLite warning; no test failure was hidden or rerun under the same label.

## Frozen source hashes

| File | SHA-256 |
| --- | --- |
| `app/server/documents/review-service.ts` | `8a98f8f6bb1f9b506434ff85e3a803294b07a3c02c4597c4c3cb95b1b7e8f378` |
| `app/components/materials/material-confirmation.tsx` | `6e328b880f71447f89cd94619dbb72dd4967ec04d9dc74a7d23112cb0cdebd8f` |
| `tests/server/document-review-draft.test.ts` | `cc0b49d830293e6dade78ed0758f1e270f624e484b69181eae18944d606ff2c1` |
| `tests/components/material-confirmation-source.test.tsx` | `b6745699b335c5ed4686eb45426740a908f1fb6b02b908ad6b15d6d92d84d136` |
| `tests/components/material-source-term-correction.test.tsx` | `55d4f555e9f82318948ba51899852299a36259065a3cd8682e13b63f0ae1db6d` |
| `tests/server/material-mention-review-flow.test.ts` | `f1bfe99e0170ad70b2ef4347ecf93865bcd0a90f11b3d266b50f211f0eef8886` |
| `tests/helpers/material-mention-review-fixture.ts` | `bf886c20b6c3ac433ca735928ed9cd29438001f6855cb6347e6412cd9c82e3d5` |

Machine-readable evidence: `mention-projection-review-quality-20261109-results.json`, SHA-256 `f171b4cd172ee559cae991c93a7fcc4a1e45607a012cebe786270c0763cae665`. It records wrapper/result/source hashes, test scopes, probe cases and artifact hashes.

## Assessment and limits

**Ready to advance: yes, to root's full-repository gate.** The bounded change applies the already accepted versioned semantics consistently and preserves the existing persistence/security boundaries. No quality fix is required before that gate.

This reviewer ran no full-repository suite, build, workerd flow or live provider. Root's native/parity/historical compatibility evidence and the specification results were read as supplementary records, not claimed as this reviewer's executions. The preexisting Chinese guided-action false negative and whole numbered-entry quote limitation remain open. The existing separate ability button is preserved; later typed decision/source/persistence validation is not closed by Task 3.

No product or tracked test source was edited; commits, live model calls, remote migrations, deployments and pushes: 0. Reviewer additions are confined to the ignored `work/grounded-verification/mention-projection-review-quality-20261109-*` prefix. The two previously dirty progress documents were not edited by this reviewer. Their concurrent updates and the new `docs/verification/2026-11-09-materials-mention-projection.md` were explicitly confirmed as root-owned; those observations are recorded in the evidence file. The seven-file freeze remains unchanged.
