import { createMaterialsD1, materialsClock, seedUser } from "./materials-d1";
import { createDocumentServices } from "../../app/server/documents/service";
import { memoryBucket } from "./document-bucket";
const databases: ReturnType<typeof createMaterialsD1>[] = [];
export function closeMaterialsFixtures() {
    for (const db of databases.splice(0))
        db.close();
}
export function setup() {
    const db = createMaterialsD1();
    databases.push(db);
    seedUser(db, "owner-a");
    seedUser(db, "owner-b");
    const bucket = memoryBucket();
    let n = 0;
    const services = createDocumentServices({ db: db as unknown as D1Database, bucket, clock: materialsClock, id: () => `id-${++n}` });
    return { db, bucket, services, owner: { ownerId: "owner-a" } };
}
