// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { createMaterialsD1 } from "../helpers/materials-d1";
import { materialContextRequest, materialNow, materialSourceResolver, seedMaterialSelection } from "../helpers/material-planning";
import { MaterialContextService } from "../../app/server/documents/context-builder";
import { D1PlanningRepository } from "../../app/server/planning/d1-planning-repository";
import { PlanningService } from "../../app/server/planning/service";
import { createMaterialContextFingerprint } from "../../app/contracts/material-planning";
import { MAX_MATERIAL_CONTEXT_JSON_BYTES, utf8Bytes } from "../../app/contracts/documents";

const databases: ReturnType<typeof createMaterialsD1>[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
function setup() {
  const db = createMaterialsD1(); databases.push(db); seedMaterialSelection(db);
  db.database.exec("UPDATE document_confirmations SET items_json=json_set(items_json,'$[0].text','构建可访问的产品界面')");
  const sourceResolver = materialSourceResolver(); let id = 0;
  const repository = new D1PlanningRepository(db as unknown as D1Database, { sourceResolver, now: materialNow, createId: () => `stored-${++id}` });
  const materials = new MaterialContextService({ db: db as unknown as D1Database, sourceResolver, planningRepository: repository, now: materialNow, createId: () => `context-${++id}` });
  const service = new PlanningService({ repository, materials, sourceResolver, now: materialNow, createId: () => `workspace-${++id}` });
  return { db, materials, service };
}
const mapping = { confirmationId: "confirmation-a", itemId: "confirmed-a", skillId: "react" };
function selectSecondConfirmation(db: ReturnType<typeof createMaterialsD1>) {
  db.database.exec("INSERT INTO documents SELECT owner_id,'doc-b','resume','Resume',lifecycle,generation,revision,'version-b',created_at,updated_at FROM documents WHERE id='doc-a'");
  db.database.exec("INSERT INTO document_versions SELECT owner_id,'doc-b','version-b','text-b',state,generation,revision,text_digest,'object-b',utf8_bytes,code_points,segments_json,parser_version,created_at FROM document_versions WHERE id='version-a'");
  db.database.exec("INSERT INTO document_text_versions SELECT owner_id,'doc-b','version-b','text-b',parser_version,text_hash,'object-b',created_at FROM document_text_versions WHERE id='text-a'");
  db.database.exec("INSERT INTO document_confirmations(owner_id,document_id,document_version_id,id,text_version_id,review_revision,revision,origin,state,items_json,created_at) SELECT owner_id,'doc-b','version-b','confirmation-b','text-b',review_revision,revision,origin,state,json_set(items_json,'$[0].kind','skill-claim','$[0].requirementLevel',NULL),created_at FROM document_confirmations WHERE id='confirmation-a'");
  db.database.exec("INSERT INTO material_selection_entries VALUES ('owner-a','selection-a','resume','doc-b','version-b','confirmation-b')");
}
describe("explicit material skill mappings", () => {
  it("shows all 504 distinct uncovered words in a bounded preview and links them back to their facts", async () => {
    const { db, materials } = setup();
    const rows = Array.from({ length: 63 }, (_, index) => ({
      id: `fact-${index}`, kind: "requirement", text: "A reviewed requirement", requirementLevel: "preferred", origin: "extracted",
      sourceRef: { documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", start: 0, end: 1 },
      skillLabels: Array.from({ length: 8 }, (_, word) => `tool-${index}-${word}`),
    }));
    db.database.prepare("UPDATE document_confirmations SET items_json=? WHERE id='confirmation-a'").run(JSON.stringify(rows));
    const { preview, contextVersionId } = await materials.create("owner-a", materialContextRequest());
    expect(preview.uncoveredLabels).toEqual(rows.flatMap(item => item.skillLabels));
    expect(preview.priorities).toEqual([]);
    expect(preview.issues.filter(issue => issue.code === "uncovered").flatMap(issue => issue.itemIds).sort()).toEqual(preview.confirmedItems.map(item => item.id).sort());
    expect((await materials.read("owner-a", contextVersionId)).preview).toEqual(preview);
  });
  it("rejects an oversized preview response before committing its context or mutation receipt", async () => {
    const { db, materials } = setup(); selectSecondConfirmation(db);
    const groups = ["a", "b"].map(slot => Array.from({ length: 80 }, (_, index) => ({
      id: `fact-${index}`, kind: "skill-claim", text: "Notes", requirementLevel: null, origin: "extracted",
      sourceRef: { documentId: `doc-${slot}`, documentVersionId: `version-${slot}`, textVersionId: `text-${slot}`, start: 0, end: 1 },
      skillLabels: Array.from({ length: 8 }, (_, word) => `tool-${slot}-${index}-${word}-${"k".repeat(42)}`),
    })));
    function store() {
      const update = db.database.prepare("UPDATE document_confirmations SET items_json=? WHERE id=?");
      groups.forEach((items, index) => update.run(JSON.stringify(items), index === 0 ? "confirmation-a" : "confirmation-b"));
    }
    store();
    const initial = await materials.create("owner-a", materialContextRequest());
    let remaining = MAX_MATERIAL_CONTEXT_JSON_BYTES + 1 - utf8Bytes(JSON.stringify(initial));
    expect(remaining).toBeGreaterThan(0);
    for (let index = 0; index < 80; index++) for (const items of groups) {
      const length = Math.min(900, remaining); items[index]!.text += "x".repeat(length); remaining -= length;
    }
    expect(remaining).toBe(0);
    store();
    await expect(materials.create("owner-a", { ...materialContextRequest(), mutationId: "oversized" })).rejects.toThrow(/byte limit/u);
    expect(db.database.prepare("SELECT count(*) AS n FROM material_context_versions").get()).toMatchObject({ n: 1 });
    expect(db.database.prepare("SELECT count(*) AS n FROM document_mutations WHERE mutation_id='oversized'").get()).toMatchObject({ n: 0 });
  });
  it("freezes owner-validated mappings into the context and generated plan", async () => {
    const { db, materials, service } = setup(); const request = materialContextRequest();
    const before = await materials.create("owner-a", request);
    expect(before.preview.issues.some(issue => issue.code === "uncovered")).toBe(true);
    const after = await materials.create("owner-a", { ...request, mutationId: "mapped-context", skillMappings: [mapping] });
    expect(after.preview.overlay?.mandatorySkillIds).toEqual(["react"]);
    expect(after.preview.issues.some(issue => issue.code === "uncovered")).toBe(false);
    expect(after.preview.overlay?.semanticFingerprint).not.toBe(before.preview.overlay?.semanticFingerprint);
    const row = db.database.prepare("SELECT snapshot_json FROM material_context_versions WHERE id=?").get(after.contextVersionId) as { snapshot_json: string };
    expect(JSON.parse(row.snapshot_json).skillMappings).toEqual([mapping]);
    expect((await materials.read("owner-a", after.contextVersionId)).preview).toMatchObject({ skillMappings: [mapping] });
    const { scope, selectionRef, ...generation } = request; void scope;
    const generated = await service.generate("owner-a", { ...generation, mutationId: "mapped-generation", materials: { selectionRef, contextVersionId: after.contextVersionId, previewToken: after.previewToken } });
    expect(generated.workspace.activePathVersionId).toBeTruthy();
    expect(db.database.prepare("SELECT context_version_id FROM document_usage_links WHERE kind='generation'").get()).toMatchObject({ context_version_id: after.contextVersionId });
    await expect(materials.create("owner-b", { ...request, skillMappings: [mapping] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it.each([
    { ...mapping, confirmationId: "unselected-confirmation" },
    { ...mapping, itemId: "unconfirmed-item" },
    { ...mapping, skillId: "kubernetes-new-course" },
  ])("rejects a mapping outside the selected confirmations and published skills: %j", async bad => {
    const { db, materials } = setup();
    await expect(materials.create("owner-a", { ...materialContextRequest(), skillMappings: [bad] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(db.database.prepare("SELECT count(*) AS n FROM material_context_versions").get()).toMatchObject({ n: 0 });
  });
  it("binds duplicate item IDs to their own confirmation and keeps mapping order nonsemantic", async () => {
    const { db, materials } = setup();
    selectSecondConfirmation(db);
    const skillMappings = [mapping, { ...mapping, confirmationId: "confirmation-b", skillId: "sql" }];
    const result = await materials.create("owner-a", { ...materialContextRequest(), skillMappings });
    expect(result.preview.priorities.find(item => item.skillId === "react")?.tier).toBe(0);
    expect(result.preview.priorities.find(item => item.skillId === "sql")?.tier).toBe(3);
    const row = db.database.prepare("SELECT snapshot_json FROM material_context_versions WHERE id=?").get(result.contextVersionId) as { snapshot_json: string };
    const snapshot = JSON.parse(row.snapshot_json);
    expect(await createMaterialContextFingerprint(snapshot)).toBe(await createMaterialContextFingerprint({ ...snapshot, skillMappings: [...skillMappings].reverse() }));
  });
  it("does not turn non-learning constraints into uncovered learning requirements", async () => {
    const { db, materials } = setup();
    db.database.exec("UPDATE document_confirmations SET items_json=json_set(items_json,'$[0].kind','constraint','$[0].requirementLevel',NULL)");
    const result = await materials.create("owner-a", materialContextRequest());
    expect(result.preview.issues).toEqual([]);
    await expect(materials.create("owner-a", { ...materialContextRequest(), mutationId: "constraint-mapping", skillMappings: [mapping] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("rechecks the confirmed fact inside the same transaction before freezing a mapping", async () => {
    const { db, materials } = setup(); const batch = db.batch.bind(db);
    db.batch = async statements => { db.database.exec("UPDATE document_confirmations SET state='revoked',items_json='[]'"); return batch(statements); };
    await expect(materials.create("owner-a", { ...materialContextRequest(), skillMappings: [mapping] })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.database.prepare("SELECT count(*) AS n FROM material_context_versions").get()).toMatchObject({ n: 0 });
  });
});
