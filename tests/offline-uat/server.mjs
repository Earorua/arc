import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { randomBytes } from "node:crypto";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(harnessRoot, "../..");
const normalize = (path) => path.replaceAll("\\", "/");
export function offlineAliases() {
  const client = normalize(resolve(workspace, "app/lib/auth-client"));
  const authRuntime = normalize(resolve(workspace, "app/server/auth/runtime"));
  return {
    name: "arc-offline-exact-aliases", enforce: "pre",
    resolveId(source, importer) {
      if (source === "next/link" || source === "next/navigation") return resolve(harnessRoot, "browser-runtime.tsx");
      if (source === "cloudflare:workers") return resolve(harnessRoot, "runtime-unavailable.ts");
      if (importer && source.startsWith(".")) {
        const target = normalize(resolve(dirname(importer.split("?")[0]), source)).replace(/\.(?:tsx?|jsx?)$/u, "");
        if (target === client) return resolve(harnessRoot, "browser-runtime.tsx");
        if (target === authRuntime) return resolve(harnessRoot, "runtime-unavailable.ts");
      }
    },
  };
}
export async function createOfflineVite(extra = {}) {
  return createServer({ configFile: false, envFile: false, envDir: false, root: workspace,
    publicDir: false, cacheDir: await mkdtemp(resolve(tmpdir(), "arc-v8-offline-vite-")),
    optimizeDeps: { entries: [resolve(harnessRoot, "main.tsx")] },
    plugins: [offlineAliases(), react()],
    server: { middlewareMode: true, watch: null, cors: false, fs: { strict: true, allow: [workspace], deny: ["**/.env*", "**/.git/**", "**/.codex/**", "**/.agents/**"] } },
    ...extra,
  });
}

export async function createHarnessServer({ port = 4179 } = {}) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid offline port");
  const origin = `http://127.0.0.1:${port}`;
  const nonce = randomBytes(24).toString("hex");
  let app;
  let database;
  let owner = "owner-a";
  let resetting = false;
  const requests = new Set();
  let security;
  let compose;
  let createDb;
  let outboundDenials = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { outboundDenials++; throw new Error("Offline server blocks outbound application fetch"); };
  async function send(response, result) {
    response.statusCode = result.status;
    result.headers.forEach((value, name) => response.setHeader(name, value));
    response.end(Buffer.from(await result.arrayBuffer()));
  }
  async function reset() {
    resetting = true;
    try { await app?.dispose(); await Promise.allSettled([...requests]); database?.close(); database = createDb(); app = await compose(database, origin); }
    finally { resetting = false; }
  }
  const control = async (request) => {
    const input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) return Response.json({ error: "Invalid control" }, { status: 400 });
    if (input.action === "reset") await reset();
    else if (input.action === "owner" && [null, "owner-a", "owner-b"].includes(input.owner)) owner = input.owner;
    else if (input.action === "configure") {
      const allowed = new Set(["action", "mode", "disabled", "exhausted"]);
      if (Object.keys(input).some((key) => !allowed.has(key))) return Response.json({ error: "Invalid control" }, { status: 400 });
      app.configure(input);
    } else if (input.action === "prestart" && owner && ["researching", "validating"].includes(input.stage)) await app.prestart(owner, input.stage);
    else if (input.action === "resume") await app.resume();
    else return Response.json({ error: "Invalid control" }, { status: 400 });
    return Response.json({ ok: true });
  };
  const middleware = {
    name: "arc-offline-http-boundary",
    configureServer(vite) {
      vite.middlewares.use(async (incoming, outgoing, next) => {
        outgoing.setHeader("Cache-Control", "no-store");
        outgoing.setHeader("X-Content-Type-Options", "nosniff");
        outgoing.setHeader("Referrer-Policy", "no-referrer");
        outgoing.setHeader("Content-Security-Policy", `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:${port}; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
        try {
          if (!security || resetting) { outgoing.statusCode = 503; outgoing.end("Offline harness initializing"); return; }
          const method = incoming.method ?? "GET";
          const headers = new Headers();
          for (const [name, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(",") : value);
          const boundaryRequest = new Request(new URL(incoming.url ?? "/", origin), { method, headers });
          if (!security.allowsHarnessRequest(boundaryRequest, origin, nonce)) { outgoing.statusCode = 403; outgoing.end("Offline origin boundary rejected request"); return; }
          const path = new URL(boundaryRequest.url).pathname;
          if (path.startsWith("/api/") || path.startsWith("/__uat/")) {
            const chunks = []; let bytes = 0;
            for await (const chunk of incoming) {
              bytes += chunk.length;
              if (bytes > 4 * 1024 * 1024) { outgoing.statusCode = 413; outgoing.end("Offline request too large"); return; }
              chunks.push(chunk);
            }
            headers.delete("x-arc-uat-owner");
            if (owner) headers.set("x-arc-uat-owner", owner);
            const body = Buffer.concat(chunks);
            const request = new Request(boundaryRequest.url, { method, headers, ...(method === "GET" || method === "HEAD" ? {} : { body }) });
            if (path === "/__uat/state" && method === "GET") return await send(outgoing, Response.json({ owner, ...await app.diagnostics(), serverOutboundDenials: outboundDenials }));
            if (path === "/__uat/control" && method === "POST") return await send(outgoing, await control(request));
            if (path.startsWith("/__uat/")) return await send(outgoing, Response.json({ error: "Unknown offline control" }, { status: 404 }));
            const pending = app.dispatch(request);
            requests.add(pending);
            try { return await send(outgoing, await pending); }
            finally { requests.delete(pending); }
          }
          if (method !== "GET" && method !== "HEAD") { outgoing.statusCode = 405; outgoing.end(); return; }
          if (["/", "/setup", "/path", "/today", "/stack", "/proof", "/sign-in", "/__uat"].includes(path)) {
            const html = (await readFile(resolve(harnessRoot, "index.html"), "utf8")).replace("__CONTROL_NONCE__", nonce);
            outgoing.setHeader("Content-Type", "text/html; charset=utf-8"); outgoing.end(await vite.transformIndexHtml(path, html)); return;
          }
          const decoded = decodeURIComponent(path);
          const denied = /(?:^|\/)\.(?:env[^/]*|git|codex|agents)(?:\/|$)/u.test(decoded)
            || /(?:^|\/)(?:wrangler[^/]*|vite\.config[^/]*|package(?:-lock)?\.json)$/u.test(decoded);
          const cacheAsset = decoded.startsWith(`/@fs/${normalize(vite.config.cacheDir)}/`);
          const allowed = cacheAsset || decoded.startsWith("/app/") || decoded.startsWith("/node_modules/") || decoded.startsWith("/tests/offline-uat/") || decoded.startsWith("/@vite/") || decoded === "/@react-refresh" || decoded.startsWith("/@id/");
          if (denied || !allowed || decoded.includes("/../") || decoded.includes("\\") || decoded.startsWith("/app/server/") && !["/app/server/auth/policy.ts", "/app/server/account-link/contracts.ts"].includes(decoded)) {
            outgoing.statusCode = 404; outgoing.end("Offline asset not available"); return;
          }
          next();
        } catch (error) { outgoing.statusCode = 400; outgoing.setHeader("Content-Type", "application/json"); outgoing.end(JSON.stringify({ error: error instanceof Error && /^Run completed before pause/u.test(error.message) ? error.message : "Offline request rejected" })); }
      });
    },
  };
  let vite;
  try {
    vite = await createOfflineVite({ plugins: [middleware, offlineAliases(), react()], server: {
      host: "127.0.0.1", port, strictPort: true, cors: false, allowedHosts: ["127.0.0.1"],
      fs: { strict: true, allow: [workspace], deny: ["**/.env*", "**/.git/**", "**/.codex/**", "**/.agents/**"] },
    } });
    security = await vite.ssrLoadModule("/tests/offline-uat/security.ts");
    ({ createOfflineComposition: compose } = await vite.ssrLoadModule("/tests/offline-uat/composition.ts"));
    ({ createResearchD1: createDb } = await vite.ssrLoadModule("/tests/helpers/sqlite-d1.ts"));
    await reset(); await vite.listen();
    return { origin, vite, get app() { return app; }, close: async () => { await app?.dispose(); await Promise.allSettled([...requests]); await vite.close(); database?.close(); globalThis.fetch = originalFetch; } };
  } catch (error) { await vite?.close(); database?.close(); globalThis.fetch = originalFetch; throw error; }
}
