import productionWorker from "../research-executor/index";
import type { ExecutorEnvironment } from "../research-executor/environment";
import { readExecutorMaintenanceEnabled } from "../research-executor/maintenance-policy";
import { D1SmokeEvidence } from "./evidence";
export { ResearchWorkflow } from "../research-executor/workflow";

/** Observation is supplementary: it cannot prevent or turn failure into successful maintenance. */
async function observe(operation: () => Promise<void>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve().then(operation).then(() => true, () => false),
      new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 1_000); })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

const smokeWorker = {
  fetch: productionWorker.fetch.bind(productionWorker),
  scheduled(event: ScheduledController, environment: ExecutorEnvironment, context: ExecutionContext): void {
    if (!readExecutorMaintenanceEnabled(environment)) return;
    const eventId = `cron-${event.scheduledTime}`;
    let evidence: D1SmokeEvidence | undefined;
    const started = observe(async () => {
      evidence = new D1SmokeEvidence(environment.EXECUTOR_DB);
      await evidence.recordCron(eventId, "start", Date.now());
    });
    const capture = new Proxy(context, {
      get(target, property) {
        if (property !== "waitUntil") {
          const value: unknown = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        }
        return (promise: Promise<unknown>) => {
          // Attach both handlers immediately, including while the observer is unavailable.
          const settled = Promise.resolve(promise).then(value => ({ ok: true as const, value }),
            error => ({ ok: false as const, error }));
          context.waitUntil((async () => {
            const seenStart = await started;
            const result = await settled;
            if (seenStart) await observe(() => evidence!.recordCron(eventId, "end", Date.now(), result.ok ? "ok" : "error"));
            if (!result.ok) throw result.error;
            return result.value;
          })());
        };
      },
    });
    try { productionWorker.scheduled(event, environment, capture); }
    catch (error) {
      context.waitUntil(started.then(async seen => {
        if (seen) await observe(() => evidence!.recordCron(eventId, "end", Date.now(), "error"));
      }));
      throw error;
    }
  },
};
export default smokeWorker;
