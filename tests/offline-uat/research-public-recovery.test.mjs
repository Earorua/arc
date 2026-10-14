import { test } from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { existsSync } from "node:fs";
import { createHarnessServer } from "./server.mjs";

function send(origin, path, init = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(new URL(path, origin), {
      method: init.method ?? "GET",
      headers: Object.fromEntries(new Headers(init.headers)),
      signal: init.signal,
    }, (incoming) => {
      const chunks = [];
      incoming.on("data", (chunk) => chunks.push(chunk));
      incoming.on("end", () => resolve(new Response(Buffer.concat(chunks), {
        status: incoming.statusCode,
        headers: incoming.headers,
      })));
    });
    request.on("error", reject);
    request.end(init.body);
  });
}

test("public durable HTTP recovery retains one independently executed job across graph and R2 reopenings", { timeout: 60_000 }, async (context) => {
  const originalFetch = globalThis.fetch;
  const server = await createHarnessServer({ port: 4183, composition: "public-durable" });
  try {
    const html = await (await send(server.origin, "/setup")).text();
    const nonce = /name="arc-uat-control" content="([a-f0-9]+)"/u.exec(html)?.[1];
    assert.ok(nonce);
    const headers = (write = false) => ({ origin: server.origin, "sec-fetch-site": "same-origin",
      ...(write ? { "content-type": "application/json", "x-arc-uat-control": nonce } : {}) });
    const state = async () => (await send(server.origin, "/__uat/state", { headers: headers() })).json();
    const control = async input => {
      const response = await send(server.origin, "/__uat/control", { method: "POST", headers: headers(true), body: JSON.stringify(input) });
      assert.equal(response.status, 200); return response.json();
    };
    assert.equal((await state()).composition, "public-durable");
    assert.equal((await state()).counts.research_runs, 0);
    for (const path of ["/tests/offline-uat/research-public-composition.ts", "/tests/helpers/research-public-fixture.ts", "/app/server/research/service-factory.ts", "/@id/C:/Windows/win.ini"])
      assert.equal((await send(server.origin, path)).status, 404);
    for (const input of [{ action: "prestart", stage: "researching" }, { action: "configure", mode: "repair" }, { action: "workflow", runId: "not-created" }, { action: "cron", unexpected: true }]) {
      const response = await send(server.origin, "/__uat/control", { method: "POST", headers: headers(true), body: JSON.stringify(input) });
      assert.equal(response.status, 400);
    }
    assert.equal((await send(server.origin, "/__uat/control", { method: "POST", headers: { ...headers(true), "x-arc-uat-control": "wrong" }, body: '{"action":"reopen"}' })).status, 403);
    let loss = true;
    let accepted;
    const calls = [];
    const fetch = async (input, init = {}) => {
      const path = input instanceof Request ? new URL(input.url).pathname : String(input);
      calls.push([init.method ?? "GET", path]);
      const response = await send(server.origin, path, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), ...headers(init.method === "POST") } });
      if (loss && path === "/api/intelligence/research") {
        loss = false; assert.equal(response.status, 200); accepted = await response.json();
        assert.equal(accepted.run.state, "queued"); assert.equal(accepted.run.backgroundAccepted, true);
        throw new TypeError("synthetic completed public response discarded");
      }
      return response;
    };
    const { createResearchClient, ResearchClientError } = await server.vite.ssrLoadModule("/app/lib/research-client.ts");
    const client = createResearchClient({ fetch });
    const recovery = { kind: "start", role: "Data Product Manager", locale: "en-US", mutationId: "durable-http-lost-response" };
    await assert.rejects(client.startResearch({ role: recovery.role, locale: recovery.locale, mutationId: recovery.mutationId }, new AbortController().signal),
      error => error instanceof ResearchClientError && error.code === "RESEARCH_UNAVAILABLE");
    const queued = await state();
    assert.equal(queued.counters.syntheticProviderCalls, 0);
    assert.equal(queued.counts.research_runs, 1);
    assert.equal(queued.counts.research_site_acceptances, 1);
    const runId = accepted.run.id;
    await control({ action: "reopen" });
    await control({ action: "workflow", runId });
    assert.equal((await state()).counts.research_executor_results, 1);
    assert.equal((await state()).counts.research_packages, 0);
    await control({ action: "reopen" });
    const recovered = await client.recoverResearch(recovery, new AbortController().signal);
    assert.equal(recovered.run.id, runId); assert.equal(recovered.run.state, "ready");
    await control({ action: "cron" });
    const ready = await state();
    assert.equal(ready.counters.syntheticProviderCalls, 1);
    assert.equal(ready.counters.repairCalls, 0);
    assert.equal(ready.counters.siteKeyReads, 0);
    assert.equal(ready.counters.siteProviderCreates, 0);
    assert.equal(ready.serverOutboundDenials, 0);
    assert.equal(ready.counts.research_executor_jobs, 1);
    assert.equal(ready.counts.research_packages, 1);
    assert.equal(ready.accounting.acceptedQuotaUnits, 1);
    assert.equal(ready.accounting.settledMicros, 100000);
    assert.equal(ready.accounting.completedImports, 1);
    const { createPlanningClient } = await server.vite.ssrLoadModule("/app/lib/planning-client.ts");
    const { createArcCloudClient, isArcApiError } = await server.vite.ssrLoadModule("/app/lib/cloud-client.ts");
    const { offlinePlanningRequest } = await server.vite.ssrLoadModule("/tests/offline-uat/planning-fixture.ts");
    const planning = createPlanningClient({ fetch }); const cloud = createArcCloudClient({ fetch });
    const blueprint = recovered.run.planningData.blueprint;
    const activated = await cloud.importLocal({ setup: { roleId: blueprint.name, level: "beginner", weeklyMinutes: 420, targetWeeks: 18 },
      completedUnitIds: [], proofs: [] }, "reject", "durable-http-activation", new AbortController().signal, "research-setup");
    assert.equal(activated.status, "imported");
    const generated = await planning.generate(offlinePlanningRequest(blueprint, { source: "research", researchRunId: runId }, "durable-http-generate"));
    assert.ok(generated.result.workspace.dailyUnits.length > 0);
    assert.equal(generated.sourceContext.reference.source, "research");
    assert.equal(generated.sourceContext.reference.researchRunId, runId);
    await control({ action: "reopen" });
    assert.deepEqual(await planning.loadWorkspace(), { workspace: generated.result.workspace, sourceContext: generated.sourceContext });
    assert.equal((await cloud.loadWorkspace()).activeGoalId, activated.activeGoalId);
    await control({ action: "owner", owner: "owner-b" });
    await assert.rejects(client.recoverResearch(recovery, new AbortController().signal), error => error instanceof ResearchClientError && error.code === "NOT_FOUND");
    assert.equal(await cloud.loadWorkspace(), null);
    await assert.rejects(planning.loadWorkspace(), error => isArcApiError(error) && error.status === 404);
    await control({ action: "owner", owner: "owner-a" });
    assert.deepEqual(await planning.loadWorkspace(), { workspace: generated.result.workspace, sourceContext: generated.sourceContext });
    await control({ action: "configure", disabled: true });
    assert.equal((await client.recoverResearch(recovery, new AbortController().signal)).run.id, runId);
    await control({ action: "reopen" });
    assert.equal((await client.recoverResearch(recovery, new AbortController().signal)).run.id, runId);
    assert.equal(calls.filter(([method, path]) => method === "POST" && path === "/api/intelligence/research").length, 1);
    assert.equal((await state()).counters.syntheticProviderCalls, 1);
    context.diagnostic("Real public HTTP/client; synthetic signed private transport and independent executor; no paid Provider.");
  } finally {
    const closing = server.close(); assert.equal(server.close(), closing); await closing;
    assert.equal(globalThis.fetch, originalFetch);
    assert.equal(existsSync(server.vite.config.cacheDir), false);
  }
});
