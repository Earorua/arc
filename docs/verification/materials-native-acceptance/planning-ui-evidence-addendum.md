# Supplemental UI evidence and citation correction

Date: 2026-11-19. One focused observation passed against application commit `47b0e0a`. The original native matrix, its inputs, collector/checker and all original result bytes remain unchanged.

The five previously accepted cases in `material-adoption-persistence.test.tsx` prove optional adoption, explicit individual choices, persistence and reset. They do **not** directly assert absence of the bulk-independent control. The native collector's broad reuse wording must not be read as evidence of that particular UI assertion. Its actual `mode:batch` contract rejection and unchanged native-state evidence remain valid.

To close this specific gap, a probe derives the existing real `AdaptiveSetupFlow` / `MaterialSetupProvider` fixture without editing the accepted test file. One case observes bulk-independent buttons before selection, selects a synthetic resume, verifies that all those buttons disappear (including hidden disclosure contents), selects the individual TypeScript independent radio, and verifies that unrelated levels remain unseen and generation has not been invoked. Document transport is the declared synthetic fixture; actual provider state and rendered setup controls are exercised.

Final command used the existing outbound-blocking wrapper and an exact test-file argument:

```text
node work/grounded-verification/run.mjs native-planning-20261119-bulk-ui-02 node_modules/vitest/vitest.mjs run work/grounded-verification/native-planning-20261119-bulk-ui.test.tsx --config work/grounded-verification/native-planning-20261119-bulk-ui.config.ts
```

Result: **1 file / 1 test passed**, exit 0, zero non-loopback denials. This is a new UI observation, not another native matrix run or a rerun of all five historical cases.

An initial attempt used `mergeConfig`, which concatenated the base include array and began unrelated tests. It was interrupted as soon as the expanded scope was noticed; no completed suite result is claimed. The corrected configuration explicitly replaces `test.include`, and the final command also filters the exact file. The initial configuration, partial log and interruption record are preserved alongside the final source/configuration and result in the [supplement manifest](native-evidence/ui-supplement/manifest.json).

The supplement binds the observed application files and original fixture to their current hashes. It supplies only the missing bulk-control UI evidence. No product behavior, immutable reference, native expected assertion or original run artifact was changed to obtain a pass.
