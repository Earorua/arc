import { createExecutorBridgeHandler } from "./http-routes";
import type { ExecutorEnvironment } from "./environment";
import { runExecutorMaintenance } from "./maintenance";
import { readExecutorMaintenanceEnabled } from "./maintenance-policy";
import { createHttpRuntime, createMaintenanceRuntime } from "./runtime";

export { ResearchWorkflow } from "./workflow";

function unavailable() {
  return new Response("{}", { status: 503,
    headers: { "cache-control": "no-store", "content-type": "application/json" } });
}

const executorWorker = {
  async fetch(request: Request, environment: ExecutorEnvironment): Promise<Response> {
    try { return await createExecutorBridgeHandler(createHttpRuntime(environment))(request); }
    catch { return unavailable(); }
  },
  scheduled(_event: ScheduledController, environment: ExecutorEnvironment, context: ExecutionContext): void {
    if (!readExecutorMaintenanceEnabled(environment)) return;
    context.waitUntil(runExecutorMaintenance(createMaintenanceRuntime(environment)));
  },
};

export default executorWorker;
