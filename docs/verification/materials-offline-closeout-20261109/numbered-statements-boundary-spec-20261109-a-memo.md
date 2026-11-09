# Task 1 independent specification review

Verdict: **PASS** for the three frozen Task 1 files. No actionable specification findings.

Reviewed branch `codex/materials-replan-recovery-20261106`, HEAD `1f65e4a483399db8fb6c143e076f3d7523675399`. Read both required source indexes and the actual Task 1 plan, diff, source, tests, and saved evidence. No tracked files were edited by this reviewer.

- `source-statements.ts:30-49` matches the specified helper: cloned Map; existing `listPrefix`; only 1–3 ASCII/fullwidth digits with an ASCII dot; physical same-line body; existing body end reused; isolated ordinals removed only in the returned map. Original grammar and function code remain unchanged.
- `source-review-evidence.ts:69-71` delegates exactly to the helper with `groundedStatementBoundaries(text)`. The remainder of the old file is unchanged except its required import. Provider/site wiring is deliberately absent.
- `material-numbered-statements.test.ts:5-134` covers full/body coordinates, UTF-16, indentation/CRLF, qualifiers, Chinese, internal technical dots, URL, adjacent entries, orphan rejection, unsupported syntax, cloning, absent body authority, and the separate leading `.NET` limitation.

The one independent offline probe recorded 18 boundary observations, all passing. Its checks also validated 33 source/snapshot/evidence/log hashes, the raw RED 23 failures / 14 controls, GREEN 37, related GREEN 794, and saved equality of 80 old coordinate maps across 40 fixtures. Legacy source content comparisons passed. All three Task 1 hashes still match freeze-a exactly.

The raw probe retains `FAIL`, exit 1, because two overly broad guards expected the entire checkout status/path list to equal freeze-a. During review, root added the offline-closeout plan and a Task 3 scheduling paragraph. Root confirmed both documentation changes are intentional and outside this three-file scope; the actual diff leaves Task 1 requirements unchanged. Those path guards are not product failures. The raw log/results are preserved without relabeling; the separate review result records this scoped PASS. Non-loopback denials: 0. No test rerun, model call, migration, deployment, commit, or push.

This verdict is specification approval only. Quality review, Task 2 integration, and the combined final acceptance gate remain subsequent work; `.NET` is not claimed complete.
