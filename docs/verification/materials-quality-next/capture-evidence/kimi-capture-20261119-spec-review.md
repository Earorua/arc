PASS — Task 1 specification review, 2026-11-19.

Reviewed the seven frozen implementation/test files in `kimi-capture-20261119-handoff.json` against HEAD `012f716fc321a5598ef53bce25bf2ccca110f74d`, with the actual call paths, unchanged provider/receipt implementation, and saved test output. No actionable specification finding remains in this scope. The handoff's `a5d2fda9d037ee8301b10a5637a6169a67293e99` baseline differs from HEAD only in four documentation files, so it does not hide a different implementation baseline.

This review covers Task 1 of the live quality preparation plan only. The root-owned plan edits, public/preflight files under `docs/verification/materials-quality-next/`, future Task 2 observation semantics, and the pre-spend gap check are outside this implementation review. This is offline tooling acceptance, not a live quality result or spending authorization.

The optional 24-document capture preserves the returned assistant content without trimming, repair, or a second parse into a substitute answer. It separately retains the choice/top-level finish fields, null or invalid decoded outcome, exact provider candidate, body SHA-256, source-text SHA-256, document/version/text identity, route/model/policy, receipt/audit, and accounting. The response is cloned for bounded raw reading; the original still reaches the unchanged provider reader, including its wire-cost handling. The capture sink receives a structured clone, so it cannot mutate the provider outcome used for the durable checkpoint. Raw capture and the provider projection remain separate.

An attributable charge remains settled when the capture callback fails; an unknown charge remains held. The runner awaits the existing settlement checkpoint before honoring the stop, making the next POST unreachable after a capture failure. A failed checkpoint also cannot fall through into another inference. The saved tests cover both attributable and unknown capture-write failures and assert exactly one POST. With capture absent, legacy reporting retains its existing shape and scoring. The diagnostic pilot API is unchanged, and the implementation explicitly disables capture for that profile.

The new file writer restricts captures to the frozen 24 document identities and their exact version/source hashes. It binds a new run directory to run, authorization, mode, candidate commit, configuration digest and corpus digest; `wx` creation prevents overwrites and resumption, with at most one file per frozen document. It rejects a capture over 1 MiB before file creation, handles partial writes, and fsyncs each file. The raw-content test preserves whitespace, NUL and an unpaired surrogate, while duplicate, wrong-version, oversize and reused-directory writes are rejected. This writer records its supplied source/grant binding; the later operator packet remains responsible for source attestation and authorization, as required by the task split.

The six-document export opens the existing SQLite archive with `readOnly: true`. It uses an externally pinned original issuance and a trusted parsed binding, verifies the registered ledger identity and exact stored run/authorization/issuance/mode, and checks the frozen settings and document list before reading captures. It validates row identity/order, receipt uniqueness and claim linkage, attributable amount, verified provider/model/endpoint audit, metadata-read allowance, output receipt, and the digest binding the raw capture to the stored decoded extraction. It returns the original content and stored projection, including null, without rescoring or repairing them. The export CLI neither collects nor resumes a run and does not read a credential. Its saved test checks unchanged database bytes and rejects substituted source, document and receipt bindings.

Collection completeness remains distinct from quality: six settled, verified, recorded outputs can export as complete even when the stored run is `quality-failed`. Invalid output is retained as evidence and does not become a passing result. The export exposes the original status rather than manufacturing a quality success.

`maxMetadataReadsPerDocument` accepts only an explicit 1 or 3 in the pinned issuance; omission continues to mean one. A three-read grant uses the unchanged provider's existing maximum-three lookup loop, transient-status handling, spaced lookup slots and 30-second deadline. The collector additionally counts and bounds GETs, retains authorization/ledger checks before transport, and refuses a second POST. Tests cover availability at the third lookup and exhaustion, with one POST and GET offsets of 0, 10 and 20 seconds; the existing one-GET grant coverage remains in place. No app or worker/provider code, prompts, historical corpora, gold/reference assets, native evidence, or integrated-course binding changed in this slice.

Validation was reused as requested; the reviewer ran no tests, model calls, native/build campaign, network operation or synthetic probe. Independently recomputed SHA-256 and byte sizes match all seven frozen files below. The seven saved raw-log hashes match their wrapper receipts, including both red runs and the intermediate fixture failures. Those failures remain in the evidence: missing capture/export/writer behavior first, then two fake-timer setup timeouts with cleanup errors and a deliberate foreign-key corruption blocked by SQLite. The final fixture changes were inspected; the final affected run covers the resulting files.

| Saved evidence | Observed result |
| --- | --- |
| `kimi-capture-20261119-affected-01.log` / `.json` | 6 suites, 102 tests passed; exit 0; non-loopback denials 0 |
| Affected suites | journal 3; capture writer 1; supplement quality 8; qualification guards 26; diagnostic pilot 16; supplement collection 48 |
| `kimi-capture-20261119-green-02.log` / `.json` | Focused repair run exit 0; log hash verified |
| `kimi-capture-20261119-types-01.log` / `.json` | Exit 0; empty raw log hash verified |
| `kimi-capture-20261119-lint-01.log` / `.json` | Exit 0; empty raw log hash verified |
| `kimi-capture-20261119-red-01`, `green-01`, `writer-red-01` | Retained failing raw logs and receipt hashes verified; not counted as passing evidence |

The affected raw log SHA-256 is `0244d0841548f4f2d3f515d5fed512d691e6b2310a80f7c37244b88a3428ae08`; the focused green log is `07a86d8ee2a34f031eb8184a2fe2e6facd5428856120ec8374401a3232922c13`. Both empty types/lint logs hash to `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. These are saved author-run results, not a reviewer rerun.

| Frozen file | Bytes | SHA-256 |
| --- | ---: | --- |
| `scripts/materials-qualification-capture.ts` | 6615 | `5c6e7a62cffbb60d2d51b0c60e50f58e01603678a18fd2137c0d24cca9bc6cac` |
| `scripts/materials-qualification-runner.ts` | 22638 | `a8a2c715d9d097795849d71c337a66b01f060add948ae346c35611e6ce0969bb` |
| `scripts/collect-materials-supplements.ts` | 17776 | `27118e3e594040dd5eb881ab68da0d7a5b8b842b88e694f92a4ac2fa60a400ce` |
| `scripts/materials-supplement-ledger.ts` | 21864 | `297661629ce0aa55a194fe65cbdaa13085e0ca4de6937cb05c39af33fa594f04` |
| `tests/server/document-qualification-capture.test.ts` | 3289 | `e29133e63d8f54b50b8bb3e97d95e4460f63de3f0902f7de616bf9587681594d` |
| `tests/server/document-model-qualification-guards.test.ts` | 25646 | `b5e5fb37a0332fc331724085f65e26b5aa08b56f8243c8ea3f7fcce647b64ef9` |
| `tests/server/materials-supplement-collection.test.ts` | 56532 | `14619f1938bf388efaca33a0d78f376d696b031b6721ea92eec6895887cdf867` |

Reviewer changes: this memo only; no source edits, staging or commits.
