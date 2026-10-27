# r7 integration clarification: superseded local review metadata

This clarification applies only to Task2 of the accepted r7 static integration plan. It changes neither Task1's closed-r6 reconstruction nor any previously accepted file, deployment, command, deadline, or credential handling. Existing local repair authorization covers this implementation choice; final independent SPEC and QUALITY review must assess it before Root accepts the new tools.

## Observed integration failure

The accepted input-reset SPEC r2 review retains the exact prior `outputs/local-durable-executor-20261016/terminal-stale-input-r1/spec-review-r1.json`, SHA256 `3b7a0a2b87d9df9bdfaf37b0d57350eaa857916196e1cd40ca61e6e7343962ba`. This immutable r1 report records the files as reviewed before its test-evidence correction. Its four historical file references no longer identify the current bytes at those paths:

| Historical file | r1 hash | Current accepted hash |
| --- | --- | --- |
| Terminal stale-input plan | `15765cebe83f6e8998c08618df2f2c6a49c8769bbaae0c00662233002d75d273` | `255d34f2576b71b326b926843ecc7be1cc2c1c6cd16d6ac014a5469649ca6d24` |
| evidence-manifest.json | `b37d0a84f62793ca9fcb86a9479dc35beaccaf3edf58cb12a251b82b57257cab` | `c6a9a663865c68d330a594e7e4151c8fdc2d1200491b2a50f083eb7fe494ee98` |
| IMPLEMENTATION-REPORT.md | `de9b018217f98bd8d8438af0f414d90c026447b7caea98fc59efd473dedf4563` | `99a5a9ac9ce07d80298cab772f74434b48f71c456b4c4442eb3250bb1ed0955e` |
| offline-ack-tests.ps1 | `185584e06712f2df5d3a4636db41cb3dd820d43e8cbdc69247440e6e2a3cd38f` | `f740607057b95f80b7576e183b8bbe07725f126f02d6a0b58aac155a857365ea` |

The r1 report, manifest, harness, and implementation-report history remain preserved. The final Root acceptance pins the corrected current plan, SPEC r2, QUALITY review, current manifest/harness, unchanged candidate, and the reviewed host helper. A generic recursive traversal of the obsolete r1 report's recorded paths incorrectly requires both historical and current versions to occupy one current pathname. The initial `HASH_CHANGED` failure must remain recorded.

## Bounded handling in the new r7 context

The new r7 context may treat only the exact r1 report at the exact path and hash above as historical review metadata: verify its complete bytes, preserve the report, and do not reinterpret its nested historical reviewed-file references as current execution dependencies. This is an explicit additional historical-review boundary for r7, not a claim that the original Task1 graph has only one boundary after integration. Task1's sole original r4 snapshot rule remains unchanged.

No caller-supplied flag, path pattern, catch-and-ignore branch, missing-file fallback, or generic prior-review exception may grant this treatment. All current dependencies remain recursively verified: Root input-reset acceptance, final SPEC r2 and QUALITY, current plan and manifest/harness/report, original entry, current candidate, helper, actual attended result and its distinct Root acceptance. The prior report is historical provenance only and supplies no present readiness or new operational authority. It cannot replace any current proof.

New tests must reject a changed historical-report hash or path, unauthorized graph-exclusion flags, changed current candidate/plan/harness/helper/result pins, and synthetic or substituted host evidence. The exact original report and consumed source histories must remain byte-identical. Record the additional boundary explicitly in new static metadata and the implementation report, bind this clarification as an immutable input, and include the design choice in the independent SPEC and QUALITY reviews. The existing budgets, original clocks, deadlines, no-retry behavior, and zero Provider allowance remain required.
