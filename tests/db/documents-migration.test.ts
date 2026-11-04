// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createMaterialsD1, seedUser } from "../helpers/materials-d1";
const databases: ReturnType<typeof createMaterialsD1>[] = [];
afterEach(() => {
    for (const db of databases.splice(0))
        db.close();
});
it("adds private storage to empty and populated 0013 databases without changing prior data", () => {
    for (const old of [false, true]) {
        const db = createMaterialsD1(":memory:", old ? 13 : 14);
        databases.push(db);
        seedUser(db, "owner-a");
        if (old)
            db.database.exec(readFileSync("drizzle/0014_private_materials.sql", "utf8").replaceAll("--> statement-breakpoint", ";"));
        expect(db.database.prepare("SELECT name FROM users WHERE id='owner-a'").get()).toMatchObject({ name: "owner-a" });
        expect(db.database.prepare("SELECT count(*) AS n FROM documents").get()).toMatchObject({ n: 0 });
        expect(db.database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    }
});
it("preserves a 0014 writer without attributing a multipart capability and makes new enrollments single-use", () => {
    const db = createMaterialsD1(":memory:", 14);
    databases.push(db);
    seedUser(db, "owner-a");
    db.database.exec(`
        INSERT INTO documents(owner_id,id,kind,display_name,lifecycle,generation,revision,current_document_version_id,created_at,updated_at)
        VALUES('owner-a','doc','resume','Synthetic','active',0,0,'version',0,0);
        INSERT INTO document_versions(owner_id,document_id,id,text_version_id,state,generation,revision,text_digest,object_key,utf8_bytes,code_points,segments_json,parser_version,created_at)
        VALUES('owner-a','doc','version','text','pending',0,0,'digest','legacy',1,1,'[]','2026.11.1',0);
        INSERT INTO document_storage_operations(owner_id,id,document_id,document_version_id,object_key,generation,expected_revision,state,next_attempt_at,mutation_endpoint,mutation_id,body_digest,created_at)
        VALUES('owner-a','legacy-op','doc','version','legacy',0,0,'writing',0,'createDocument','legacy','digest',0);
    `);
    db.database.exec(readFileSync("drizzle/0015_document_storage_uploads.sql", "utf8").replaceAll("--> statement-breakpoint", ";"));
    expect(db.database.prepare("SELECT object_key,state,writer_terminated,writer_protocol,r2_upload_id FROM document_storage_operations").get()).toEqual({
        object_key: "legacy", state: "writing", writer_terminated: 0, writer_protocol: null, r2_upload_id: null
    });
    expect(() => db.database.exec("UPDATE document_storage_operations SET writer_protocol='r2-multipart-v1'")).toThrow(/immutable/u);
    expect(() => db.database.exec("UPDATE document_storage_operations SET r2_upload_id='forged'")).toThrow(/closed/u);
    db.database.exec(`INSERT INTO document_storage_operations(owner_id,id,document_id,document_version_id,object_key,generation,expected_revision,state,next_attempt_at,mutation_endpoint,mutation_id,body_digest,created_at,writer_protocol)
        VALUES('owner-a','new-op','doc','version','new-key',0,0,'writing',0,'createDocument','new','digest',0,'r2-multipart-v1')`);
    db.database.exec("UPDATE document_storage_operations SET r2_upload_id='provider-handle' WHERE id='new-op'");
    for (const assignment of ["r2_upload_id='replacement'", "r2_upload_id=NULL", "generation=2", "id='replacement-op'"])
        expect(() => db.database.exec(`UPDATE document_storage_operations SET ${assignment} WHERE id='new-op'`)).toThrow();
    expect(db.database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});
