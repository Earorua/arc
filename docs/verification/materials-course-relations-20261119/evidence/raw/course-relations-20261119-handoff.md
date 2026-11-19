# Task A frozen handoff

Status: ready for independent review. Mapping version: 2026.11.7. Source hashes and causal details: [handoff JSON](./course-relations-20261119-handoff.json).

The repair separates literal course names, bounded contextual relationships, and content-backed task coverage. It preserves actor/denial/practice boundaries; SQL aggregation/CTE/window/null/date/transform tasks, TS async/formatter coverage, CSS, Figma and log-parser implementation remain unprovided. Candidate ambiguity can coexist with narrow union coverage; the English preview now explains that selecting one candidate recomputes coverage. Only two existing-content support IDs were added, plus the actual token-fix rubric leaf. Course data and independent references were untouched.

Validation: 13 affected files produced 261 passes and 3 failures; the three causal repairs passed in the failure-only 50-check run. One additional token-leaf invalidation case observed RED/GREEN. Types and modified-file lint pass; raw initial type failures are preserved because workspace scratch and relocated archive copies are not executable source. The exact final type config is [course-relations-20261119-tsconfig.json](./course-relations-20261119-tsconfig.json). All verification commands used the credential-stripping/outbound-blocking wrapper with unique labels.

Root owns the fixed30 diagnostic, independent spec/quality reviews, repository type/lint config repair, and Task B native-source binding. No current full-product/native/model/release acceptance is claimed. Source remains frozen; no commit or external action was taken.
