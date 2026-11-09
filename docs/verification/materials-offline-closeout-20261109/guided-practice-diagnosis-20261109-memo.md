# Guided Chinese data-cleaning practice: read-only diagnosis

Scope: close the known `我在指导下清洗数据。` v3 false negative without changing legacy/v1/v2 behavior or expanding arbitrary natural-language recognition. No tracked source/test/configuration was edited. The only writes are this memo and diagnostic artifacts under ignored `work/grounded-verification/`.

Read both required source indexes (local and GitHub master) and the checkout AGENTS. Actual branch was `codex/materials-replan-recovery-20261106`, HEAD `1f65e4a483399db8fb6c143e076f3d7523675399`, ahead 7; initial tree was clean. A later status showed the other author's untracked `tests/server/material-numbered-statements.test.ts`, which was left untouched. The routing document's old pause/release records were treated as historical evidence. No credentials, model calls, migrations, deployment, commit, or push were used.

## Causal proof

Fresh offline probe: `guided-practice-diagnosis-20261109-01-results.json` (18 cases), run using `node work/grounded-verification/run.mjs guided-practice-diagnosis-20261109-01 work/grounded-verification/guided-practice-diagnosis-20261109-01.mjs`. Wrapper exit 0, zero non-loopback denials, log SHA-256 `c556f888deee78704170c6af2f465ff6b13378d541ea823130b249019c3350d9`. The result records project-input SHA-256 values and raw observations; the compiled bundle preserves the probed source. No model is involved.

| Gate | Natural `我在指导下清洗数据。` | Existing control `我在指导下练习清洗数据。` |
| --- | --- | --- |
| Affirmative lexical evidence | `清洗数据` | `清洗数据` |
| Nominated v3 topic | `data cleaning` | `data cleaning` |
| Chinese guidance prefix | `我在指导下` | `我在指导下` |
| `practiceAction.exec(action)` | null | `练习` |
| `supportsMaterialSelfLevelHint` (raw and canonical label) | false | true |
| `groundSourceSelfLevelHint` | null | guided |
| Grounded confirmation reminder | absent | present |
| v2 and v3 decoded hint | null | guided |
| Direct v3 site validation of proposed canonical hint | removed | retained |
| Stored v3 replay | same as direct site | same as direct site |
| Edited-hint retention (legacy/default, v2, v3) | removed | retained |
| Existing `supportsMaterialExperience` | true | true |

This independently reproduces the preserved `mention-projection-provider-spec-20261109-baseline-05-results.json` observations. The statement does contain personal practice; only the guided-practice verb gate fails. It is not a source-term or canonical-label failure.

Exact failing gate: `app/lib/materials/personal-assertion-scopes.ts:46` scans `practiceAction` (`:16`), which omits 清洗. `guidedSkillScope` at `:77` returns null. Both the hint and the independent review-question paths then reject it. Broadening `practiceAction` globally would also change `personalPassivePractice`, `experience-evidence.ts` imports/callers, and all old projections.

Adjacent guard exposed by the same probe: `我在指导下清洗数据的计划尚未执行。` currently incorrectly returns guided. The old scan skips to `执行` inside the denied plan, then tests only the empty suffix after that verb. A v3 cleaning branch added only when no old verb was found would leave this false positive in the new class. Keep this negative in the bounded acceptance set. This is evidence about one adjacent cleaning phrase, not a request for unrestricted grammar expansion.

## Recommended bounded design

Introduce one explicit optional evidence mode/option, defaulting to the current behavior, and enable it only at exact v3 boundaries. Do not modify the existing exported `practiceAction`, `personalPassivePractice`, generic experience recognition, quotation grammar, old prompts, stored IDs, or old projection markers.

Within the existing Chinese guided branch, retain guidance extraction, actor attribution, negation, reporting, hypothetical/quotation scope and per-label checks. For the v3 mode only, recognize the direct Chinese data-cleaning predicate from the existing grounded cleaning grammar in `grounded-skill-terms.ts:11-19`, rather than adding `清洗` as a free verb or testing topic presence. The existing `findMaterialSkillEvidence(action, "data cleaning")` already provides an affirmative, bounded, data-object-qualified literal. Accept only an initial verbal form (`清洗…` or `对…清洗`) whose actual predicate clause is the complete grounded action; reject a nominal `数据清洗` heading, a plan/report/example suffix, a non-data object, and `数据中心`/hardware continuations. Let this initial cleaning predicate take precedence over a later generic verb such as the `执行` in an unexecuted plan. This can reuse the existing locator; no new synonym list is necessary.

For the smallest complete fix, keep this new branch limited to the grounded direct action and the already-supported guidance/context/scope separators. Do not introduce arbitrary adverbs, actor names, unlabeled duties, generalized Chinese verbs, or broad semantic equivalence. A simple whole-predicate check is a safe bounded choice; additional trailing narrative forms are outside this closeout unless already recognized by the old branch.

Retain `assertedSkillEvidence` and the current all-scopes/all-labels rule. A v3 topic mention must not be substituted for affirmative self-evidence. When a fact has both a guided cleaning clause and an unsupported occurrence of the same label or a different actor's label, withhold its single whole-fact hint while allowing the personal confirmation question for the actual personal clause.

Alternative rejected: merely append 清洗 to the shared regex, or accept any v3 `findMaterialSkillMention` hit as practice. Both change the wrong semantic boundary; the former changes old/history/experience behavior and the latter promotes negative/other/future topics into ability.

## Required call-path propagation

1. `personal-assertion-scopes.ts`: optional v3 evidence mode on `guidedSkillScope` → private `guidedPractice`; leave omitted/default behavior unchanged. `experience-evidence.ts:50` must continue calling the old default.
2. `self-assessment-evidence.ts`: forward the mode through `supportsSelfLevelHintInScope` (`:37`), `supportsMaterialSelfLevelHint` (`:59`), and `hasPersonalCapabilityQuestion` (`:17`). Both the level and independent reminder need it.
3. `source-review-evidence.ts`: forward through `groundSourceSelfLevelHint` (`:82`), `groundSourceReviewPoints` (`:208`) → `supportedCodes` (`:165`) → all three personal-evidence calls (`:191`, `:200`, `:201`). Coordinate this shared file with the numbered-statement author. A trailing optional argument after existing `bounds` preserves old callers.
4. `source-span-extraction.ts`: pass the new mode only when `format === "source-spans-v3"` (`:103`), to both `groundSourceSelfLevelHint` (`:124`) and `groundSourceReviewPoints` (`:132`). If the latter remains old, the final confirmation guard (`:137-148`) clears the newly accepted hint again.
5. `extraction-validator.ts`: both personal checks at `:69-70` need the mode in the exact `projection === SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION` branch (`:37`). The second check must still use full-document quotation masking. This covers direct canonical validation and persisted envelope replay independently of the worker.
6. `skill-labels.ts:49`: pass v3 mode only for the exact source-mention projection during `retainedMaterialSelfAssessmentHints`. `isSourceLinkedMaterialReviewProjection` alone is too broad because it also includes v2. This already reaches the actual UI (`material-confirmation.tsx:39`, `material-text-panel.tsx:373`) and `review-service.ts:249` save/reload path; those callers already carry `draft.reviewProjection` / extraction projection.

Trusted IDs remain exactly `materials-openrouter-kimi-k31-pro-mxfp4-zdr-extractive-v3`, `source-spans-v3`, and persisted `source-skill-mentions-v3`. Do not use a prefix check or change `extractionProjection`, schema version, history envelopes, or provider routing. Unknown lookalikes must not enable the new mode.

## Acceptance set

- **Required positive through every boundary:** source quote `我在指导下清洗数据。`, wire `skillTerms: ["清洗数据"]`, proposed guided → canonical label `data cleaning`, guided hint, sourced `confirm-self-assessment`; exact v3 site projection and persisted replay retain it; current unchanged/edited personal fact retains the existing hint. Actual review save/reload uses the same projection. The canonical label is not a legal replacement for the literal wire nomination.
- **Same narrow grammar:** grounded aspect form `清洗了数据`, fronted `在导师指导下，我清洗数据`, existing short guidance `我按指导清洗数据`, and explicit data-object `对原始数据进行清洗`. These use existing data cleaning objects and existing guidance syntax, not a new verb taxonomy.
- **No hint invention:** proposed null remains null even if a supported personal reminder is generated; empty retained hint list stays empty. Adding a source topic alone does not create a hint. Removed hint/label/item stays removed.
- **Guard cases preserve v3 topics, deny guided:** `我在指导下没有清洗数据。`; `我在指导下计划清洗数据。`; `同事在指导下清洗数据。`; `在导师指导下，我的同事清洗数据。`; `我报告说，我在指导下清洗数据。`; `示例：“我在指导下清洗数据。”`; conditional `如果…`; nominal `我在指导下数据清洗。`; and unexecuted plan `我在指导下清洗数据的计划尚未执行。`. For these cases there is no independent personal-ability assertion, so no confirm-self-assessment should be synthesized.
- **Lexical boundaries stay separate:** `清洗设备` and `清洗数据中心` must not become canonical data cleaning or gain a cleaning guided level. No document terms nominated → no generated skill labels.
- **Scope independence:** `我在指导下清洗数据，但我独立清洗数据。` retains the topic and relevant reminder but has no whole-fact guided hint. A cleaning clause must not give another actor's SQL clause a level. Requirements/constraints remain ineligible.
- **Compatibility:** byte/deep-compare old default helper observations, v2 decoding, legacy/v1 history/envelopes and the existing explicit `练习清洗数据` control against frozen before data. In particular natural v2 stays null while explicit-practice v2 stays guided. Preserve the observed historical generic/v1 behavior instead of rewriting fixtures to new semantics.

Spec basis: approved design sections 5.3 (`:195-201`), 6.3 (`:262-270`), 6.4 (`:275-277`), and F04/F05/F06/F09/F10 (`:751-757`) require source-backed useful prefill, separate explicit adoption of ability suggestions, recoverable edits, and no promotion of mere source mentions to verified mastery. This diagnosis is offline evidence only; it does not resume production/model/release acceptance.
