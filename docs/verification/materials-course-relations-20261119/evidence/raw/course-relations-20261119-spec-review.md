FINDING — Task A course-relation repair specification review, handoff 02, 2026-11-19.

One P2 finding prevents specification acceptance of this freeze. The source/course separation, content anchors, versioning and config scope checks otherwise satisfy the reviewed plan. This memo is an immutable initial review; a correction must receive a separate narrow re-review.

P2: Preserve unknown `following` qualifiers before deciding full coverage. At `app/lib/materials/course-relation-scope.ts:101`, the comma delimiter matches any `following` clause. The subsequent retained-term filter discards that clause even when it is an unknown task qualifier rather than recognized guidance. `courseTaskBody` itself only permits removing the specific `following review notes` suffix, but the earlier delimiter bypasses that limit. The full-coverage check at `course-task-coverage.ts:145`–147 does not recover the lost text because a comma is not an additional sentence boundary.

The announced minimal probe used the actual flagship blueprint/registry, mapper, scope function and coverage evaluator with one retained `HTML` label. It ran once, with three inputs and no test suite, transport, model call or production mutation:

| Source text | Actual retained scope | Actual coverage |
| --- | --- | --- |
| `Build semantic HTML forms.` | `build semantic html forms` | full / semantic-form / no remaining scope |
| `Build semantic HTML forms, following review notes.` | `build semantic html forms` | full / semantic-form / no remaining scope |
| `Build semantic HTML forms, following HIPAA requirements.` | `build semantic html forms` | full / semantic-form / no remaining scope |

The third result violates Task A's requirement to retain unknown tools, domains and qualifiers. Required correction: preserve unrecognized following modifiers in the task's owned scope; remove only the explicitly recognized guidance wrapper. The unknown-modifier case must be partial with unassessed remaining scope, while bare and recognized-guidance cases may remain full. Add only the targeted boundary regression. Exact observed output, input construction and source pins are preserved in `course-relations-20261119-spec-probe-following.json`.

Review scope was the ten frozen source/test files in `course-relations-20261119-handoff-02.json` (SHA-256 `43dc93f1603e74c3f7328bf106ea8bd22e664ac32c98fa74899140b8e50956a9`) against base `24a344858cfde17888675716df488421b61fff2d`, plus root's `tsconfig.json` and `eslint.config.mjs` exclusions. Plan/preflight/runbook edits and future Task B are not accepted by this review. Every frozen source hash and all 17 author evidence log hashes match their handoff/wrapper records.

The actual implementation keeps source extraction, retained text/terms, experience predicates, adoption and context-priority code unchanged. New mapping snapshots use `2026.11.7`; explicit prior alias versions remain accepted and historical snapshots are not rewritten. Default testing/tracing/HTML aliases now use bounded contextual relations where supported. Administrative meeting-note phrases become non-learning without consuming mixed responsibilities. Research does not receive flagship task anchors. Existing practice/priority tests and the focused negative cases preserve other-actor, negation, supplied-SQL and explicit-adoption boundaries; the finding above concerns task-scope coverage, not inferred personal ability.

Topic correspondence and taught-task support remain separate. SQL aggregates/windows/CTE/null/date-parameter/analytics work, TypeScript formatter/async-specific teaching, parser implementation, CSS and Figma tools do not acquire unsupported teaching leaves. Bare SQL stays unspecified; explicit broad SQL/TypeScript requirements expose only a partial catalog subset, and concrete unsupported requirements do not use that fallback. Accessible-form ambiguity remains visible while content union can cover a narrow task; explicit selection restricts support to the selected course. The UI's added combined-candidate explanation is exercised by a targeted render assertion.

I read the actual registry content supporting the new keyboard-state and product-outcome anchors and the added component token/semantic-fix rubric leaf. Their exact step/objective/build-task/criterion/rubric quotations exist in the current local units. Existing SQL ownership/join, form, testing, signal-selection and release support remains tied to actual content; the verifier checks each named leaf. Only two support IDs were added, all old IDs remain readable, and the course registry/content itself is unchanged. No app code imports historical gold or identifies corpus document/field IDs.

The config diff changes only exclusions: ignored `work` and the two exact immutable capture/adapter archive directories. Active source, tests, current adapter and worker tooling remain included. The inspected scope-check script compares parsed source sets and semantic compiler options; its saved result reports the same 887 files as the accepted scoped compiler run, with only incremental-cache/config-path differences. The 282 earlier scoped errors are confined to 14 relocated archival copies. Both config hashes match that result, and the actual diff changes no archive bytes or compiler/lint rules. The final three-file correction changes bounded regex conditions/assertions without new types or imports, so reuse of the prior compiler success is appropriate for that delta.

Saved evidence was inspected and reused rather than rerun:

| Evidence | Actual result and limit |
| --- | --- |
| Initial affected run | 13 files / 264 tests: 261 passed, 3 failed; raw failures retained |
| Causal failure repair | 3 files / 50 passed, including course coverage and practice-priority cases |
| Token-leaf guard | Specific RED, then 1 targeted GREEN; skipped cases are not counted as newly run |
| Latest three corrections | 3 RED cases, then 128/128 across relation, contextual mapping and practice mapping suites |
| Types / changed-file lint | Accepted compiler exit 0; all supplied lint receipts exit 0; later regex-only type reuse stated explicitly |
| Component diagnostic 02 | Source PASS and course 146/146; software-only current-component evidence |

Diagnostic 02 result SHA-256 is `60d18b0aefa3bec8ed93e2ce07455f442526044fd840f142101355426cd66ccc`; wrapper raw-log SHA-256 is `d6d9f38b72d6df09ca72c8c120d60b87cef1c777eec8e98ba02af065050939d4`. Its source handoff equals this freeze, and its pinned source/projection input is the original `13ad19db21a0d8e4abbd1e1b700645c449a9b5d28170541163d8ec806281c430` diagnostic. The script directly exercises changed components with saved unchanged projections and pure scorers; it does not fabricate a current-loader credential. Original 77/146 and intermediate 143/146 records remain preserved. The 146/146 control does not cover the newly demonstrated qualifier loss.

Native rebinding, trustworthy current aggregate, model quality and Gate approval remain false. The current adapter's native-drift rejection is intentional pending Task B. Neither saved software results nor this review claim a new native execution, paid authorization or release.

| Frozen file | SHA-256 |
| --- | --- |
| `app/lib/materials/skill-mapper.ts` | `2fb992337c5112856ee9253d2da843f5d5bd0be3d09de970c49023345e133b1c` |
| `app/lib/materials/course-relation-scope.ts` | `bf7035fd82bc8b90d7abfaef9440e7a25810c663e14d098d70696cd6bbe8f096` |
| `app/lib/materials/course-task-coverage.ts` | `5cbca147cb1d8c707cd4e8eb32b1e02e04d6b1d6c5c16b0eb57dc635b68e640b` |
| `app/lib/materials/course-task-evidence.ts` | `f21a983255129082788321455b8b5dfd8f574cbae370682680fb7e9bbe8cadd4` |
| `app/components/materials/material-context-review.tsx` | `3fcba579de055759e72241050321224fc1de071c34d60f09791e732372fd9f01` |
| `tests/lib/materials/course-relations.test.ts` | `459856e38778acd21b2e76d2db69298e8c938bbf7c5d51323b2b13d0dd390a6b` |
| `tests/lib/materials/skill-mapper.test.ts` | `cb888823d9d4746a11c9234e1d78de875311c145af5615dbb7d0b8ad388e5ef1` |
| `tests/lib/materials/practice-skill-mapping.test.ts` | `7cd4c88e1af0c92e4e8de2d2b81839beeb8234766d3bd9e3d9277c6ef7da3090` |
| `tests/server/material-practice-priorities.test.ts` | `59314cf66eb8ddc3d3e5eab8b9485038e16065e26340a634e507e2bbca9f6f84` |
| `tests/components/material-context-choices.test.tsx` | `9b8742703bef4a91da9e79233652ddb624e8d1bfb194dcbce45a372bd46dd852` |
| `tsconfig.json` | `5b2551b01448b64231114c46bd22e8b9bbf0dca4bfc15043e1a4a7157afcb653` |
| `eslint.config.mjs` | `bee3126106e217f300437d68d6cea72f90a44a9b52b8e65fb16366dab093f156` |

Reviewer changes: this memo and the focused probe record only. No production/test edits, routine/full/native test reruns, network/model calls, staging or commits.
