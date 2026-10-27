import type { SmokeScenarioId } from "./scenarios";
export type SmokeTiming = Readonly<Record<SmokeScenarioId, Readonly<{ headersMs: number; bodyMs: number }>>>;
export const SMOKE_TIMING: SmokeTiming = Object.freeze({
  long: Object.freeze({ headersMs: 1_140_000, bodyMs: 30_000 }),
  "after-r2": Object.freeze({ headersMs: 10, bodyMs: 10 }),
  "after-d1": Object.freeze({ headersMs: 10, bodyMs: 10 }),
});
