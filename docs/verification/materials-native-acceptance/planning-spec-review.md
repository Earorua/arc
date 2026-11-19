# Native planning specification review

Date: 2026-11-19. Reviewer: independent `native_planning_spec`. Reviewed the approved protocol, fixed inputs, worker, collector, checker and raw `native-planning-20261119-matrix-01` observations. This review did not rerun the matrix or any application test suite.

**Result: PASS for all 14 native behavior bindings after the narrow UI evidence correction.** No open specification finding remains. The actual native run collected all 14 categories and passed its 66 assertion groups with no source drift, collector failure or outbound attempt; a separate focused UI observation closes the one missing control-boundary citation.

## Resolved finding

**P2 — The reused five-case UI file does not establish bulk-independent control absence — resolved additively.** The original frozen `planning-inputs.json:37` describes its reused `tests/components/material-adoption-persistence.test.tsx` evidence as including the bulk-independent control boundary; the initial collector report repeated that claim. Those five cases cover optional/guided adoption, individual independent selection, persistence and restart; they do not assert that the bulk-independent control is absent with selected materials. The native batch case correctly executes the real rejecting contract and demonstrates unchanged records, but that citation alone did not supply the separately promised UI observation.

The implementation wires `allowBulkIndependent={!hasMaterials}` in `adaptive-setup-flow.tsx` and filters the independent bulk option in `skill-audit-step.tsx`; no product defect was found. The [supplemental observation and citation correction](planning-ui-evidence-addendum.md) now supplies the missing evidence. Its one test renders the real AdaptiveSetupFlow and MaterialSetupProvider with declared synthetic document transport, observes bulk-independent buttons before selecting a resume, then verifies their complete absence (including hidden disclosure contents), a still-usable individual independent choice, unchanged unrelated answers and zero generation calls. The corrected collector report distinguishes this observation from the five reused historical tests. Frozen inputs, native results and product source remain unchanged.

Narrow re-review inspected the probe/configuration archives and actual `bulk-ui-02` result: one file / one test passed, exit 0 and zero non-loopback denials. All seven supplemental artifact hashes and five bound application/fixture hashes matched. The supplemental manifest SHA-256 is `79c7bef78ecae875dbbfad70fa99a1c4e2314af37a726024c65a22c28f095675`; final log SHA-256 is `7641b8467b24dc3043200b90f1ce8e5e6c38442b0d8cd108ead533946dcde871`. The original native check, input, source closure, infrastructure, migrations and frozen-reference hashes still match. An initial incorrectly merged test include configuration began unrelated tests and was interrupted; its configuration, partial log and interruption receipt are retained and explicitly not counted as an acceptance result. The final configuration replaces the include list and the command filters the exact single probe file. This reviewer reran no test or matrix.

## Native requirements checked

| Category | Observed evidence and judgment |
| --- | --- |
| `fact-confirm-only` | Actual create/read/save/confirm transaction, incremented confirmation revision and row; existing plan/context, audit, completion and Proof preserved. PASS. |
| `explicit-guided-self-adopt` | Source-bound synthetic guided hint, explicit single-choice contract input, actual initial generation and repository reload retaining only the selected changed answer. Accepted UI adoption/persistence evidence is applicable. PASS. |
| `reject-batch-independent` | Actual contract throws the individual-selection issue; complete native records unchanged. The supplemental real UI observation establishes hidden bulk controls while individual choice remains usable. PASS. |
| `explicit-single-independent` | Individual self-report precedes real generation; persisted audit matches the chosen input, other answers remain, no material hint grants independent. Accepted single-choice UI evidence is applicable. PASS. |
| `unadopted-learning-intent` | Confirmed supplement without intent has the visible not-adopted issue and no React focus/hard authority; existing plan unchanged. PASS. |
| `explicit-adopt-soft-focus` | Actual context/proposal/accept sequence; current links stay unchanged before acceptance, React becomes soft rank 3 afterward, primary SQL must retained. PASS. |
| `withdraw-focus` | Two adopted item intents become one through proposal and explicit acceptance; the document and other item remain; reload retains withdrawal. PASS. |
| `delete-material` | Actual delete/read-deletion returns cleanup-pending; contexts/proposal revoked, removed document link disabled, reuse and acceptance throw CONFLICT; progress/Proof retained. Physical cleanup completion is not claimed. PASS. |
| `exclude-individual-term` | Exact retained SQL term receives empty mapping; React remains mapped/usable, confirmations unchanged, accepted context stores only the intended exclusion. PASS. |
| `replace-primary-jd-same-job` | New JD C is created/confirmed/selected with resume and supplement retained; candidate has C while active plan/links still have A before acceptance. PASS. |
| `accept-current-primary-jd-preview` | Real base/candidate/context identifiers, accepted proposal row, active-plan switch and adopted/usage links agree after fresh reload; C replaces A with other materials retained. PASS. |
| `secondary-jd-cannot-add-must` | Secondary JD is a supplement; without/with explicit intent only primary SQL is mandatory and React changes from rank 5 to soft rank 3. PASS. |
| `unresolved-conflict-not-hard-resolved` | Declared source-bound upstream BEFORE review point; actual confirmation throws invalid-content, unresolved point remains and no confirmation or plan change appears. PASS. |
| `stale-preview-reject` | Real proposal invalidated by legal selection change; acceptance throws CONFLICT, proposal revoked, active context and native records remain unchanged. PASS. |

Every existing-plan category starts with a real completed task and nonempty rows in all four Proof tables. Legal goal initialization uses the actual local `CloudService.importLocalState` with explicit synthetic consent, 52 weeks, 420 minutes and empty imported completions/Proof. Documents, confirmations, selections, contexts, generation, completion and Proof execute actual services. Direct SQL is limited to the declared synthetic identity and upstream extraction/review-point inputs; no evaluated after-state is seeded.

Protected-state assertions cover the complete audit, goal/workspace/source identity, availability versions, target, task set/content/version/dependencies/minutes, historical DailyUnits and plan/path rows, completion events and Proof. Proposed and active states are distinguished before acceptance; new candidate prerequisite order and scheduled budgets are checked. Service returns and independently instantiated repository reloads agree. The setup self-assessment cases deliberately precede generation and do not claim an active-plan audit-edit endpoint or verified competence.

## Integrity inspection

Read-only inspection matched all 14 raw case hashes, the worker bundle, manifest/index/check bindings, and every current imported source, infrastructure, migration and historical-reference digest. The 14 case IDs equal the frozen original list in order. All 146 imported source files remain equal to the executed closure. The starting HEAD was `850b6be` with the reviewed course patch present; the parent subsequently committed those same application bytes as `47b0e0a`.

| Artifact | SHA-256 |
| --- | --- |
| Native manifest | `c65d84b1048dbad28f0eea7e21e81c77c4c577b43c0bb67ab77fb978fd1b6d4d` |
| Fixed input | `1dc54a3f857cf2d03940005e48bbe7e5a6993d83e6b659638e28eeb936c40064` |
| Imported source closure | `c82c4fb905f089c9f62ddd3280be5e51d1bd355d5bc756fd3823b8fb31a993a3` |
| Worker bundle | `538b6b363536232740875f282a68568c8d547957386266e4c85fc3a6913cfe35` |
| Checker source | `51ce03f02fceefb4fac44c1fe7b2f7f4176177760fc6442904fdd3b0a62ce124` |
| Recorded check result | `d9026957497342116e47e7c77071839fe669119b33958adf89c304fc216461de` |

The old abstract scorer and expected files were not used to manufacture native expected outputs or rewritten. This review does not approve real-model quality, hosted runtime behavior, Gate 1B or publication. Only this memo was written.
