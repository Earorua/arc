# Mention adoption boundary: read-only diagnosis and bounded next actions

Date: 2026-11-08. Workspace: `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`.

This memo records current-behavior diagnosis, not a production repair or release/Gate result. All code references below are relative to that workspace and refer to the source hashes recorded by the probe. The new source-mention APIs were present during the recorded run but had no production call sites in `app` or `worker`; current production callers continued to use the affirmative APIs. In particular, the full negative task remained filtered. The investigation made no tracked-file changes, model calls, external network calls, deployment, production migration, push, or commit. Test databases were in-memory fixtures. This memo adds no tests or source changes and preserves the original observations and logs.

## Evidence and scope

Two wrapper runs executed the same five characterization tests. The second run removed an unused type-only import from the ignored probe and wrote a separate observations filename; original evidence was not overwritten. Both runs exited 0 with zero non-loopback denials. Passing characterization assertions confirm the observed behavior, including defects; they do not assert semantic correctness.

The latest run recorded 36 observations:

| Group | Count | Boundary exercised |
| --- | ---: | --- |
| Source pipeline | 16 | Actual source-span decoder, site extraction projection, mapper, and context creation |
| Manual compatibility | 8 | Legacy whole-fact mapping, explicit whole-item/per-term mapping, empty vocabulary, omission |
| Hint retention | 8 | Current helper compared with existing worker semantic support after edits |
| Review service | 1 | Actual extraction acceptance, edited draft save, and reload; no provider/model invocation |
| Learning intent | 3 | Existing unadopted/adopted constraint behavior and rejection of experience adoption |

Accepted context creations also checked that the persisted audit and availability equaled the request. The real review-save case checked that sourceRef was unchanged. These are narrow controls, not full planning-accept/replan lifecycle verification.

Artifacts under `work/grounded-verification/`:

| Artifact | SHA-256 |
| --- | --- |
| `mention-adoption-investigation-20261108-observations.json` | `c354987c0af777cb01c86f18b8329a5f5da459e8d6018de982e6f7db5b3cc84d` |
| `mention-adoption-investigation-20261108-observations-02.json` | `c354987c0af777cb01c86f18b8329a5f5da459e8d6018de982e6f7db5b3cc84d` |
| `mention-adoption-investigation-20261108-run-01.log` | `0d83dcc2bdfab97327130753d45cc937fc58193ce191e359216bd0d294e5a9ae` |
| `mention-adoption-investigation-20261108-run-02.log` | `d729f5548d371dc784c87b4f7ae61ac304fd3a94dd5c9ec9fe58b4ffe25f9298` |
| `mention-adoption-investigation-20261108-run-02.json` | `e390ba7b2d80094e836beb769b58b7ce9901c00d4f7e71cd64e91f7bec7281e0` |
| `mention-adoption-investigation-20261108-probes.test.ts` | `091b822f786841f9a26269d7f1811bac4037d3deaee1b322d5fd9dffaa153030` |
| `mention-adoption-investigation-20261108-vitest.config.ts` | `63faeac1d1e7c35a8c043f06f018da6c3673bcebc516245897af27446bba9fac` |

Recorded invocation:

```text
node work/grounded-verification/run.mjs mention-adoption-investigation-20261108-run-02 node_modules/vitest/vitest.mjs run --config work/grounded-verification/mention-adoption-investigation-20261108-vitest.config.ts --reporter verbose
```

All eight recorded source hashes were identical before and after the run:

| Source | SHA-256 |
| --- | --- |
| `app/lib/materials/grounded-skill-terms.ts` | `fa3c23292ed421f3e9ac50a2d09e3dbf636331398160a9bac27152b1d3d7afc7` |
| `app/lib/materials/skill-labels.ts` | `f34916313fd3fc62541d014defd28d3d99631a02c2ae8b8cd552c3a13b8170db` |
| `app/lib/materials/skill-mapper.ts` | `6f4498453530bd5fbcb8074501bbcea958a792eee3899eb6a9c66b5f514a2889` |
| `app/server/documents/context-builder.ts` | `de0d52a3288249004e6fcb2a726fc848e72e00f3a7e76e86ec193c207c34d091` |
| `app/server/documents/review-service.ts` | `55e57c60a11d280a3ef47011f5f7734f4084d3a29d3ee6fd28fdcb5196e7e9f6` |
| `app/server/documents/extraction-validator.ts` | `3f6da9ca836f902bc9a4385813dfccf897c1cde189ff17a4d3759c2ef57175b7` |
| `worker/document-executor/source-review-evidence.ts` | `2b51cb84aa127bf624a100123d042660b08ccad39688b7f4b77f8e4394f99354` |
| `worker/document-executor/source-span-extraction.ts` | `307009d79c572d8ab3df820cf4d6cd3e367ea72aac20ed80b7023620f46e99e9` |

## Demonstrated failures and controls

| Case | Current observation | Implication |
| --- | --- | --- |
| `I cannot yet configure a Kubernetes cluster myself.` with `Kubernetes` | Affirmative matcher returns `Kubernetes`; term survives, hint is null, catalog mapping is uncovered | Short-label affirmative matching does not establish positive capability or experience |
| Same fact with `configure a Kubernetes cluster` | Affirmative matcher returns null and the task term disappears | This is the prior semantic-retention loss; short and long nominations currently behave differently |
| `I cannot write SQL reports independently.` | SQL retained; no hint; SQL tier 3 | A retained limitation becomes a confirmed-experience priority |
| `I have never configured SQL for production.` | SQL retained; no hint; SQL tier 3 | Negated action can fall outside the attached-prefix negation grammar |
| Future SQL practice; hypothetical SQL practice; quoted SQL proposition; colleague's SQL practice | Each retains SQL and correctly gets no level hint, but gets tier 3 | Hint grounding does not guard the downstream practice list |
| Own React work plus colleague's SQL work | Both skills get tier 3 | A whole-fact boolean cannot provide correct per-skill attribution |
| Own SQL work plus denied React work | Both get tier 3 | One positive clause must not authorize another negative clause |
| Team React work plus own SQL work | Both get tier 3 | Collective attribution must stay separate from the learner's contribution |
| Mentor wrote SQL; learner scheduled review | SQL gets tier 3 | Mentioning a provided artifact is not necessarily personal work on that artifact |
| Learner tested SQL using supplied examples | Guided hint and tier 3 | Supplied examples can support real personal practice; do not exclude them wholesale |
| `I tested ‘SQL’ under supervision.` | Guided hint and tier 3 | Quoted tool names must remain distinct from quoted propositions |
| `I wrote SQL queries.` | No guided hint, SQL tier 3 | Absence of a guided hint is not absence of experience |
| `I am familiar with SQL.` | Conceptual hint, SQL tier 3 | Current confirmed-practice wording covers experience/skill-claim emphasis; it is not independent mastery |
| Positive legacy SQL fact, 164 characters, no skillLabels | Maps to SQL/tier 3; `findMaterialSkillEvidence(text, text)` is null | A full fact cannot be passed through a 100-character term API |
| Manual whole-fact mapping of `构建可访问的产品界面` to React | React tier 3 | Preserve the existing useful nonliteral manual flow |
| Negative whole fact manually mapped to React | React tier 3 | Catalog mapping does not negate the source's denial |
| Negative SQL term manually mapped to React | React tier 3 | A per-term override changes its destination, not its source attribution |
| Explicit skillLabels `[]`; per-term omission | No priority | Do not restore deleted terms or add an implicit whole-fact fallback |

The hint helper retained guided SQL after removing guidance, changing the actor to a colleague, changing the action to future, denying the action, and quoting the proposition. In every one of those five edits, the existing worker semantic helper returned null. Unchanged guidance retained its supported hint; removing the label or reclassifying the fact as a constraint removed it.

The real ReviewService case accepted a synthetic canonical candidate for `I tested SQL under supervision.`, saved `My colleague tested SQL under supervision.` as a user edit, and reloaded it. The original guided SQL hint and citation survived. This demonstrates a save/reload defect, not just a hypothetical helper misuse. No provider was called.

## Current data flow and exact causes

- `app/lib/materials/skill-mapper.ts:57-96` resolves catalog relationships. At line 76, manual/legacy facts use the complete item text; labelled facts use only the retained list. Exact per-term membership, omissions, manual overrides, and intentional empty lists are deliberate controls.
- `app/server/documents/context-builder.ts:264-275` computes per-term details, but lines 277-291 subsequently use grouped mappings. Line 289 pushes every mapped non-JD experience/skill-claim into practices, without actor, polarity, time, or quote-scope checks.
- `app/lib/materials/skill-labels.ts:32-37` retains hints by kind and label membership. It does not recheck the meaning of the current fact.
- `app/server/documents/review-service.ts:247-250` rejects forged/new hints and requires prior hint identity. An authentic old hint can nevertheless survive an unsupported edit.
- `app/server/documents/extraction-validator.ts:45` uses affirmative evidence for source-word retention. Lines 49-52 fan a candidate hint out over surviving labels.
- `worker/document-executor/source-span-extraction.ts:108-113` grounds vocabulary with the affirmative API before separately grounding the proposed hint. Lines 123-138 preserve the full-document review/quotation safeguard.
- `worker/document-executor/source-review-evidence.ts:234-258` supports a proposed level through its specific clauses and retained labels. Ordinary unguided action intentionally produces no guided hint. This function cannot itself become an experience-priority predicate.

The prior three-loss record remains `docs/verification/materials-product-observations/evidence/product-course-independent-projection-filter-20261107.md`: two lexical boundary losses and one affirmative-versus-mention contract mismatch. This investigation neither edits those references nor turns the negative task's current disappearance into a non-learning control.

## First bounded action: share existing evidence and repair stale hints only

This is the smallest next repair. It does not require wiring mention APIs, implementing a new experience classifier, changing mappings or learning-intent eligibility, or introducing a new review projection.

Suggested module: `app/lib/materials/self-level-evidence.ts`. Move the current pure implementation unchanged, including private dependencies; do not copy or independently rewrite its regexes. A literal extraction can preserve these compatibility-facing exports used by the worker:

```text
quoted
maskQuotes
hypothetical
deniedAssertion
selfConflict
deniedConflict
assessmentScopes
personalPracticeNeed
personalCapabilityQuestion
supportsLevel
```

The first six are needed because the worker's detached-quote, asserted-clause, requirement-conflict, and review-point paths already use the same patterns. `assessmentScopes` and `personalPracticeNeed` are used together by its existing learning-limit check. Exporting them initially avoids adding a second implementation or mixing a new abstraction change into the repair. Guidance patterns, `assertedSkillEvidence`, `guidedSkillScope`, conceptual/uncertainty predicates, heading handling, and other implementation details stay private. A later encapsulation can replace raw-pattern exports with small functions; that is not necessary for this step.

Dependencies of the new module are only `findMaterialSkillEvidence` and type-only `DocumentCandidate`/hint types from app contracts. There must be no runtime import of the worker tree. In particular:

- Keep `groundSourceSelfLevelHint` as the existing worker adapter, preserving its signature and kind/null checks; it delegates to the extracted `supportsLevel` and `maskQuotes`.
- Keep `groundSourceReviewPoints`, `groundedStatementBoundaries`, `isDetachedQuotedStatement`, requirement-level handling, source location, and their worker dependencies where they are.
- Preserve `supportsLevel(quote, masked, proposed, labels)` or an equivalent explicit masked-text parameter. `groundSourceReviewPoints` passes a slice of the full document's masked text. Remasking only a detached sentence would lose enclosing quotation context and regress existing protection.
- Preserve quote masking's UTF-16 length and the exact personal-heading, report, hypothetical, denial, contrast, actor, and repeated-task behavior.

Then strengthen current grounded-review hint retention in `skill-labels.ts`:

1. Keep item existence, legal kind, exact retained-label membership, and the server's extraction/prior-hint identity restrictions.
2. For each remaining hint, require `supportsLevel(item.text, maskQuotes(item.text), hint.level, [hint.skillLabel])`.
3. Recheck that hint's label, not every newly added source term. This retains an existing supported hint without granting a hint to an added term. The shared helper already checks repeated mentions of the same term across tasks.
4. Do not infer a replacement level, manufacture `uncertain`, or retain a hint merely because the source word still occurs.

Recommended compatibility boundary: add an explicit projection argument to the retention helper and initially apply stricter semantic revalidation to the existing grounded review projection. Keep legacy/v1 retention behavior intact for this bounded repair. Pass the server-owned extraction projection at `review-service.ts:249`; pass the draft projection in the current UI callers at `app/components/materials/material-confirmation.tsx:39` and `app/components/materials/material-text-panel.tsx:373`. Do not accept a client-selected projection in the mutation contract. Source corrections, labels, sourceRef, and review points remain governed by their existing rules.

This boundary fixes the demonstrated grounded-v2 edit while avoiding silent reinterpretation of historical paraphrased v1 summaries. Persisted historical drafts/candidates are not rewritten on read. If the intended scope instead includes revalidating every historical hint, that is a separate compatibility decision: an older summary can omit guidance that was present in its original citation. Do not claim that the bounded grounded-review repair handles all such legacy records.

Validation for this future step should preserve existing source-review/source-span behavior and add narrowly targeted edit/save/UI regressions: actor swap, guidance removal, future/quoted/negated edit, unchanged supported hint, label removal, added term without new hint, and v1 reopen behavior. No such future tests or source work were added by this memo.

## Following action: separately test experience provenance

Before retaining additional negative/other-person/future/hypothetical topics in production, protect the practice list independently. Keep source mention, catalog relationship, experience priority, and level hint as four decisions.

A bounded experience interface could distinguish source-term evidence from legacy whole-fact evidence:

```ts
supportsMaterialExperience({
  kind,
  text,
  target:
    | { kind: "terms"; terms: readonly string[] }
    | { kind: "confirmed-whole-fact" }
}): boolean;
```

This is a following-step design sketch, not implemented logic or an assertion that the current scope parser already solves general experience attribution.

- Consume per-term mapping details before grouping. A positive React clause must not authorize a colleague's SQL clause, and a denied SQL clause must not erase a supported React clause.
- For labelled facts and per-term overrides, classify the original retained term, not the mapped course's name.
- For automatic unlabelled legacy mappings, retain the aliases that actually matched each skill inside the existing mapper resolver; do not create a second catalog vocabulary in the guard.
- Keep a separate explicit whole-fact path for legacy/manual mappings. It must allow ordinary confirmed personal/responsibility fragments, bare skill claims, long positive facts, and useful nonliteral manual mapping. Do not feed the whole text into the bounded term API or suppress all unlabelled facts.
- A manual catalog relation cannot override an explicit denial, another actor, a future plan, or an embedded proposition. Mixed whole-fact mappings without a defensible relation to a particular personal task require conservative attribution; discovery remains available.
- Action polarity is distinct from guidance polarity. `I tested SQL without supervision` supports experience but not a guided level. Supplied examples can support personal practice; another person's supplied SQL alone does not prove the learner wrote or tested it.
- Experience priority is existing-practice emphasis, not independent ability. Do not substitute `groundSourceSelfLevelHint(...) !== null` for this predicate.

Any provenance added to `ResolvedMaterialTerm` can stay internal, allowing existing public mapping projections and exact empty-list/omission behavior to remain stable. Only supported per-skill relations enter `practices` at `context-builder.ts:289`; the complete mapping details and source facts remain visible.

## Following action: versioned source-mention wiring and truthful discovery display

Only after the independent guards are tested should the decoder, review-label validation, and source-term addition adopt mention retention. Keep the full source fact, attribution, qualifier, citation, review points, and exact correction/removal rules unchanged. Hints remain semantic suggestions and are never inferred from mere mention presence.

New retention semantics need an explicit server-owned projection version. `extraction-validator.ts:20-23` reprojects stored candidates. Swapping the meaning of the existing v2 discriminator can reinterpret old envelopes and restore previously excluded vocabulary on reread. Preserve legacy/v1/v2 dispatch; introduce the new semantics for new captures rather than rewriting historical records. The exact discriminator/policy naming should be chosen with the implementation plan.

For new contexts, a changed experience-priority rule requires a planning-policy version change. Mapping version only needs to change if catalog mapping semantics or its public result change, not merely because internal provenance is carried. `context-builder.ts:191-205` must continue returning the frozen preview, with its existing fingerprint/dependency guards, rather than recomputing history under the new logic. Existing explicit planning accept, audit, availability, and independent self-assessment adoption remain unchanged.

Discovery display must stop equating mapping with priority. `app/components/materials/material-context-review.tsx:196` currently says mapped skills while counting `preview.priorities.length`. After separation, a mapped topic can correctly have no priority. Count distinct mapped skills from mappingDetails, or describe the number as prioritized skills. Review source-term wording so retained topics are not presented as demonstrated capability.

## Optional separate action: broader learning-intent eligibility

Expanding eligibility to resume experience/skill claims is not necessary for safe mention wiring and should not be included automatically. Existing constraint/supplemental-requirement adoption remains independently explicit. The probe confirmed its unadopted rank 5, adopted rank 3 with empty practiceItemIds, unchanged audit/availability, and current rejection of experience adoption.

Under the bounded wiring scope, a negative experience/skill-claim topic can be discovered and mapped without automatic experience priority, but it cannot currently be adopted through the learning-intent checkbox. Record that limitation rather than implicitly reclassifying the fact or interpreting textual desire as consent.

If expanded later, do not merely broaden `learningIntentEligible` at `context-builder.ts:334`. Lines 252-254 mark every unselected eligible item unadopted, and line 279 skips it before experience projection. Separate optional intent eligibility from the condition that requires intent before planning. The copy at `material-context-review.tsx:184` also assumes an unadopted eligible fact has no automatic experience contribution and would need adjustment. Mixed facts require particular care. This remains a separately explicit follow-on.

## Existing controls to preserve and unresolved choices

- `tests/server/document-source-review-evidence.test.ts:527-758`: supplied examples, ordinary action without a level, quoted tool versus quoted proposition, other actors, future action, task-scoped guidance, personal résumé fragments, repeated terms, and bilingual scope.
- `tests/server/document-source-span-provider.test.ts:266-309`: full source facts and terms survive while unsupported personal hints are withheld.
- `tests/server/material-confirmed-skill-labels.test.ts:141-225`: source/last-save vocabulary authority, removal non-restoration, explicit source-term addition, and no new hint for a correction.
- `tests/server/material-mappings.test.ts:69-104` and `tests/lib/materials/skill-mapper.test.ts`: manual mapping identity, nonliteral legacy mappings, exact term overrides, empty-list behavior, omissions, and versioned catalog boundaries.
- `tests/server/material-learning-intents.test.ts:36-116`: explicit adoption, unchanged audit/time, primary-JD precedence, current experience rejection, and frozen historical preview replay.

The first repair can be limited to extraction of existing pure helpers and grounded-review stale-hint retention. It does not settle how limited personal modification of mentor-provided SQL should contribute experience, how a manual whole-fact mapping spans mixed actors/tasks, or how to support fresh edits of historical paraphrased hints beyond the chosen projection boundary. Those decisions need targeted controls in their respective later steps. None warrants broad source removal, blanket loss of manual fallback, modification of frozen references, or an overall pass claim.
