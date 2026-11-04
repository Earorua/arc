// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { createMaterialsD1 } from "../helpers/materials-d1";
import { materialContextRequest, materialNow, materialSourceResolver, seedMaterialSelection } from "../helpers/material-planning";
import { MaterialContextService } from "../../app/server/documents/context-builder";
import { PlanningService } from "../../app/server/planning/service";
import { D1PlanningRepository } from "../../app/server/planning/d1-planning-repository";
const databases: ReturnType<typeof createMaterialsD1>[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
async function setup() {
  const db = createMaterialsD1(); databases.push(db); seedMaterialSelection(db);
  let now = materialNow();
  const service = new MaterialContextService({ db: db as unknown as D1Database, sourceResolver: materialSourceResolver(), now: () => now });
  const context = await service.create("owner-a", materialContextRequest());
  const request = { contextVersionId: context.contextVersionId, mutationId: "generate-original", goalId: "goal-a" };
  return { db, service, request, context, now: () => now, expire: () => { now = new Date(now.getTime() + 31 * 60_000); } };
}
it("proves uncommitted first creation and exposes expiry without reading private preview", async () => {
  const { service, request, expire } = await setup();
  expect(await service.generationReceipt("owner-a", request)).toEqual({ state: "uncommitted", previewExpired: false });
  expire();
  expect(await service.generationReceipt("owner-a", request)).toEqual({ state: "uncommitted", previewExpired: true });
  await expect(service.generationReceipt("owner-b", request)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("recognizes committed receipts after expiry and deletion without exposing their private content", async () => {
  const { db, service, request, expire } = await setup();
  db.database.prepare("INSERT INTO document_mutations VALUES (?,?,?,?,?,?)").run("owner-a", "POST /api/planning/generate", request.mutationId, "a".repeat(64), JSON.stringify({ contextVersionId: request.contextVersionId, goalId: "goal-a", workspaceId: "workspace-a" }), 0);
  expire();
  db.database.prepare("UPDATE material_context_versions SET state='revoked',snapshot_json='{}',preview_json='{}'").run();
  expect(await service.generationReceipt("owner-a", request)).toEqual({ state: "committed", previewExpired: true });
  await expect(service.generationReceipt("owner-a", { ...request, contextVersionId: "other" })).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("does not authorize re-preview into a changed goal or a revoked source", async () => {
  const { db, service, request, expire } = await setup(); expire();
  db.database.prepare("UPDATE career_goals SET active_slot=NULL,status='archived' WHERE id='goal-a'").run();
  await expect(service.generationReceipt("owner-a", request)).rejects.toMatchObject({ code: "CONFLICT" });
  db.database.prepare("UPDATE career_goals SET active_slot=1,status='active' WHERE id='goal-a'").run();
  db.database.prepare("UPDATE material_context_versions SET state='revoked'").run();
  await expect(service.generationReceipt("owner-a", request)).rejects.toMatchObject({ code: "CONFLICT" });
});
it("re-previews an expired uncommitted creation into the same goal and then replays its committed receipt after TTL", async () => {
  const { db, service, request, context, now, expire } = await setup();
  const sourceResolver = materialSourceResolver();
  const repository = new D1PlanningRepository(db as unknown as D1Database, { sourceResolver, now });
  const planning = new PlanningService({ repository, materials: service, sourceResolver, now });
  const { scope: _scope, selectionRef, mutationId: _mutation, ...input } = materialContextRequest(); void _scope; void _mutation;
  const original = { ...input, mutationId: request.mutationId, materials: { contextVersionId: context.contextVersionId, previewToken: context.previewToken, selectionRef } };
  expire();
  await expect(planning.generate("owner-a", original)).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await service.generationReceipt("owner-a", request)).toMatchObject({ state: "uncommitted", previewExpired: true });
  const fresh = await service.create("owner-a", { ...materialContextRequest(), mutationId: "context-replacement" });
  const replacement = { ...original, mutationId: "generate-replacement", materials: { ...original.materials, contextVersionId: fresh.contextVersionId, previewToken: fresh.previewToken } };
  const saved = await planning.generate("owner-a", replacement);
  expect(saved.workspace.goalId).toBe("goal-a");
  expire();
  expect((await planning.generate("owner-a", replacement)).workspace.id).toBe(saved.workspace.id);
  expect(await service.generationReceipt("owner-a", { ...request, mutationId: replacement.mutationId, contextVersionId: fresh.contextVersionId })).toEqual({ state: "committed", previewExpired: true });
  await expect(service.generationReceipt("owner-a", request)).rejects.toMatchObject({ code: "CONFLICT" });
  expect(db.database.prepare("SELECT count(*) AS n FROM career_goals").get()).toMatchObject({ n: 1 });
  expect(db.database.prepare("SELECT count(*) AS n FROM planning_workspaces").get()).toMatchObject({ n: 1 });
});
