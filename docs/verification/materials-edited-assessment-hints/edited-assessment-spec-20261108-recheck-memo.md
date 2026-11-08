# Task 2 independent spec recheck — CHANGES REQUESTED

Reviewed 2026-11-08 in `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`.

## Verdict and concrete finding

**[P2] Preserve dotted technical names when locating the current action's plan predicate — `app/lib/materials/self-assessment-evidence.ts:61` (predicate at line 62).**

The repair truncates the action remainder at every ASCII period through `split(/[，,；;。.!?！？]/u, 1)`. In `按指导完成 React.js 组件练习是我下周的计划。`, the value checked for a plan becomes only ` React`; the actual `是我下周的计划` predicate is discarded. The same happens with `完成 React.js 组件练习的计划尚未执行。`. These are the explicitly authorized own-action nominal future-plan cases with an accepted technical label, not a new grammar family.

The real extraction fixture accepts `React.js` as the original skill label and gives the actual prior personal assertion `I tested React.js under supervision.` a guided hint. Editing it into either nominal plan incorrectly preserves that original hint.

All six shared/worker/retention observations below are failures on the frozen repair candidate:

| Qualifier | Edited action | Required | Observed shared / worker / retained hints |
| --- | --- | --- | --- |
| 按指导 | 完成 React.js 组件练习是我下周的计划。 | false / null / 0 | true / guided / 1 |
| 按照指导 | 完成 React.js 组件练习是我下周的计划。 | false / null / 0 | true / guided / 1 |
| 在导师指导下 | 完成 React.js 组件练习是我下周的计划。 | false / null / 0 | true / guided / 1 |
| 按指导 | 完成 React.js 组件练习的计划尚未执行。 | false / null / 0 | true / guided / 1 |
| 按照指导 | 完成 React.js 组件练习的计划尚未执行。 | false / null / 0 | true / guided / 1 |
| 在导师指导下 | 完成 React.js 组件练习的计划尚未执行。 | false / null / 0 | true / guided / 1 |

The independent real `MaterialTextPanel` → HTTP route → ReviewService → SQLite D1 adapter flow reproduced both `按指导` nominal-plan examples. For each one, the button remained visible immediately while the save was gated, the request submitted one original hint, save revision 1 retained one hint, and the button reappeared after remount/reload. Source text and sourceRef were correct and no adoption callback ran. This is retained unsupported advice, not failed persistence or automatic adoption.

The bounded repair should distinguish a period inside an accepted technical token from an assertion-ending boundary, and add the two dotted-name nominal-plan cases plus valid dotted-name controls. It should continue to stop at genuinely separate clauses so a later unrelated plan or denial cannot cancel completed practice. No broad parser redesign is requested.

This candidate is **not spec-approved**; the finding must be repaired and independently rechecked before the quality recheck proceeds.

## What passed and remaining contract review

- The original 18 author/root-style SQL controls (three qualifiers × inability, two own-action plans, and three completed-action controls) pass freshly. The intended SQL repair works.
- For `React.js`, `完成不了` correctly drops the hint with all three qualifiers. Completed `React.js` practice followed by recording results, a future CSS-reading clause, or a denied CSS-page action retains it with all three qualifiers.
- The real panel negative-complement control drops the React.js button/request/saved hint immediately and after reload. Its valid completed React.js + later unrelated CSS-plan control retains the authentic hint; both preserve original source data and invoke no adoption callback.
- All **752 tracked tests in six suites** pass freshly, including identity/level forgery rejection, prior-membership non-restoration, trusted projection, legacy untouched-summary boundaries, per-hint scopes, source/provenance/owner/revision/atomic rollback guards, immutable extraction and earlier confirmation data, immediate controlled UI filtering, and the unchanged original materials AI-flow fixture.
- The four integration production files are byte-identical to the original reviewed identity. Inspection against checkpoint `32528d5` confirms that this repair changes only the shared evidence production module plus its five test files. Optional projection, exact retained membership, canonical original identity, original levels and original object preservation remain intact; there is no hint minting or automatic assessment write.
- The shared delta uses the existing practice-action vocabulary, preserves short-qualifier leading-action enforcement and longer qualifier precedence, and leaves the surrounding actor/quote/denial/scope rules in place. No separate unrequested scope-expansion finding is raised. The concrete punctuation truncation above leaves the authorized own-action plan requirement incomplete.

## Candidate identity and read-only review

- Repair checkpoint: `32528d541215aa407d6a26b28b26d641fee64bf5`.
- HEAD at beginning and end: `0f066875af76294bb5f1fe7a27df393ef927cb68` (documentation only after checkpoint).
- Frozen shared module: `8a44bd187cb5f2bf1f16f9eeb04b5039f237cedd6f65f12ca513ecd0f7da8768`.
- Author repair handoff independently hashed to `64ae4b471a8d9560385f8a217ac3e1f68aa1e6f9bddeb97b8beed3b706d1b078`.
- Original quality memo remains `4088b90ede3416c1ffeccf2ce6a226ac7239211dac30f9d2a348db747011fc91`.
- Original spec memo remains unchanged at `23408394201eaf4ffc8fb2fad9ac03697115fb8b8b685928906ed2877dfa5f1e`; its earlier 681-case PASS is not approval of this repair identity.
- All ten Task 2 code/test hashes matched the supplied freeze both before and after the run. No tracked file was edited and no existing evidence artifact was overwritten. `git diff --check` passed.

| File | Frozen SHA-256 |
| --- | --- |
| `app/lib/materials/skill-labels.ts` | `d2a5c3c69c1bd671a30b9597bcec44435baa21b3ce7aedd7664045217118bad0` |
| `app/lib/materials/self-assessment-evidence.ts` | `8a44bd187cb5f2bf1f16f9eeb04b5039f237cedd6f65f12ca513ecd0f7da8768` |
| `app/server/documents/review-service.ts` | `1dfafeaa80382a9a53dcf4a063c6585fad94c9dd52896e0d56b3eb8ded799700` |
| `app/components/materials/material-confirmation.tsx` | `085d355db29c4fac069bcad3f353f5de40298d2a53135aff66c0373cb79a81c4` |
| `app/components/materials/material-text-panel.tsx` | `b832754373e432f348f08f44234b39b7f5dfb39baba5e874b251d8a3f157bcf5` |
| `tests/lib/materials/retained-assessment-hints.test.ts` | `a213ef382d2164171f65982cc628b06ec234afa43e40bccbbc8ca15c0d7d8e79` |
| `tests/lib/materials/self-assessment-evidence.test.ts` | `e8909b80059cc944917e3241d60f08c564cd00cf450ff004a56d54ce6dac9001` |
| `tests/server/document-review-draft.test.ts` | `df91d91ed0ecb9ee78e0076a318024b993ca98df8bd519b7672d19d38d46bd0a` |
| `tests/server/document-source-review-evidence.test.ts` | `096d5024c341d4b5ad22f856e1e067c3df5d2c9979b52393264590c7e7bf9577` |
| `tests/components/material-confirmation-source.test.tsx` | `673152ad915c83f5d82d60384117167a2bce5d3e6cad519b8eb76cd36431c681` |

## Fresh verification and durable evidence

Only this fresh Node execution was run in this recheck, through the required wrapper:

```powershell
node work/grounded-verification/run.mjs edited-assessment-spec-recheck-20261108-focused-01 node_modules/vitest/vitest.mjs run --maxWorkers=1 --config work/grounded-verification/edited-assessment-spec-recheck-20261108-focused.config.ts
```

Result: **8 failed / 784 passed, 792 total in seven suites; exit 1; 13,088 ms; nonLoopbackDenials 0.**

- Six pure failures and two real panel/save/reload failures establish one P2 finding. Their 26 soft-assertion failures are grouped into those eight failed tests and are not separate findings.
- Independent probes: 40 total, 32 passed / 8 failed. Pure matrix: two labels × three qualifiers × six action forms = 36; real panel flows: four.
- Tracked suites: retained hints 74; shared evidence 115; review drafts 80; source review evidence 421; confirmation source UI 49; original materials AI flow 13. All 752 passed.
- The config explicitly replaces `test.include` after spreading the base config; no merge-array concatenation. Default jsdom is retained except existing node-declared server tests.
- Each real panel flow used one synthetic provider response and zero real model calls. Source provider response, transport and scheduling are in-memory fixtures; the panel, route, service and SQLite-backed persistence are real repository code. No real browser or native workerd was run.

| Artifact under `work/grounded-verification/` | SHA-256 |
| --- | --- |
| `edited-assessment-spec-recheck-20261108-focused-01.log` | `98f8b44f8858c0af2b99f23024b515a36d927bf2293df626f152a2948e0f2a3e` |
| `edited-assessment-spec-recheck-20261108-boundary-results.json` | `dd30cbcbde4a63e437fc0d674c55a39b44984d6cf84b9ad2cfb2b90ff2fff485` |
| `edited-assessment-spec-recheck-20261108-boundaries.test.tsx` | `2529953f2de7cdb4bf1308492509e6a1c24f5848047aa227200fcac7d7b897c5` |
| `edited-assessment-spec-recheck-20261108-focused.config.ts` | `9be8de56e61bb26a0613593784c58a1e194d544626e1eae1ca82ffd0fa4bd0dc` |

The wrapper metadata file is preserved beside its log. The independent probe writes a unique results file with `flag: "wx"`; future reruns must copy it and change the output path rather than overwrite this RED evidence.

## Limits and handoff

No commit, push, migration, deployment, external network/model call or subagent was performed. No full-repository tests/types/lint/build, native workerd/D1/R2, browser session, broad new language grammar sweep, or Task 1 pure-move verification was performed. Root's first full checks and snapshot results remain intermediate; they do not close this concrete failure. The root was notified promptly after the fresh reproduction. Root owns a bounded repair and replacement frozen identity, followed by renewed spec and quality review and final gates.
