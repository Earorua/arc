import { z } from "zod";
import { readBridgeBody, decodeBridgeJson } from "../../../app/server/research/executor/body";
import smokeWorker from "../../../worker/research-executor-smoke/executor-entry";
import type { SmokeExecutorEnvironment } from "../../../worker/research-executor-smoke/environment";
import { SCENARIOS } from "../../../worker/research-executor-smoke/scenarios";
export { ResearchWorkflow } from "../../../worker/research-executor-smoke/executor-entry";

const selection = z.object({ scenarioId: z.enum(["long", "after-r2", "after-d1"]) }).strict();
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "cache-control": "no-store" } });
const localWorker = {
  scheduled: smokeWorker.scheduled.bind(smokeWorker),
  async fetch(request: Request, environment: SmokeExecutorEnvironment): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/__local/cron" && url.pathname !== "/__local/workflow-status") return smokeWorker.fetch(request, environment);
    if (request.method !== "POST" || url.search || request.headers.has("origin")) return json({}, 404);
    let body: unknown;
    try {
      const bytes = await readBridgeBody(request, { maxBytes: 4_096, timeoutMs: 1_000 });
      body = bytes.byteLength ? decodeBridgeJson(bytes) : {};
    } catch { return json({}, 400); }
    if (url.pathname === "/__local/workflow-status") {
      const parsed = selection.safeParse(body);
      if (!parsed.success) return json({}, 400);
      const scenario = SCENARIOS.find(s => s.id === parsed.data.scenarioId)!;
      try {
        const instance = await environment.RESEARCH_WORKFLOW.get(scenario.jobId);
        return json(await instance.status());
      } catch { return json({}, 503); }
    }
    if (!z.object({}).strict().safeParse(body).success) return json({}, 400);
    const pending: Promise<unknown>[] = [];
    try {
      smokeWorker.scheduled({ scheduledTime: Date.now(), cron: "* * * * *", noRetry() {} }, environment,
        { waitUntil(promise: Promise<unknown>) { pending.push(promise); } } as ExecutionContext);
      await Promise.all(pending);
      return json({ status: "completed" });
    } catch { await Promise.allSettled(pending); return json({}, 503); }
  },
};
export default localWorker;
