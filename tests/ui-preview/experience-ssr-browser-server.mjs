import { createServer } from 'node:http';
import { register } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';

register('../cloudflare-workers-loader.mjs', import.meta.url);
const root = resolve(process.argv[2] || 'dist');
const { default: worker } = await import(pathToFileURL(resolve(root, 'server/index.js')).href);
const types = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const assetRoot = resolve(root, 'client');
async function asset(pathname) {
  const path = resolve(assetRoot, '.' + pathname);
  if (!path.startsWith(assetRoot + sep)) return new Response('Not found', { status: 404 });
  try {
    const body = await readFile(path);
    return new Response(body, { headers: { 'Content-Type': types[path.slice(path.lastIndexOf('.'))] || 'application/octet-stream' } });
  } catch { return new Response('Not found', { status: 404 }); }
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:4181');
    let response;
    // Exercise actual production SSR and hydration with deterministic guest APIs.
    if (url.pathname === '/api/auth/get-session') response = Response.json(null);
    else if (url.pathname.startsWith('/api/')) response = Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, { status: 401 });
    else if (url.pathname.startsWith('/assets/') || /\.(?:svg|png|jpg|ico|woff2)$/.test(url.pathname)) response = await asset(url.pathname);
    else response = await worker.fetch(new Request(url, { headers: { accept: 'text/html' } }),
      { ASSETS: { fetch: request => asset(new URL(request.url).pathname) } }, { waitUntil() {}, passThroughOnException() {} });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch (error) { res.writeHead(500); res.end('SSR verification server failed: ' + error.message); }
});
server.listen(4181, '127.0.0.1', () => console.log('Actual built SSR preview: http://127.0.0.1:4181; synthetic guest APIs only.'));

