import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { ExecutorEnvironment } from "../../../worker/research-executor/environment";
import { ResearchWorkflow } from "../../../worker/research-executor/workflow";
import { PAID_STEP_CONFIG } from "../../../worker/research-executor/workflow-policy";

export { ResearchWorkflow };

type RuntimeFixtureEnvironment = ExecutorEnvironment & Readonly<{
  ZERO_RETRY_PROBE: Workflow<Record<string, never>>;
}>;

export class ZeroRetryProbe extends WorkflowEntrypoint<RuntimeFixtureEnvironment, Record<string, never>> {
  async run(_event: Readonly<WorkflowEvent<Record<string, never>>>, step: WorkflowStep): Promise<never> {
    return step.do("counter-then-fail", PAID_STEP_CONFIG, async () => {
      await this.env.EXECUTOR_DB.prepare(
        "UPDATE test_counter SET value = value + 1 WHERE id = 1",
      ).run();
      throw new Error("injected-after-effect");
    });
  }
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const value: unknown = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid fixture request");
  return value as Record<string, unknown>;
}

const runtimeFixture = {
  async fetch(request: Request, environment: RuntimeFixtureEnvironment): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || (url.pathname !== "/probe/create" && url.pathname !== "/probe/status")) {
      return new Response("not found", { status: 404 });
    }
    try {
      const body = await jsonBody(request);
      const kind = body.kind;
      const id = body.id;
      if ((kind !== "research" && kind !== "zero") || typeof id !== "string") throw new Error("invalid fixture request");
      if (url.pathname === "/probe/create") {
        let createAcknowledged = true;
        try {
          if (kind === "research") await environment.RESEARCH_WORKFLOW.create({ id, params: { jobId: id } });
          else await environment.ZERO_RETRY_PROBE.create({ id, params: {} });
        } catch {
          createAcknowledged = false;
        }
        const workflow = kind === "research" ? environment.RESEARCH_WORKFLOW : environment.ZERO_RETRY_PROBE;
        const instance = await workflow.get(id);
        return Response.json({ createAcknowledged, id: instance.id, status: await instance.status() });
      }
      const workflow = kind === "research" ? environment.RESEARCH_WORKFLOW : environment.ZERO_RETRY_PROBE;
      const instance = await workflow.get(id);
      return Response.json({ id: instance.id, status: await instance.status() });
    } catch {
      return Response.json({ error: "invalid fixture request" }, { status: 400 });
    }
  },
};

export default runtimeFixture;
