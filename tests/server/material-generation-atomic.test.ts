// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMaterialsD1 } from "../helpers/materials-d1";
import { materialContextRequest, materialNow, materialSourceResolver, seedMaterialSelection } from "../helpers/material-planning";
import { MaterialContextService } from "../../app/server/documents/context-builder";
import { PlanningService } from "../../app/server/planning/service";
import { D1PlanningRepository } from "../../app/server/planning/d1-planning-repository";

const databases: ReturnType<typeof createMaterialsD1>[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
async function setup() {
  const db = createMaterialsD1(); databases.push(db); seedMaterialSelection(db);
  let id = 0; const sourceResolver = materialSourceResolver();
  const repository = new D1PlanningRepository(db as unknown as D1Database, { sourceResolver, now: materialNow, createId: () => `stored-${++id}` });
  const materials = new MaterialContextService({ db: db as unknown as D1Database, sourceResolver, planningRepository: repository, now: materialNow, createId: () => `context-${++id}` });
  const request = materialContextRequest(); const preview = await materials.create("owner-a", request);
  const { scope, selectionRef, mutationId, ...generation } = request; void scope; void mutationId;
  const input = { ...generation, mutationId: "generate-material-a", materials: { contextVersionId: preview.contextVersionId, previewToken: preview.previewToken, selectionRef } };
  const service = new PlanningService({ repository, materials, sourceResolver, now: materialNow, createId: () => `workspace-${++id}` });
  return { db, service, input, repository, materials, sourceResolver };
}
describe("atomic material generation", () => {
  it("saves generation, bindings and ID-only receipts in one batch and replays once", async () => {
    const { db, service, input } = await setup();
    const first = await service.generate("owner-a", input);
    expect((await service.generate("owner-a", input)).workspace.id).toBe(first.workspace.id);
    expect(db.database.prepare("SELECT count(*) AS n FROM planning_workspaces").get()).toMatchObject({ n: 1 });
    expect(db.database.prepare("SELECT state,bound_goal_id FROM material_selections").get()).toMatchObject({ state: "bound", bound_goal_id: "goal-a" });
    expect(db.database.prepare("SELECT count(*) AS n FROM goal_document_links").get()).toMatchObject({ n: 1 });
    expect(db.database.prepare("SELECT count(*) AS n FROM document_usage_links").get()).toMatchObject({ n: 1 });
    expect(JSON.stringify(db.database.prepare("SELECT response_json FROM idempotency_records").all())).not.toContain("PRIVATE-MATERIAL-SENTINEL-7f91");
    await expect(service.generate("owner-a", { ...input, target: { ...input.target, targetWeeks: 51 } })).rejects.toMatchObject({ code: "CONFLICT" });
    db.database.exec("UPDATE documents SET lifecycle='revoked',generation=1");
    await expect(service.generate("owner-a", input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await service.getWorkspace("owner-a")).toMatchObject({ id: first.workspace.id });
  });
  it("recovers a committed result through the locked source when new generation is unavailable", async () => {
    const { service, input, sourceResolver } = await setup();
    const original = await service.generate("owner-a", input);
    vi.spyOn(sourceResolver, "resolveForGenerate").mockRejectedValue(new Error("new generation unavailable"));
    expect((await service.generate("owner-a", input)).workspace.id).toBe(original.workspace.id);
  });
  it("cannot bypass a material mutation digest by omitting the reference", async () => {
    const { service, input } = await setup(); await service.generate("owner-a", input);
    const { materials, ...plain } = input; void materials;
    await expect(service.generate("owner-a", plain)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("concurrent same-mutation requests create only one workspace and association", async () => {
    const { db, service, input } = await setup();
    const results = await Promise.all([service.generate("owner-a", input), service.generate("owner-a", input)]);
    expect(results[0].workspace.id).toBe(results[1].workspace.id);
    expect(db.database.prepare("SELECT count(*) AS n FROM planning_workspaces").get()).toMatchObject({ n: 1 });
    expect(db.database.prepare("SELECT count(*) AS n FROM goal_document_links").get()).toMatchObject({ n: 1 });
  });
  it("rolls back all plan and material writes after a late batch failure", async () => {
    const { db, service, input } = await setup(); db.failAtBatchStatement = 8;
    await expect(service.generate("owner-a", input)).rejects.toBeTruthy();
    expect(db.database.prepare("SELECT count(*) AS n FROM planning_workspaces").get()).toMatchObject({ n: 0 });
    expect(db.database.prepare("SELECT count(*) AS n FROM goal_document_links").get()).toMatchObject({ n: 0 });
    expect(db.database.prepare("SELECT state FROM material_selections").get()).toMatchObject({ state: "active" });
  });
  it("rechecks selection and deletion inside the actual generation batch", async () => {
    const { db, service, input } = await setup(); const batch = db.batch.bind(db);
    db.batch = async statements => { db.database.exec("UPDATE documents SET lifecycle='revoked',generation=1"); return batch(statements); };
    await expect(service.generate("owner-a", input)).rejects.toBeTruthy();
    expect(db.database.prepare("SELECT count(*) AS n FROM planning_workspaces").get()).toMatchObject({ n: 0 });
    expect(db.database.prepare("SELECT count(*) AS n FROM goal_document_links").get()).toMatchObject({ n: 0 });
  });
});
