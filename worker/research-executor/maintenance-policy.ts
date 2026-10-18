import type { ExecutorEnvironment } from "./environment";

export function readExecutorMaintenanceEnabled(
  environment: Pick<ExecutorEnvironment, "ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED">,
): boolean {
  const value = environment.ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED;
  if (value === undefined || value === "true") return true;
  if (value === "false") return false;
  throw new Error("Executor maintenance configuration unavailable");
}
