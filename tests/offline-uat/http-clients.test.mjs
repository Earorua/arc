import { test } from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { createHarnessServer } from "./server.mjs";

function send(origin, path, init = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(new URL(path, origin), { method: init.method ?? "GET", headers: Object.fromEntries(new Headers(init.headers)), signal: init.signal }, (incoming) => {
      const chunks = [];
      incoming.on("data", (chunk) => chunks.push(chunk));
      incoming.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode, headers: incoming.headers })));
    });
    request.on("error", reject); request.end(init.body);
  });
}
test("actual HTTP clients recognize a fresh goal absence and activate/build a researched owner", async (context) => {
  const server = await createHarnessServer({ port: 4181 });
  const traces = [];
  try {
    const html = await (await send(server.origin, "/setup")).text();
    const nonce = /name="arc-uat-control" content="([a-f0-9]+)"/u.exec(html)?.[1]; assert.ok(nonce);
    const entryModule = await (await send(server.origin, "/tests/offline-uat/main.tsx")).text();
    const dependency = /from "([^"]+\/deps\/react\.js[^"]*)"/u.exec(entryModule)?.[1]; assert.ok(dependency);
    assert.equal((await send(server.origin, dependency)).status, 200);
    const fetch = async (input, init = {}) => {
      const path = input instanceof Request ? new URL(input.url).pathname : String(input);
      const headers = new Headers(init.headers);
      headers.set("origin", server.origin); headers.set("sec-fetch-site", "same-origin");
      if (init.method !== "GET") headers.set("x-arc-uat-control", nonce);
      const response = await send(server.origin, path, { ...init, headers });
      let code = null;
      if (!response.ok) { const body = await response.clone().json().catch(() => null); code = body?.error?.code ?? "invalid-envelope"; }
      traces.push({ method: init.method ?? "GET", path, status: response.status, code });
      return response;
    };
    const { createPlanningClient } = await server.vite.ssrLoadModule("/app/lib/planning-client.ts");
    const { createArcCloudClient, isArcApiError } = await server.vite.ssrLoadModule("/app/lib/cloud-client.ts");
    const { createResearchClient } = await server.vite.ssrLoadModule("/app/lib/research-client.ts");
    const { offlinePlanningRequest } = await server.vite.ssrLoadModule("/tests/offline-uat/planning-fixture.ts");
    const planning = createPlanningClient({ fetch }); const cloud = createArcCloudClient({ fetch });
    assert.equal(await cloud.loadWorkspace(), null);
    await assert.rejects(planning.loadWorkspace(), (error) => isArcApiError(error) && error.status === 404 && error.code === "NOT_FOUND" && error.action === undefined);
    const result = await createResearchClient({ fetch }).startResearch({ role: "Data Product Manager", locale: "en-US", mutationId: "offline-http-research" }, new AbortController().signal);
    assert.equal(result.run.state, "ready"); assert.ok(result.run.planningData);
    const setup = { roleId: result.run.planningData.blueprint.name, level: "beginner", weeklyMinutes: 420, targetWeeks: 18 };
    const activated = await cloud.importLocal({ setup, completedUnitIds: [], proofs: [] }, "reject", "offline-http-activation", new AbortController().signal, "research-setup");
    assert.equal(activated.status, "imported");
    assert.equal((await planning.loadWorkspace()).workspace, null);
    const generated = await planning.generate(offlinePlanningRequest(result.run.planningData.blueprint, { source: "research", researchRunId: result.run.id }, "offline-http-generate"));
    assert.ok(generated.result.workspace.activePlanVersionId);
  } finally { console.log("Offline HTTP categories:", JSON.stringify(traces)); context.diagnostic("No response bodies or credentials are logged."); await server.close(); }
});
