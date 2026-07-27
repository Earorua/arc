import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { register } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

register("./cloudflare-workers-loader.mjs", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Arc landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Arc\./);
  assert.match(html, /Learn only what moves you forward/);
  assert.match(html, /Build my precise path/);
  assert.match(html, /property="og:image" content="https:\/\/arc-precision-path\.jiahe-xu\.chatgpt\.site\/og\.png"/);
  assert.match(html, /property="og:image:width" content="1672"/);
  assert.match(html, /property="og:image:height" content="941"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /name="twitter:image:alt" content="Arc\. — Learn only what moves you forward"/);
  const legacySentinels = [
    ["codex", "preview"].join("-"),
    ["Skeleton", "Preview"].join(""),
    ["react", "loading", "skeleton"].join("-"),
    ["Your site", "is taking shape"].join(" "),
  ];

  assert.doesNotMatch(html, new RegExp(legacySentinels.join("|"), "i"));
});

async function readBundleText(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(entries.map(async (entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? readBundleText(path) : readFile(path, "utf8");
  }));
  return contents.flat().join("\n");
}

test("keeps server secret identifiers out of the client bundle", async () => {
  const clientDirectory = fileURLToPath(new URL("../dist/client", import.meta.url));
  const bundle = await readBundleText(clientDirectory);
  for (const identifier of [
    "BETTER_AUTH_SECRET",
    "GOOGLE_CLIENT_SECRET",
    "GITHUB_CLIENT_SECRET",
    "OPENAI_API_KEY",
  ]) {
    assert.doesNotMatch(bundle, new RegExp(identifier));
  }
});
