// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createResearchD1 } from "../helpers/sqlite-d1";
import { createOfflineComposition } from "./composition";
import { researchRunPublicViewSchema } from "../../app/contracts/research";
vi.mock("../../app/server/auth/runtime", () => ({ getAuth: () => { throw new Error("Offline harness forbids runtime auth"); } }));
const origin = "http://127.0.0.1:4179";
const databases: ReturnType<typeof createResearchD1>[] = [];
const applications: Awaited<ReturnType<typeof createOfflineComposition>>[] = [];
afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.dispose()));
  databases.splice(0).forEach((db) => db.close());
});
async function setup() {
  const db = createResearchD1(); databases.push(db);
  const app = await createOfflineComposition(db as unknown as D1Database, origin); applications.push(app);
  return { db, app };
}
function request(path: string, body?: unknown, owner: string | null = "owner-a", method = body === undefined ? "GET" : "POST") {
  return new Request(`${origin}${path}`, { method, headers: { host: "127.0.0.1:4179", origin, "sec-fetch-site": "same-origin", "content-type": "application/json", ...(owner ? { "x-arc-uat-owner": owner } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function runBody(response: Response) {
  const body = await response.json() as { run: unknown };
  return { run: researchRunPublicViewSchema.parse(body.run) };
}
describe("offline UAT real service composition", () => {
  it("starts with authenticated users only and executes actual Fake Research into Ready", async () => {
    const { db, app } = await setup();
    expect(db.database.prepare("SELECT count(*) count FROM career_goals").get()).toEqual({ count: 0 });
    const response = await app.dispatch(request("/api/intelligence/research", { role: "Data Product Manager", locale: "en-US", mutationId: "offline-research-first" }));
    expect(response.status).toBe(200);
    const body = await runBody(response);
    expect(body.run).toMatchObject({ state: "ready", planningData: { blueprint: { name: "Data Product Manager" } } });
    expect(db.database.prepare("SELECT count(*) count FROM ai_runs").get()).toEqual({ count: 1 });
    expect(db.database.prepare("SELECT count(*) count FROM career_goals").get()).toEqual({ count: 0 });
    const denied = await app.dispatch(request(`/api/intelligence/research/${body.run.id}`, undefined, "owner-b"));
    expect(denied.status).toBe(404);
  });
  it("rejects unknown API routes without forwarding and authenticates the actual route", async () => {
    const { app } = await setup();
    expect((await app.dispatch(request("/api/unknown", {}))).status).toBe(404);
    expect((await app.dispatch(request("/api/workspace", undefined, null))).status).toBe(401);
  });
  it.each([
    ["needs-review", 422, "needs-review", undefined],
    ["timeout", 503, "failed", true],
    ["filtered", 503, "failed", false],
  ] as const)("uses the real terminal envelope for %s", async (mode, status, state, retryable) => {
    const { app } = await setup(); app.configure({ mode });
    const response = await app.dispatch(request("/api/intelligence/research", { role: "Data Product Manager", locale: "en-US", mutationId: `offline-${mode}-first` }));
    expect(response.status).toBe(status);
    const body = await runBody(response); expect(body.run.state).toBe(state);
    if (retryable !== undefined) expect(body.run.retryable).toBe(retryable);
  });
  it.each(["disabled", "exhausted"] as const)("enforces %s without calling an external provider and preserves owner recovery", async (mode) => {
    const { app } = await setup();
    const ready = await runBody(await app.dispatch(request("/api/intelligence/research", { role: "Data Product Manager", locale: "en-US", mutationId: "offline-before-gate" })));
    app.configure({ [mode]: true });
    const next = await app.dispatch(request("/api/intelligence/research", { role: "Ecologist", locale: "en-US", mutationId: "offline-after-gate" }));
    expect(next.status).toBe(mode === "disabled" ? 503 : 429);
    expect((await runBody(await app.dispatch(request(`/api/intelligence/research/${ready.run.id}`)))).run.state).toBe("ready");
  });
  it.each(["researching", "validating"] as const)("prestarts and pauses committed %s while ordinary POST/GET recover one actual run", async (stage) => {
    const { app } = await setup();
    const id = await app.prestart("owner-a", stage);
    const recovered = await runBody(await app.dispatch(request("/api/intelligence/research", { role: "Data Product Manager", locale: "en-US", mutationId: `offline-recover-${stage}` })));
    expect(recovered.run).toMatchObject({ id, state: stage });
    expect((await runBody(await app.dispatch(request(`/api/intelligence/research/${id}`)))).run.state).toBe(stage);
    expect(app.counters.researchInvocations).toBe(1);
    await app.resume();
    expect((await runBody(await app.dispatch(request(`/api/intelligence/research/${id}`)))).run.state).toBe("ready");
    expect(app.counters.fakeResearchCalls).toBe(1);
    await app.dispose();
  });
});
