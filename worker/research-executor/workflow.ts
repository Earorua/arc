import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { z } from "zod";
import type { ExecutorEnvironment } from "./environment";
import { runResearchJob } from "./execute-job";
import { createExecutionRuntime, createMaintenanceRuntime } from "./runtime";
import { PAID_STEP_CONFIG, type ExecutionReference } from "./workflow-policy";

const UUID = z.uuid();

function validEvent(event: Readonly<WorkflowEvent<{ jobId: string }>>): string {
  const payload = event?.payload;
  if (!payload || typeof payload !== "object" || Object.getPrototypeOf(payload) !== Object.prototype
    || Object.getOwnPropertySymbols(payload).length !== 0
    || Object.keys(payload).length !== 1 || typeof payload.jobId !== "string"
    || !UUID.safeParse(payload.jobId).success || event.instanceId !== payload.jobId) {
    throw new Error("Research workflow unavailable");
  }
  return payload.jobId;
}

function unavailable(): never { throw new Error("Research workflow unavailable"); }

function boundedReference(value: unknown, expectedJobId: string): ExecutionReference {
  const states: readonly ExecutionReference["state"][] = ["recorded", "already-claimed", "closed", "unavailable"];
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Object.getOwnPropertyNames(descriptors).sort();
  if (names.join(",") !== "jobId,receiptHash,state") return unavailable();
  for (const name of names) {
    const descriptor = descriptors[name];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return unavailable();
  }
  const symbols = Object.getOwnPropertySymbols(value);
  let disposer: (() => unknown) | undefined;
  if (symbols.length === 1) {
    const symbol = symbols[0];
    const descriptor = Object.getOwnPropertyDescriptor(value, symbol);
    if (symbol !== Symbol.dispose || !descriptor || !("value" in descriptor)
      || descriptor.enumerable || !descriptor.configurable || !descriptor.writable
      || typeof descriptor.value !== "function") return unavailable();
    disposer = descriptor.value;
  } else if (symbols.length !== 0) return unavailable();
  const jobId = descriptors.jobId?.value;
  const state = descriptors.state?.value;
  const receiptHash = descriptors.receiptHash?.value;
  if (jobId !== expectedJobId || typeof state !== "string" || !states.includes(state as ExecutionReference["state"])
    || (receiptHash !== null && (typeof receiptHash !== "string" || !/^[0-9a-f]{64}$/u.test(receiptHash)))
    || (state !== "recorded" && receiptHash !== null)) return unavailable();
  const result = Object.freeze({ jobId, state: state as ExecutionReference["state"], receiptHash: receiptHash as string | null });
  const bytes = new TextEncoder().encode(JSON.stringify(result));
  if (bytes.byteLength < 1 || bytes.byteLength > 4_096) return unavailable();
  if (disposer) {
    try { disposer.call(value); }
    catch { return unavailable(); }
  }
  return result;
}

export class ResearchWorkflow extends WorkflowEntrypoint<ExecutorEnvironment, { jobId: string }> {
  async run(event: Readonly<WorkflowEvent<{ jobId: string }>>, step: WorkflowStep): Promise<ExecutionReference> {
    const jobId = validEvent(event);
    const runtime = createExecutionRuntime(this.env);
    const result = boundedReference(await step.do("research-once", PAID_STEP_CONFIG,
      () => runResearchJob(jobId, runtime)), jobId);
    if (result.state === "recorded" && result.receiptHash !== null) {
      const maintenance = createMaintenanceRuntime(this.env);
      const controller = new AbortController();
      const deliveryEnd = performance.now() + 8_000;
      const timer = setTimeout(() => controller.abort(), 8_000);
      try {
        await maintenance.delivery(jobId, controller.signal, undefined,
          () => Math.min(5_000, deliveryEnd - performance.now() - 1_000));
      } catch { /* Durable receipt recovery is handled independently. */ }
      finally { clearTimeout(timer); controller.abort(); }
    }
    return result;
  }
}
