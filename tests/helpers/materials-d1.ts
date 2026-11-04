import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { SqliteD1 } from "./sqlite-d1";
export { seedUser } from "./sqlite-d1";
export const materialsClock = () => new Date("2026-11-04T00:00:00.000Z");
export function applyDocumentExecutorMigrations(db: SqliteD1) {
    const directory = resolve("worker/document-executor/migrations");
    for (const file of readdirSync(directory).filter(name => /^\d{4}_.*\.sql$/u.test(name)).sort())
        db.database.exec(readFileSync(resolve(directory, file), "utf8"));
}
export function createMaterialsD1(filename = ":memory:", through = 15): SqliteD1 {
    const db = new SqliteD1(filename);
    db.database.exec("PRAGMA foreign_keys=ON");
    for (const file of readdirSync(resolve("drizzle")).filter((name) => /^\d{4}_.*\.sql$/u.test(name) && Number(name.slice(0, 4)) <= through).sort()) {
        db.database.exec(readFileSync(resolve("drizzle", file), "utf8").replaceAll("--> statement-breakpoint", ";"));
    }
    return db;
}
