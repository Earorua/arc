# Course task coverage specification review

Reviewed 2026-11-19 at `850b6be03a1da60eb8ee37d530f05a1b51af10ba`, including the unstaged Task 3 product patch and its focused tests. This was an offline, read-only product review; no tests were rerun.

Result: **PASS for the bounded Task 3 specification after the narrow repair**. No open specification findings remain.

## Resolved finding

**P2: Preserve soft-wrapped modifiers in the evaluated task scope — resolved.** The initial patch split multi-label facts on every newline before selecting a term's task scope. For text `Build a labeled semantic HTML form\nwith a WebGPU simulation. Use SQL.` with labels `HTML` and `SQL`, this incorrectly reduced the HTML scope to the taught task and reported `full` with no remaining scope. The reviewed repair removes newline from that split, retaining the unsupported modifier in the evaluated sentence. The supported semantic-form task remains visible with `partial` and `unassessed-scope`. The repair changes no other scope grammar and adds only the exact regression. This concerns a modifier of the evaluated task, not unrelated unlabelled sibling tasks or a general language parser.

## Checked requirements

- All nine compact support IDs resolve to exact quoted current registry leaves, including the additional TypeScript narrowing, React state, semantic-form and signal-selection evidence. Runtime verification checks the current registry and closes coverage for Research or incompatible/invalid catalogs.
- Coverage is optional, separate from topic mapping and limited to retained terms. Names, aliases and manual selections alone do not establish full task coverage. Omitted/non-learning facts remain not applicable; ambiguous course alternatives retain a choice limitation.
- The reviewed explicit compound-topic rule preserves each course relation's source word before the existing actor/polarity practice check. Coverage metadata is not consumed by practice, ability adoption or primary-JD authority decisions.
- Grouping includes coverage metadata. Existing mapper API shapes, old preview records, prior alias versions and the 256 KiB preview bound remain intact. Mapping and explanation semantics have new versions; frozen evaluation assets are not runtime imports or modified expected answers.
- The UI identifies full coverage as limited to the recognized narrow task, displays support and remaining scope separately from topic correspondence, and retains raw facts and historical-preview limitations.

## Reused verification evidence

`work/grounded-verification/course-coverage-20261119-final.log` records 193 passed tests in eight suites for the base patch. Its SHA-256 was independently checked against the receipt: `5ca32de097788e964dfc4ea31188f96ab60b6acb239b666ae5e1c105aeafc542`. The lint-final and types-final receipts both record exit 0 with empty logs and no non-loopback denials.

The narrow follow-up reused that base evidence and inspected `course-coverage-20261119-wrap-{red,green,lint}.{log,json}`. RED records the exact regression failing because actual coverage was `full` with `remaining: null`; GREEN records all nine course-coverage tests passing after the repair; lint records exit 0. Their log hashes match their receipts: RED `98c9a3c12a8580d7cc11de65d023105c4791d21818ff25240e79c4677279234f`, GREEN `95f54e147fa275f3b192fa34f1f3428d232e026e7b216c2b367235f9ab8c1316`, and empty lint `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. All three receipts record no non-loopback denials. These are recorded implementation runs, not fresh review runs; no duplicate reviewer test or broader probe was added.
