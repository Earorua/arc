import type { SqliteD1 } from "./sqlite-d1";
import { seedUser } from "./sqlite-d1";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { PlanningSourceResolver } from "../../app/server/planning/source-resolver";

export const materialNow = () => new Date("2026-11-04T08:00:00.000Z");
export const materialSourceResolver = () => new PlanningSourceResolver({ intelligence: { getPublished: async () => flagshipBlueprint }, flagshipRegistry: flagshipUnitRegistry });
export function materialContextRequest() {
  return {
    selectionRef: { selectionId: "selection-a", selectionRevision: 0 }, scope: { kind: "draft" as const, draftId: "draft-a", previousGoalId: null },
    source: { source: "flagship" as const, roleId: "ai-native-full-stack-engineer" as const },
    audit: { id: "audit-a", schemaVersion: "2026.08.1" as const, blueprintId: flagshipBlueprint.id, blueprintVersion: flagshipBlueprint.version, answers: flagshipBlueprint.skills.map(s => ({ skillId: s.id, level: "conceptual" as const, evidenceRefs: [] })), evidence: [], createdBy: "owner-a", inputFingerprint: "audit-fingerprint" },
    availability: { id: "availability-a", schemaVersion: "2026.08.1" as const, timeZone: "UTC", weekdays: { monday: 60, tuesday: 60, wednesday: 60, thursday: 60, friday: 60, saturday: 60, sunday: 60 }, exceptions: [], weeklyMinutes: 420, inputFingerprint: "availability-fingerprint" },
    target: { id: "target-a", schemaVersion: "2026.08.1" as const, targetWeeks: 52, inputFingerprint: "target-fingerprint" }, planningDate: "2026-11-04", selectedScope: "full-scope" as const, mutationId: "context-mutation-a",
  };
}
export function seedMaterialSelection(db: SqliteD1, scope: unknown = materialContextRequest().scope) {
  seedUser(db, "owner-a"); seedUser(db, "owner-b");
  db.database.prepare("INSERT INTO career_goals(id,user_id,role_id,level,weekly_minutes,target_weeks,status,active_slot,created_at,updated_at) VALUES ('goal-a','owner-a','ai-native-full-stack-engineer','beginner',420,52,'active',1,0,0)").run();
  db.database.prepare("INSERT INTO documents(owner_id,id,kind,display_name,current_document_version_id,created_at,updated_at) VALUES ('owner-a','doc-a','jd','PRIVATE-MATERIAL-SENTINEL-7f91','version-a',0,0)").run();
  db.database.prepare("INSERT INTO document_versions(owner_id,document_id,id,text_version_id,state,generation,revision,text_digest,object_key,utf8_bytes,code_points,segments_json,parser_version,created_at) VALUES ('owner-a','doc-a','version-a','text-a','ready',0,0,?,'object-a',5,5,'[]','2026.11.1',0)").run("a".repeat(64));
  db.database.prepare("INSERT INTO document_text_versions(owner_id,document_id,document_version_id,id,parser_version,text_hash,object_key,created_at) VALUES ('owner-a','doc-a','version-a','text-a','2026.11.1',?,'object-a',0)").run("a".repeat(64));
  const item = { id: "confirmed-a", kind: "requirement", text: flagshipBlueprint.skills.at(-1)!.id, origin: "user", sourceRef: null, requirementLevel: "must" };
  db.database.prepare("INSERT INTO document_confirmations(owner_id,document_id,document_version_id,id,text_version_id,review_revision,revision,origin,state,items_json,created_at) VALUES ('owner-a','doc-a','version-a','confirmation-a','text-a',0,0,'manual','active',?,0)").run(JSON.stringify([item]));
  db.database.prepare("INSERT INTO material_selections(owner_id,id,scope_json,revision,state,created_at,updated_at) VALUES ('owner-a','selection-a',?,0,'active',0,0)").run(JSON.stringify(scope));
  db.database.prepare("INSERT INTO material_selection_entries(owner_id,selection_id,slot,document_id,document_version_id,confirmation_id) VALUES ('owner-a','selection-a','jd','doc-a','version-a','confirmation-a')").run();
}
