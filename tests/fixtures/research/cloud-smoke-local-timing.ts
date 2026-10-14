import type { SmokeTiming } from "../../../worker/research-executor-smoke/timing";
export const SMOKE_TIMING: SmokeTiming = Object.freeze({
  long: Object.freeze({ headersMs: 50, bodyMs: 25 }),
  "after-r2": Object.freeze({ headersMs: 0, bodyMs: 0 }),
  "after-d1": Object.freeze({ headersMs: 0, bodyMs: 0 }),
});
