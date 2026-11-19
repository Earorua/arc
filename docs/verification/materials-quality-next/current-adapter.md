# Current-binding quality adapter v1

This is offline verification tooling for Task 2 of the November 19 preparation plan. It neither starts inference nor grants Gate, production qualification, or release approval. The historical evaluator, its loader/WeakSet, its 26 assets, and the five original input/basis files are unchanged.

`loadCurrentReviewedReferences()` verifies the 26 frozen assets and tools, three original inputs and two basis documents, the reviewed integrated course verifier/receipt/memos, all 85 current course dependencies, and the native acceptance receipt/manifest/check/archive. It checks all 146 current native-closure files: 143 unchanged and exactly the three hashes allowed by the independent English-integration review. It executes the actual integrated course verifier; it does not manufacture an old checkout or provide the historical loader's credential. `assertCurrentReviewedReferences()` rechecks the verified bytes before an aggregate report.

The small API is in `current-captures.ts` and `current-adapter.ts`:

```ts
const references = await loadCurrentReviewedReferences();
const qualification = await readQualificationCaptures(originalWriterDirectory, externallyFrozenExpectation);
const supplement = await readSupplementCaptures({
  issuance: originalIssuanceText, issuanceSha256: originalExternalPin,
  directory: originalLedgerDirectory, mode: "authorized-live",
});
const report = await evaluateCurrentQuality({
  qualification, supplement, courseView: "simulated-explicit-choice",
}, references);
```

These reads require no credential or enabled collection gate. For 24 outputs the expectation must supply the external original `bindingSha256`, run/authorization/mode, candidate commit, configuration digest, v3 policy, endpoint/model/receipt route and all 24 expected request-body digests. Do not derive that expectation from the capture files being verified. Each original writer envelope, document/text identity, actual body digest, receipt audit and settlement identity is checked. The reader accepts only `binding.json` and the 24 known document filenames in that directory; write reports elsewhere. Missing files remain missing. Null/invalid candidates and raw assistant/finish fields remain unchanged.

For six outputs, `readSupplementCaptures()` invokes the reviewed `exportSupplementRun()` using the original externally pinned issuance and original read-only SQLite ledger. A freestanding JSON export is not accepted as authenticated input. The existing ledger did not retain finish flags or actual request-body digests: the report explicitly says `not-recorded`, preserves `audit.extractionRead`, and never replaces missing actual telemetry with reconstructed request expectations. The original corpus/configuration/issuance/ledger/receipt bindings are retained.

`captureAccounting.complete` means all 30 outputs were recorded with settled, locally verified receipt accounting. It does **not** establish startup-window, budget or paid authorization compliance; those remain separate original journal/operator-packet evidence. Receipt IDs must be unique across both collections. Local hashes and recorded audits are not an independent new provider query.

Only the captured decoded candidate fields construct independent source inputs. The production schema is `2026.11.1` with `items`/`reviewPoints`; document identity comes from the capture envelope. No missing review array, fact kind, term, hint or source quote is repaired from a reference. Invalid or missing inputs are retained with explicit issues and missing-source failures. If there is no representable production projection, course quality is `not-evaluated`, never a zero-observation pass.

The adapter calls current `validateDocumentExtraction` with `KIMI_SOURCE_MENTIONS_POLICY_ID`, `mapMaterialItemTerms`, and `createCourseTaskCoverageEvaluator` with the actual flagship blueprint/registry. Raw assistant fields, exact decoded candidate, source input, source validation/projection, removed terms, mapping details, task coverage and protocol observations are separate fields. Removed terms stay in source scoring and cannot disappear to improve the course score. An actual no-label fact uses the independent protocol's `literal: null`, without inserting its text as a term.

Both component views remain visible. `baseline` passes no learning-intent choices. `simulatedExplicitChoice` supplies only IDs whose actual projected kind is constraint/requirement and whose source document kind is not JD, matching the product eligibility rule. Exact IDs and unadopted IDs are recorded. Both views say `userConfirmationPerformed: false`, `planWritesPerformed: false`, and `selfAssessmentsAdopted: false`. These are component stimuli, not actual adoption or a changed live plan. The default scored view is `simulated-explicit-choice`; callers may explicitly select `baseline`.

The unchanged `validateCandidateInput`, `evaluateSource` and `evaluateCourse` supply the independent checks and thresholds. Native behavior reuse is a separate receipt with the original application commit and source closure. There are no fabricated `planObservations`, no native rerun, and no claim that the old native execution used current English bytes. Full current product integration remains a separate acceptance.

## Bounded software diagnostic

`current-quality.test.mjs` contains focused reader, projection, absence, explicit-stimulus and drift controls. `run-software-control.mjs <new-output.json>` is a separate, openly labelled one-pass diagnostic. It first reuses the existing scorer positive controls as software assertions, then discards their course/plan observations and feeds only their candidate inputs through the real current components. It writes with exclusive creation. Never call this diagnostic a Kimi result or use its fabricated software receipts as live evidence.

The November 19 diagnostic ran once: the existing scorer source/course controls pass, actual source scoring passes, and there are zero adapter issues. Actual course observations are **77 passed / 69 failed out of 146**. The overlapping mismatches comprise 48 topic, 53 basis and 59 task-coverage errors. Concrete examples:

| Frozen field / literal | Actual component observation | Frozen reference |
| --- | --- | --- |
| `resume-01-field-1` / `汇总查询` | uncovered, no basis, none | sql, contextual, none |
| `resume-02-field-1` / `React` | react, literal, none | react, literal, full |
| `resume-04-field-2` / `SQL joins` | uncovered, no basis, none | sql, contextual, partial |
| `resume-05-field-1` / `CSS` | web-platform, literal, none | uncovered, no basis, none |
| `resume-07-field-3` / `distributed tracing` | observability, literal, none | observability, contextual, partial |
| `jd-01-field-1` / `SQL` | sql, literal, none | sql, literal, partial |

These identify different product/reference gaps: narrow task anchors, missing contextual relations, and product alias provenance differing from the frozen course account. The accepted nine-anchor slice never proved all frozen phrases would pass. This adapter does not expand the parser/course library, weaken thresholds, rewrite reference answers, or conceal those failures. A bounded product repair and appropriate independent review are required before a paid evaluation can be proposed as ready.
