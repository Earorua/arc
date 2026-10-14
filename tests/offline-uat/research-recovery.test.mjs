import { test } from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
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

test("a completed Start response can be discarded and recovered without another provider call or budget admission", { timeout: 45_000 }, async (context) => {
  const server = await createHarnessServer({ port: 4181 });
  try {
    const html = await (await send(server.origin, "/setup")).text();
    const nonce = /name="arc-uat-control" content="([a-f0-9]+)"/u.exec(html)?.[1];
    assert.ok(nonce);
    const entryModule = await (await send(server.origin, "/tests/offline-uat/main.tsx")).text();
    const dependency = /from "([^"]+\/deps\/react\.js[^"]*)"/u.exec(entryModule)?.[1];
    assert.ok(dependency);
    assert.equal((await send(server.origin, dependency)).status, 200);
    const requestHeaders = (body = false) => ({
      origin: server.origin,
      "sec-fetch-site": "same-origin",
      ...(body ? { "content-type": "application/json", "x-arc-uat-control": nonce } : {}),
    });
    const control = async (input) => {
      const response = await send(server.origin, "/__uat/control", {
        method: "POST",
        headers: requestHeaders(true),
        body: JSON.stringify(input),
      });
      assert.equal(response.status, 200);
    };
    let loseCompletedStartResponse = true;
    const fetch = async (input, init = {}) => {
      const path = input instanceof Request ? new URL(input.url).pathname : String(input);
      const headers = new Headers(init.headers);
      for (const [name, value] of Object.entries(requestHeaders(init.method === "POST"))) headers.set(name, value);
      const response = await send(server.origin, path, { ...init, headers });
      if (loseCompletedStartResponse && path === "/api/intelligence/research") {
        loseCompletedStartResponse = false;
        assert.equal(response.status, 200);
        await response.arrayBuffer();
        throw new TypeError("synthetic completed response discarded by transport");
      }
      return response;
    };
    const { createResearchClient, ResearchClientError } = await server.vite.ssrLoadModule("/app/lib/research-client.ts");
    context.diagnostic("Offline harness and actual client loaded.");
    const client = createResearchClient({ fetch });
    const recovery = {
      kind: "start",
      role: "Data Product Manager",
      locale: "en-US",
      mutationId: "offline-http-lost-start",
    };
    const start = { role: recovery.role, locale: recovery.locale, mutationId: recovery.mutationId };
    await assert.rejects(client.startResearch(start, new AbortController().signal),
      (error) => error instanceof ResearchClientError && error.code === "RESEARCH_UNAVAILABLE");
    context.diagnostic("Completed Start response was discarded.");
    const afterStart = await (await send(server.origin, "/__uat/state", { headers: requestHeaders() })).json();
    assert.equal(afterStart.counters.fakeResearchCalls, 1);
    assert.equal(afterStart.counts.research_runs, 1);
    const budgetAdmissions = server.app.db.database.prepare("SELECT count(*) count FROM ai_budget_reservations").get().count;
    const originalId = afterStart.runs[0].id;

    const recovered = await client.recoverResearch(recovery, new AbortController().signal);
    context.diagnostic("Recovery query returned.");
    assert.equal(recovered.run.id, originalId);
    const afterRecovery = await (await send(server.origin, "/__uat/state", { headers: requestHeaders() })).json();
    assert.equal(afterRecovery.counters.fakeResearchCalls, 1);
    assert.equal(afterRecovery.counts.research_runs, 1);
    assert.equal(budgetAdmissions, 1);
    assert.equal(server.app.db.database.prepare("SELECT count(*) count FROM ai_budget_reservations").get().count, budgetAdmissions);

    await control({ action: "owner", owner: "owner-b" });
    await assert.rejects(client.recoverResearch(recovery, new AbortController().signal),
      (error) => error instanceof ResearchClientError && error.code === "NOT_FOUND" && error.status === 404);
    await control({ action: "owner", owner: "owner-a" });
    await control({ action: "configure", disabled: true });
    const whileDisabled = await client.recoverResearch(recovery, new AbortController().signal);
    assert.equal(whileDisabled.run.id, originalId);
    assert.equal((await (await send(server.origin, "/__uat/state", { headers: requestHeaders() })).json()).counters.fakeResearchCalls, 1);
  } finally {
    context.diagnostic("Loopback only; no response bodies, cookies, credentials, or provider payloads are logged.");
    await server.close();
  }
});
