# Quality account-notice focus check — 2026-11-09

## Failure investigated

- Application baseline: `9216276601659afdb5ec223a7041cf4997e8080b` on `master`.
- [Failed Quality run](https://github.com/Earorua/arc/actions/runs/42504746222): one accessibility test timed out after 10 seconds; 6,807 tests passed and 84 were skipped.
- Failing test: `announces verified results as status, omits callback email, and restores focus on dismiss` in `tests/components/accessibility-contracts.test.tsx`.
- The latest merge changed documentation only. The original test passed in isolated local runs, including repeated runs with focus-event diagnostics. The historical CI timeout was not reproduced locally, so the exact event ordering in that run is not established.

## Change

The verified callback mounts `AccountLinkPanel`, whose mount effect focuses its heading. Waiting only for the notice text does not explicitly wait for that focus effect. The test now waits for the heading to have focus before moving focus to the dismiss button and sending Space, matching the adjacent account-link accessibility test.

The nested 10-second disappearance timeout was also removed: it equalled the outer test deadline and could hide the useful failed assertion behind a generic test timeout. The normal assertion timeout now applies.

Status semantics, callback-email privacy, keyboard dismissal, and exact focus restoration assertions remain in place. Application code and CI checks are unchanged. This removes an identified timing dependency; it does not claim that the historical run's focus sequence was captured.

## Validation

- Changed test: 100 consecutive local executions passed using temporary Vitest `repeats: 99`; the repetition option and diagnostic logging were removed afterward.
- Final accessibility, account-menu, and account-link-panel files: 61 tests passed.
- Independent review: no actionable findings; all 24 accessibility tests passed in the reviewer's run.
- `npm run test:brand`: passed (1 test).
- `npm run lint`: exit 0, with 4 existing unused-variable warnings in unrelated tests.
- `npm run build`: passed.
- `node --test tests/rendered-html.test.mjs`: passed (5 tests).
- The diagnostic baseline full run at the host's default concurrency timed out in the unrelated 2 MB SQLite raw-array assertion (`tests/server/auth-migration-runtime.test.ts:128`); 6,909 tests passed. The host exposes 32 CPUs.
- Final full run: `node node_modules/vitest/vitest.mjs run --maxWorkers=4` passed all 287 files and 6,910 tests in 314.74 seconds, including the raw-array assertion. The worker limit applies only to this local command; repository configuration is unchanged.
