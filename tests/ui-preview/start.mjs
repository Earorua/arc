import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const normalized = path => path.replaceAll("\\", "/").replace(/\.(tsx?|jsx?)$/, "");
const aliases = new Map([
  [normalized(resolve(root, "app/lib/auth-client")), resolve(root, "tests/offline-uat/browser-runtime.tsx")],
  [normalized(resolve(root, "app/lib/agent-client")), resolve(here, "clients.ts")],
  [normalized(resolve(root, "app/lib/use-planning-workspace")), resolve(here, "clients.ts")],
]);
const server = await createServer({
  configFile: false, envFile: false, envDir: false, root, publicDir: false,
  cacheDir: resolve(root, "work/ui-preview-cache"),
  optimizeDeps: { entries: [resolve(here, "main.tsx")] },
  plugins: [{ name: "local-visual-fixtures", enforce: "pre", resolveId(source, importer) {
    if (source === "next/link" || source === "next/navigation") return resolve(root, "tests/offline-uat/browser-runtime.tsx");
    if (importer && source.startsWith(".")) return aliases.get(normalized(resolve(dirname(importer.split("?")[0]), source)));
  }, configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const path = request.url?.split("?")[0] ?? "/";
      if (path.startsWith("/api/") || path.startsWith("/__uat/")) { response.statusCode = 404; response.end(); return; }
      if (["/", "/today", "/path", "/stack", "/proof", "/coach"].includes(path)) {
        response.setHeader("Content-Type", "text/html");
        response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:4180; img-src 'self' data:; font-src 'self'");
        response.end(await server.transformIndexHtml(path, '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Arc · 本地 UI 预览</title></head><body><div id="root"></div><script type="module" src="/tests/ui-preview/main.tsx"></script></body></html>')); return;
      }
      next();
    });
  } }, react()],
  server: { host: "127.0.0.1", port: 4180, strictPort: true, fs: { strict: true, allow: [root], deny: ["**/.env*", "**/.git/**", "**/.codex/**", "**/.agents/**"] } },
});
await server.listen();
console.log("Synthetic UI preview: http://127.0.0.1:4180/today — no production services.");
