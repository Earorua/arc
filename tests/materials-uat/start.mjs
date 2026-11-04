import { createServer } from "node:http";
import { createOfflineVite, allowsOfflineAsset } from "../offline-uat/server.mjs";
const port = 4186, origin = `http://127.0.0.1:${port}`;
const vite = await createOfflineVite({ optimizeDeps: { entries: ["tests/materials-uat/main.tsx"] } });
const { createMaterialsUat } = await vite.ssrLoadModule("/tests/materials-uat/composition.ts");
const app = createMaterialsUat(origin); let owner = "owner-a"; let outbound = 0;
globalThis.fetch = async () => { outbound++; throw new Error("Offline UAT blocks outbound fetch"); };
const server = createServer(async (req, res) => {
  try {
    if (req.headers.host !== `127.0.0.1:${port}`) { res.writeHead(403); res.end(); return; }
    const url = new URL(req.url, origin);
    if (req.method !== "GET" && req.headers.origin !== origin) { res.writeHead(403); res.end(); return; }
    if (url.pathname.startsWith("/api/") || url.pathname === "/__materials/control" || url.pathname === "/__materials/stats") {
      const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > 524288) throw new Error("Oversized"); chunks.push(chunk); }
      const request = new Request(url, { method: req.method, headers: req.headers, ...(req.method === "GET" ? {} : { body: Buffer.concat(chunks) }) });
      let response;
      if (url.pathname === "/__materials/control") {
        const input = await request.json();
        if (["owner-a", "owner-b"].includes(input.owner)) owner = input.owner;
        else if (["success", "failure", "unknown", "disabled"].includes(input.mode)) app.setMode(input.mode);
        else if (input.maintain === true) await app.maintain();
        else throw new Error("Invalid control");
        response = Response.json({ ok: true });
      } else if (url.pathname === "/__materials/stats") response = Response.json({ ...app.stats(), outbound });
      else response = await app.fetch(request, owner);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    if (url.pathname === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:*; img-src 'self' data:");
      res.end(await vite.transformIndexHtml("/", '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>资料阶段 1 离线验收</title></head><body><div id="root"></div><script type="module" src="/tests/materials-uat/main.tsx"></script></body></html>')); return;
    }
    if (url.pathname !== "/tests/materials-uat/main.tsx" && !allowsOfflineAsset(url.pathname, vite.config.cacheDir)) { res.writeHead(404); res.end(); return; }
    vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
  } catch { res.writeHead(500); res.end("Offline fixture error"); }
});
server.listen(port, "127.0.0.1", () => console.log(`Materials offline UI: ${origin}; no provider transport; outbound fetch blocked.`));
process.on("SIGINT", async () => { server.close(); await app.close(); await vite.close(); process.exit(0); });
