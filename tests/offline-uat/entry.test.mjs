import { test } from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { createHarnessServer } from "./server.mjs";

function request(origin, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(new URL(path, origin), options, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject); req.end(options.body);
  });
}
test("loopback entry serves actual modules while rejecting origin spoofing, unsafe writes and private files", async () => {
  const server = await createHarnessServer({ port: 4181 });
  try {
    const html = await request(server.origin, "/setup");
    assert.equal(html.status, 200); assert.match(html.headers["content-security-policy"], /default-src 'self'/u);
    const token = /name="arc-uat-control" content="([a-f0-9]+)"/u.exec(html.body)?.[1]; assert.ok(token);
    const entryModule = await request(server.origin, "/tests/offline-uat/main.tsx"); assert.equal(entryModule.status, 200);
    const dependency = /from "([^"]+\/deps\/react\.js[^"]*)"/u.exec(entryModule.body)?.[1]; assert.ok(dependency);
    assert.equal((await request(server.origin, dependency)).status, 200, "browser React dependency must be reachable");
    assert.equal((await request(server.origin, "/__uat/state", { headers: { host: "attacker.example:4181" } })).status, 403);
    assert.equal((await request(server.origin, "/__uat/control", { method: "POST", body: "{}" })).status, 403);
    const safe = { origin: server.origin, "sec-fetch-site": "same-origin", "content-type": "application/json", "x-arc-uat-control": token };
    assert.equal((await request(server.origin, "/__uat/control", { method: "POST", headers: { ...safe, origin: "https://attacker.example" }, body: JSON.stringify({ action: "owner", owner: null }) })).status, 403);
    assert.equal((await request(server.origin, "/api/workspace", { method: "PUT", headers: { ...safe, "x-arc-uat-control": "wrong" }, body: "{}" })).status, 403);
    assert.equal((await request(server.origin, "/__uat/control", { method: "POST", headers: safe, body: JSON.stringify({ action: "owner", owner: null }) })).status, 200);
    assert.equal((await request(server.origin, "/api/workspace")).status, 401);
    for (const path of ["/api/unknown", "/.env", "/.git/config", "/wrangler.jsonc", "/tests/helpers/sqlite-d1.ts", "/@fs/C:/Windows/win.ini"]) assert.equal((await request(server.origin, path)).status, 404, path);
    const state = JSON.parse((await request(server.origin, "/__uat/state")).body);
    assert.equal(state.owner, null); assert.equal(state.counts.career_goals, 0);
    assert.equal(state.serverOutboundDenials, 0); assert.equal(JSON.stringify(state).includes(token), false);
    await assert.rejects(fetch("https://example.com/never-sent"), /blocks outbound/u);
    assert.equal(JSON.parse((await request(server.origin, "/__uat/state")).body).serverOutboundDenials, 1);
  } finally { await server.close(); }
});
