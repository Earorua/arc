// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import type { ConfirmedMaterialItem } from "../../app/contracts/documents";
import { MaterialContextService } from "../../app/server/documents/context-builder";
import { explainMaterialPreview } from "../../app/lib/materials/explanations";
import { createMaterialContextFingerprint } from "../../app/contracts/material-planning";
import { canonicalJson } from "../../app/lib/planning/fingerprint";
import { createMaterialsD1 } from "../helpers/materials-d1";
import { materialContextRequest, materialNow, materialSourceResolver, seedMaterialSelection } from "../helpers/material-planning";

const databases: ReturnType<typeof createMaterialsD1>[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
const fact = (extra: Partial<ConfirmedMaterialItem> = {}): ConfirmedMaterialItem => ({
  id: "advice", kind: "requirement", text: "Coach recommends SQL practice", origin: "user", sourceRef: null,
  requirementLevel: "unspecified", skillLabels: ["SQL"], ...extra,
});
function setup(items = [fact()], primary: ConfirmedMaterialItem[] = []) {
  const db = createMaterialsD1(); databases.push(db); seedMaterialSelection(db);
  db.database.prepare("UPDATE document_confirmations SET items_json=? WHERE id='confirmation-a'").run(JSON.stringify(primary.length ? primary : items));
  if (!primary.length) {
    db.database.exec("UPDATE documents SET kind='supplement'; UPDATE material_selection_entries SET slot='supplement'");
  } else {
    db.database.exec("INSERT INTO documents SELECT owner_id,'doc-b','supplement','Coach',lifecycle,generation,revision,'version-b',created_at,updated_at FROM documents WHERE id='doc-a'");
    db.database.exec("INSERT INTO document_versions SELECT owner_id,'doc-b','version-b','text-b',state,generation,revision,text_digest,'object-b',utf8_bytes,code_points,segments_json,parser_version,created_at FROM document_versions WHERE id='version-a'");
    db.database.exec("INSERT INTO document_text_versions SELECT owner_id,'doc-b','version-b','text-b',parser_version,text_hash,'object-b',created_at FROM document_text_versions WHERE id='text-a'");
    db.database.exec("INSERT INTO document_confirmations(owner_id,document_id,document_version_id,id,text_version_id,review_revision,revision,origin,state,items_json,created_at) SELECT owner_id,'doc-b','version-b','confirmation-b','text-b',review_revision,revision,origin,state,items_json,created_at FROM document_confirmations WHERE id='confirmation-a'");
    db.database.prepare("UPDATE document_confirmations SET items_json=? WHERE id='confirmation-b'").run(JSON.stringify(items));
    db.database.exec("INSERT INTO material_selection_entries VALUES ('owner-a','selection-a','supplement','doc-b','version-b','confirmation-b')");
  }
  let id = 0;
  const materials = new MaterialContextService({ db: db as unknown as D1Database, sourceResolver: materialSourceResolver(), now: materialNow, createId: () => `intent-context-${++id}` });
  return { db, materials, choice: { confirmationId: primary.length ? "confirmation-b" : "confirmation-a", itemId: items[0]!.id } };
}

describe("explicit learning intentions", () => {
  it("uses coach-only advice only after separate adoption, with a truthful reason and unchanged audit/time", async () => {
    const { db, materials, choice } = setup(); const request = materialContextRequest();
    const before = await materials.create("owner-a", request);
    expect(before.preview.overlay?.skillRanks.sql).toBe(5);
    expect(before.preview.issues).toContainEqual({ code: "learning-intent-not-adopted", itemIds: [before.preview.confirmedItems[0]!.id], skillIds: [] });
    expect(before.preview.itemReferences?.[0]?.learningIntentEligible).toBe(true);
    const after = await materials.create("owner-a", { ...request, mutationId: "adopt", learningIntents: [choice] });
    expect(after.preview.overlay?.skillRanks.sql).toBe(3);
    expect(after.preview.overlay?.mandatorySkillIds).toEqual([]);
    expect(after.preview.priorities[0]?.learningIntentItemIds).toEqual([after.preview.confirmedItems[0]!.id]);
    expect(explainMaterialPreview(after.preview, true)).toContainEqual(expect.objectContaining({ ruleId: "confirmed-learning-intent-v1", message: expect.stringContaining("学习重点") }));
    expect(explainMaterialPreview(after.preview, true).some(item => item.message.includes("已确认经历"))).toBe(false);
    const saved = db.database.prepare("SELECT snapshot_json FROM material_context_versions WHERE id=?").get(after.contextVersionId) as { snapshot_json: string };
    expect(JSON.parse(saved.snapshot_json)).toMatchObject({ audit: request.audit, availability: request.availability, learningIntents: [choice] });
    expect((await materials.read("owner-a", after.contextVersionId)).preview).toEqual(after.preview);
    expect(after.preview.overlay?.semanticFingerprint).not.toBe(before.preview.overlay?.semanticFingerprint);
  });
  it("adopts a topic in a mixed time constraint without changing the daily budget or fact meaning", async () => {
    const item = fact({ kind: "constraint", requirementLevel: null, text: "I have 20 minutes to focus on SQL." });
    const { materials, choice } = setup([item]); const request = materialContextRequest();
    const before = await materials.create("owner-a", request);
    expect(before.preview.priorities).toEqual([]);
    const after = await materials.create("owner-a", { ...request, mutationId: "focus", learningIntents: [choice] });
    expect(after.preview.overlay?.skillRanks.sql).toBe(3);
    expect(after.preview.confirmedItems[0]).toMatchObject({ ...item, id: expect.any(String) });
    expect(after.preview.planning?.fullScope.totalMinutes).toBe(before.preview.planning?.fullScope.totalMinutes);
  });
  it.each(["must", "preferred"] as const)("keeps primary JD %s classification ahead of a supplemental learning intent", async level => {
    const { materials, choice } = setup([fact()], [fact({ id: "main", requirementLevel: level })]);
    const { preview } = await materials.create("owner-a", { ...materialContextRequest(), learningIntents: [choice] });
    expect(preview.overlay?.skillRanks.sql).toBe(level === "must" ? 0 : 4);
    expect(preview.overlay?.mandatorySkillIds).toEqual(level === "must" ? ["sql"] : []);
    const primaryId = preview.itemReferences!.find(ref => ref.confirmationId === "confirmation-a")!.id;
    expect(preview.priorities[0]?.itemIds).toEqual([primaryId]);
  });
  it("changes or omits one retained term without dropping another term or restoring removed vocabulary", async () => {
    const { materials, choice } = setup([fact({ kind: "experience", requirementLevel: null, text: "Built React components and UI tokens in Figma", skillLabels: ["React", "UI tokens"] })]);
    const term = { ...choice, skillLabel: "UI tokens", skillIds: ["design-systems"] };
    const selected = await materials.create("owner-a", { ...materialContextRequest(), termMappings: [term] });
    expect(selected.preview.priorities.map(item => item.skillId).sort()).toEqual(["design-systems", "react"]);
    const omitted = await materials.create("owner-a", { ...materialContextRequest(), mutationId: "omit", termMappings: [{ ...term, skillIds: [] }] });
    expect(omitted.preview.priorities.map(item => item.skillId)).toEqual(["react"]);
    expect(omitted.preview.mappingDetails).toContainEqual(expect.objectContaining({ termIndexes: [1], status: "omitted" }));
    expect(omitted.preview.issues.some(issue => issue.code === "mapping-omitted")).toBe(true);
    await expect(materials.create("owner-a", { ...materialContextRequest(), mutationId: "absent-term", termMappings: [{ ...term, skillLabel: "Figma" }] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("rejects unselected/unknown references and unadopted constraint mappings before any context is saved", async () => {
    const { db, materials, choice } = setup([fact({ kind: "constraint", requirementLevel: null })]);
    const request = materialContextRequest();
    for (const change of [
      { learningIntents: [{ ...choice, confirmationId: "unselected" }] },
      { learningIntents: [{ ...choice, itemId: "missing" }] },
      { termMappings: [{ ...choice, skillLabel: "SQL", skillIds: ["sql"] }] },
      { learningIntents: [choice], termMappings: [{ ...choice, skillLabel: "SQL", skillIds: ["invented"] }] },
    ]) await expect(materials.create("owner-a", { ...request, ...change })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(materials.create("owner-b", { ...request, learningIntents: [choice] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.database.prepare("SELECT count(*) AS n FROM material_context_versions").get()).toMatchObject({ n: 0 });
  });
  it("refuses to adopt an experience or primary JD as a learning intention", async () => {
    const experience = setup([fact({ kind: "experience", requirementLevel: null })]);
    await expect(experience.materials.create("owner-a", { ...materialContextRequest(), learningIntents: [experience.choice] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const primary = setup([fact()], [fact({ id: "main", requirementLevel: "must" })]);
    await expect(primary.materials.create("owner-a", { ...materialContextRequest(), learningIntents: [{ confirmationId: "confirmation-a", itemId: "main" }] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it.each([{ skillLabels: ["React", "SQL"] }, { skillLabels: [] }])("requires term choices for labelled facts, including removed vocabulary: %j", async ({ skillLabels }) => {
    const { materials, choice } = setup([fact({ kind: "experience", requirementLevel: null, text: "React and SQL", skillLabels })]);
    await expect(materials.create("owner-a", { ...materialContextRequest(), skillMappings: [{ ...choice, skillId: "sql" }] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("reads a historical whole-item mapping snapshot without reinterpreting it under the new policy", async () => {
    const { db, materials, choice } = setup([fact({ kind: "experience", requirementLevel: null, text: "React and UI tokens", skillLabels: ["React", "UI tokens"] })]);
    const created = await materials.create("owner-a", materialContextRequest());
    const row = db.database.prepare("SELECT snapshot_json FROM material_context_versions WHERE id=?").get(created.contextVersionId) as { snapshot_json: string };
    const snapshot = { ...JSON.parse(row.snapshot_json), mappingVersion: "2026.11.4", policyVersion: "2026.11.1", explanationVersion: "2026.11.2", skillMappings: [{ ...choice, skillId: "sql" }] };
    const digest = await createMaterialContextFingerprint(snapshot);
    const { mappingDetails, ...preview } = created.preview; void mappingDetails;
    const legacy = { ...preview, skillMappings: snapshot.skillMappings, issues: [], uncoveredLabels: [],
      priorities: [{ skillId: "sql", tier: 3, itemIds: [preview.confirmedItems[0]!.id] }],
      overlay: { ...preview.overlay!, semanticFingerprint: digest, policyVersion: "2026.11.1", skillRanks: Object.fromEntries(Object.keys(preview.overlay!.skillRanks).map(skill => [skill, skill === "sql" ? 3 : 5])) },
    };
    db.database.prepare("UPDATE material_context_versions SET snapshot_json=?,preview_json=?,fingerprint=? WHERE id=?").run(canonicalJson(snapshot), JSON.stringify(legacy), digest, created.contextVersionId);
    expect((await materials.read("owner-a", created.contextVersionId)).preview).toEqual(legacy);
  });
});
