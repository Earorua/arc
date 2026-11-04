// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { createMaterialsD1 } from "../helpers/materials-d1";
import { materialContextRequest, materialNow, materialSourceResolver, seedMaterialSelection } from "../helpers/material-planning";
import { MaterialContextService } from "../../app/server/documents/context-builder";

const databases: ReturnType<typeof createMaterialsD1>[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
function setup() {
  const db = createMaterialsD1(); databases.push(db); seedMaterialSelection(db);
  let id = 0; let now = materialNow();
  const service = new MaterialContextService({ db: db as unknown as D1Database, sourceResolver: materialSourceResolver(), now: () => now, createId: () => `context-${++id}` });
  return { db, service, advance: () => { now = new Date(now.getTime() + 31 * 60_000); } };
}
describe("frozen material contexts", () => {
  it("freezes source-authoritative versions and confirmed priorities with owner-bound replay", async () => {
    const { db, service } = setup(); const request = materialContextRequest();
    const first = await service.create("owner-a", request);
    expect(first.preview.priorities.some(p => p.tier === 0)).toBe(true);
    expect(first.preview.overlay?.semanticFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(await service.create("owner-a", request)).toEqual(first);
    const row = db.database.prepare("SELECT snapshot_json FROM material_context_versions").get() as { snapshot_json: string };
    expect(JSON.parse(row.snapshot_json).sourceVersions.registryVersion).toBe("2026.08.1");
    await expect(service.read("owner-b", first.contextVersionId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.create("owner-a", { ...request, target: { ...request.target, targetWeeks: 51 } })).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("supports colliding AI item IDs across selected documents with traceable preview references", async () => {
    const { db, service } = setup();
    db.database.exec("INSERT INTO documents SELECT owner_id,'doc-b','resume','Resume',lifecycle,generation,revision,'version-b',created_at,updated_at FROM documents WHERE id='doc-a'");
    db.database.exec("INSERT INTO document_versions SELECT owner_id,'doc-b','version-b','text-b',state,generation,revision,text_digest,'object-b',utf8_bytes,code_points,segments_json,parser_version,created_at FROM document_versions WHERE id='version-a'");
    db.database.exec("INSERT INTO document_text_versions SELECT owner_id,'doc-b','version-b','text-b',parser_version,text_hash,'object-b',created_at FROM document_text_versions WHERE id='text-a'");
    db.database.exec("INSERT INTO document_confirmations(owner_id,document_id,document_version_id,id,text_version_id,review_revision,revision,origin,state,items_json,created_at) SELECT owner_id,'doc-b','version-b','confirmation-b','text-b',review_revision,revision,origin,state,items_json,created_at FROM document_confirmations WHERE id='confirmation-a'");
    db.database.exec("INSERT INTO material_selection_entries VALUES ('owner-a','selection-a','resume','doc-b','version-b','confirmation-b')");
    const result = await service.create("owner-a", materialContextRequest());
    expect(result.preview.confirmedItems).toHaveLength(2);
    expect(new Set(result.preview.confirmedItems.map(item => item.id)).size).toBe(2);
    expect(result.preview.itemReferences?.map(ref => ref.itemId)).toEqual(["confirmed-a", "confirmed-a"]);
  });
  it("rejects changed selection, deleted sources and expired credentials before returning private data", async () => {
    const { db, service, advance } = setup(); const result = await service.create("owner-a", materialContextRequest());
    db.database.exec("UPDATE material_selections SET revision=1");
    await expect(service.read("owner-a", result.contextVersionId)).rejects.toMatchObject({ code: "CONFLICT" });
    db.database.exec("UPDATE material_selections SET revision=0"); advance();
    await expect(service.read("owner-a", result.contextVersionId)).rejects.toMatchObject({ code: "CONFLICT" });
    db.database.exec("UPDATE documents SET lifecycle='revoked',generation=1");
    await expect(service.create("owner-a", materialContextRequest())).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
