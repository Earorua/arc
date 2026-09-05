import { createHarnessServer } from "./server.mjs";
const server = await createHarnessServer();
console.log(`Arc offline UAT: ${server.origin}/setup`);
console.log("Disposable SQLite implements D1. Fake Provider only. No environment files, OAuth, Sites, or production bindings.");
let closing = false;
async function close() { if (closing) return; closing = true; await server.close(); process.exit(0); }
process.on("SIGINT", close);
process.on("SIGTERM", close);
