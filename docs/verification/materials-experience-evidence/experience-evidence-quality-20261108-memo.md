# Task 1 independent code-quality review — FAIL

Reviewed on 2026-11-08 in `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`, branch `codex/materials-replan-recovery-20261106`, uncommitted source over HEAD `a5745ae86eb3133068ee147a297a5e5aa47c490a`.

**Verdict: not ready for Task 1 local integration until the quoted-proposition whole-fact finding below is repaired and independently re-reviewed.** This is one reproducible important correctness finding. It is not a claim of a current production incident: no production caller uses the new guard yet. Public release is outside this review and still requires the later integration and release gates.

## Finding

**Important / P2: a written quoted proposition becomes personal whole-fact experience.**

- Location: `app/lib/materials/experience-evidence.ts:75` and `:88`; consumed by the whole-fact branch at `:148`–`:155`.
- Minimal reproduction: `supportsMaterialExperience({ kind: "experience", text: "I wrote “My colleague tested SQL.”", target: { kind: "confirmed-whole-fact" } })` returns **true**, expected **false**.
- The same failure occurs for `I wrote “I tested SQL.”` and `I wrote "I tested SQL."`. These are three variants of the same finding, not three separate issues.
- Controls: all three strings return false for a `terms: ["SQL"]` target. `I wrote that my colleague tested SQL.` returns false for both targets. Actual `I wrote SQL reports.` and `I tested “SQL” independently.` return true for both targets.
- Root cause: `maskQuotes` leaves the sentinel `Q` after the real writing verb. The report-object check recognizes unquoted `that`/`how`/`whether` and report nouns, but it does not recognize the quoted proposition as an embedded object. `personalExperienceScope` therefore sets `whole: true`; `uncoveredText` removes the entire accepted scope, so the whole-fact completeness path cannot recover that unsupported proposition. The term path is protected by the existing quoted-tool-versus-proposition rule in `assertedSkillEvidence`, but the whole-fact path bypasses that distinction.
- Impact: an explicit nonliteral whole-fact/manual relation can acquire practice priority from a quotation of another person's or hypothetical first-person SQL work. The quotation is not evidence that the user performed SQL. This is the already specified report/quote boundary, not a request to expand actor or skill vocabulary.
- Repair scope: preserve the quoted proposition as unsupported whole-fact content using the existing quotation facilities, while retaining quoted tool names and actual SQL report/query work. Add these exact negative whole-fact assertions with their passing term and actual-work controls. Do not change the frozen shared assertion parser or level/reminder behavior.
- Evidence: `experience-evidence-quality-20261108-probe-results.json`, case IDs `quoted-report-object-whole`, `quoted-personal-proposition-whole`, `quoted-personal-proposition-ascii-whole`.

The initial prompt report called this “P1/Important”; the final severity is P2/Important because the incorrect behavior is bounded to the new whole-fact API and has no production caller yet. It still needs repair before Task 1 integration/Task 2 wiring.

## Review scope and strengths

Read all four changed files, the shared quotation and grounded-term dependencies, relevant input schemas, the reviewed plan and author handoff, and the actual assertions in the new test file. Applied requesting-code-review/code-reviewer, verification-before-completion, and systematic-debugging for the reproduced failure. The only parent `AGENTS.md` found was the empty `C:/Users/XF/.codex/AGENTS.md`.

- The helper extraction preserves all 28 original non-import declarations literally after removing only the newly added `export` modifier. Exactly 18 declarations moved, and each exists once across the two modules. The baseline SHA-256 was independently checked before comparison.
- The new API is a pure discriminated-union predicate. It separates terms from explicit whole facts and does not make a self-level decision, mutate the input, use I/O, create an environment-dependent cache, or add skill/name dictionaries.
- Sentence segmentation intersects the original allowed ranges, preserving the existing report/condition behavior and UTF-16 quotation coordinates. The normal technical-punctuation and soft-wrap cases in the focused checks pass.
- The 171 API tests assert the real implementation. The selected 5 suites passed 1,079 tests, including existing self-level, retention, grounded-term, and source-review behavior. No source or test expectations were edited by this reviewer.
- All original test lines from the initial author freeze remain in order. This check counts 238 content lines after `trimEnd()`; splitting the original final newline as an empty entry gives the previously reported 239 entries. The current file has 257 content lines.
- `rg` found the new function only in its defining module and test file under `app`/`tests`: no production wiring was introduced in Task 1.

## Input bounds and performance observation

`app/contracts/documents.ts:23` bounds candidate/confirmed-item text to 1,000 UTF-16 code units; `:24` bounds distinct labels to eight strings of at most 100 code units. The helper itself is not a schema validator, so later integration must retain these existing validated-input boundaries.

The independent preservation script exercised four 1,000-code-unit shapes: many sentences and many commas, each through eight-term and whole-fact targets. All 140 calls returned the expected true result; each shape had five warmups and 30 measured calls. Median/p95/max milliseconds were respectively:

| Shape | Median | p95 | Maximum |
| --- | ---: | ---: | ---: |
| Many sentences, eight terms | 3.8653 | 8.3492 | 9.3733 |
| Many commas, eight terms | 5.8501 | 6.0361 | 6.0931 |
| Many sentences, whole fact | 0.1818 | 0.2095 | 0.2209 |
| Many commas, whole fact | 1.3391 | 1.4879 | 1.5231 |

These are local Node observations, not an SLA or a workerd load benchmark. No additional performance finding was established. The bounded normal controls were not expanded into an unrelated grammar search.

## Source freeze

The reviewer copied all four current files byte-for-byte into `work/grounded-verification/experience-evidence-quality-20261108-source-freeze/`, retaining their relative paths. Fresh hashes still matched the author freeze at the end of review.

| Path | SHA-256 |
| --- | --- |
| `app/lib/materials/experience-evidence.ts` | `33c4f603ed97d7d22d67e6e4c9b1975bbb34a6b5fd1f68f306a18c7efbf09324` |
| `app/lib/materials/personal-assertion-scopes.ts` | `743f1f2a547948e00c015d8c920b15e9c3859d511a59798b620521af0c3bc94a` |
| `app/lib/materials/self-assessment-evidence.ts` | `385cf5822faf38e13855979333c0d6d5f45cb4ab5e60ca7c34d0f375f35b3f75` |
| `tests/lib/materials/experience-evidence.test.ts` | `4bf293f1a5b17ce83c63bff22e15a7f7a7167bc9aa86fdd66325772ff5b56306` |

Baseline helper: `D:/CodexTemp/arc-edited-assessment-repaired-rspZeV/source/app/lib/materials/self-assessment-evidence.ts`, SHA-256 `cb07c50bfce3fd2554a5fb1b80ac4c672951d7994ce8605f4eb0a892a0836b70`.

Independently inspected author handoff SHA-256: `c470b8c86f53be8ed30dfd9a3293ba0574c2357078604ceac3caa07cc580b995`. Verification wrapper SHA-256: `4a2fe29b3c5c0fd9c6ce06cfd436e86e8a9ef9daa8fada44e7c87021c5f28242`.

## Exact independent Node commands and outcomes

Every Node invocation used the required wrapper. All three executions recorded **zero non-loopback denials**. The wrapper's fresh temporary environment strips credentials; no provider/model, network, deployment, migration, push, or commit was attempted. Existing scripts/results were read, never overwritten. New writes were confined to this review's ignored `work/grounded-verification/experience-evidence-quality-20261108-*` artifacts.

```text
node work/grounded-verification/run.mjs experience-evidence-quality-20261108-probe-a work/grounded-verification/experience-evidence-quality-20261108-probe.mjs
```

Exit 1; 36 probes, 33 pass and 3 fail (one finding); wrapper elapsed 220 ms; denials 0.

- Raw log SHA-256: `5cd9bc821ce36efe4ae2fcd345ed5bd1493f0111561384d030de6a8e86aa5507`.
- Wrapper outcome JSON SHA-256: `e39d67024fbbb1ce8e88b349a28976e16e6e96c09f9cbeecdd721582f19d5b62`.
- Probe results JSON SHA-256: `4e40f63c355bc03cd03e9c4a8a18046a9249ba0fff90535d9a38a8b6647d6ad9`.

```text
node work/grounded-verification/run.mjs experience-evidence-quality-20261108-focused-a node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-quality-20261108-focused.config.ts --reporter verbose
```

Exit 0; 5 suites / 1,079 tests pass, including the 171 new API tests; wrapper elapsed 6,552 ms; denials 0. The config spreads the base configuration and `base.test`, replaces `include`, and sets `maxWorkers: 1`.

- Raw log SHA-256: `7f80b125f2cb31956c24e45e408be05ba5067302beeb0f986d898552eda95b45`.
- Wrapper outcome JSON SHA-256: `090407704e0dfb09280b3ce16cc567a6942a9c28fb40ee01ef12a0bfb4cddbe6`.

```text
node work/grounded-verification/run.mjs experience-evidence-quality-20261108-preservation-a work/grounded-verification/experience-evidence-quality-20261108-preservation.mjs
```

Exit 0; 28 declaration equality checks, 18 moved declarations, all original test content preserved, four input-bound shapes / 140 successful calls; wrapper elapsed 795 ms; denials 0.

- Raw log SHA-256: `108e2bc41a9f9e4bf89e23ace5f022ee3208ee7db5c7844a8e767a0dfc9bc515`.
- Wrapper outcome JSON SHA-256: `62978826fee6aebe85f5fef6ebcd975d5e685a8349db0505ef74fa3f40c094fc`.
- Preservation results JSON SHA-256: `968b5e4a01a890efc7a23e4be073072e7a4cfb000539f68e68c94758cc30ca8c`.

Supporting artifacts:

| Artifact | SHA-256 |
| --- | --- |
| `experience-evidence-quality-20261108-probe.mjs` | `2182d41a80aa95a2b3d2d193d953dcc66c15a90bd314d3f349cd28081d04c1b6` |
| `experience-evidence-quality-20261108-focused.config.ts` | `19dd64cc5bf6b541eded977c60bb385af44528379a48c25edf53cc7407c0a72f` |
| `experience-evidence-quality-20261108-preservation.mjs` | `5e64580c800c164207e5a147116f8929c61b9ff1096cde1a9ce16057da47ea24` |

Additional read-only verification used `git rev-parse HEAD`, `git status --short`, `git diff -- app/lib/materials/self-assessment-evidence.ts`, `rg --line-number 'supportsMaterialExperience' app tests`, PowerShell file reads/hashes, and this tracked scoped whitespace check (exit 0):

```text
git diff --check -- app/lib/materials/experience-evidence.ts app/lib/materials/personal-assertion-scopes.ts app/lib/materials/self-assessment-evidence.ts tests/lib/materials/experience-evidence.test.ts
```

One exploratory `rg` call also named nonexistent `app/lib/materials/limits.ts` and returned exit 1; the actual bounds were then read from `app/contracts/documents.ts`. This was a read-only lookup failure, not a test or product failure.

## Limitations and next gate

This independent review reran five focused suites, not the author's full 13-suite selection. Type/lint results, 81-by-five dynamic hint comparisons, root workerd evidence, and the spec-review 65-case run are historical corroboration; they were not counted as fresh independent executions here. The 28-declaration comparison and selected old-behavior regressions are fresh. No current full-repository or public-release pass is claimed; the old 9,325-test result belongs to the earlier baseline. Root documentation and ignored Task 2 preparation were outside scope and were not edited.

Return the preserved counterexample to the same implementer. After the bounded quote-object repair, repeat spec review and then code-quality review sequentially against newly frozen hashes. Preserve this FAIL memo, probe, raw logs, results, and source snapshot unchanged.
