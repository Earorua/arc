import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, sep } from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";

register("./cloudflare-workers-loader.mjs", import.meta.url);
const artifactRoot = process.env.ARC_RENDERED_ARTIFACT_ROOT
  ? pathToFileURL(`${resolve(process.env.ARC_RENDERED_ARTIFACT_ROOT)}${sep}`)
  : new URL("../dist/", import.meta.url);

async function render(pathname = "/") {
  const workerUrl = new URL("server/index.js", artifactRoot);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("unknown pages retain HTTP 404 and offer branded recovery navigation", async () => {
  const response = await render("/arc-unknown-page-for-404-verification");
  assert.equal(response.status, 404);
  const html = await response.text();
  assert.match(html, /We couldn(?:&#x27;|&#39;|&apos;|')t find this page\./);
  assert.match(html, /href="\/today"/);
  assert.match(html, /Back to home/);
});

test("server-renders the Arc landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Arc\./);
  assert.match(html, /Learn only what moves you forward/);
  assert.match(html, /Loading your progress/);
  assert.match(html, /<main[\s>]/);
  const document = new JSDOM(html).window.document;
  const icons = [...document.head.querySelectorAll('link[rel~="icon"]')];
  assert.ok(icons.length > 0, "the page declares a favicon");
  for (const icon of icons) {
    assert.equal(new URL(icon.getAttribute("href"), response.url || "http://localhost/").href,
      "http://localhost/favicon.svg", "the favicon comes from the deployment serving the page");
  }
  const notices = document.querySelectorAll("p.development-notice");
  const main = document.querySelector("main");
  assert.ok(main, "main content is rendered");
  assert.equal(main.querySelectorAll('a[href="/setup"]').length, 0, "server rendering must not assume no saved plan");
  assert.equal(main.querySelectorAll('.primary-action[disabled]').length, 1);
  assert.equal(main.querySelectorAll('.learning-entry-text').length, 0, "the finale must not repeat the hero learning action");
  assert.equal(notices.length, 0);
  assert.equal(document.querySelector(".skip-link")?.getAttribute("href"), "#main-content");
  assert.match(html, /aria-label="Site navigation"/);
  assert.equal(document.querySelectorAll('a[href="/method"]').length, 1, "the homepage keeps one method entry in public navigation");
  assert.equal(document.querySelector('nav a[href="/method"]')?.textContent, "Method");
  assert.equal(document.querySelector('a[href="#learning-method"]')?.textContent, "Scroll to explore");
  assert.ok(document.getElementById("learning-method"), "the scroll cue retains a valid in-page destination");
  assert.equal(document.querySelectorAll('a[href="/showcase"]').length, 1, "the homepage keeps one showcase entry in public navigation");
  assert.equal(document.querySelector('nav a[href="/showcase"]')?.textContent, "Showcase");
  assert.equal(document.querySelector('link[rel="canonical"]')?.getAttribute("href"), "https://arcmaps.net/");
  assert.equal(document.querySelector('meta[property="og:url"]')?.getAttribute("content"), "https://arcmaps.net/");
  assert.match(html, /property="og:image" content="https:\/\/arcmaps\.net\/og\.png"/);
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
  const clientDirectory = fileURLToPath(new URL("client", artifactRoot));
  const bundle = await readBundleText(clientDirectory);
  for (const identifier of [
    "BETTER_AUTH_SECRET",
    "GOOGLE_CLIENT_SECRET",
    "GITHUB_CLIENT_SECRET",
    "OPENAI_API_KEY",
    "OPENROUTER_API_KEY",
  ]) {
    assert.doesNotMatch(bundle, new RegExp(identifier));
  }
});

test("omits unused Provider usage and cost schema from built client artifacts", async () => {
  const bundle = await readBundleText(fileURLToPath(new URL("client", artifactRoot)));
  const leaked = ["promptTokens", "completionTokens", "totalTokens", "costMicros", "webSearchRequests"]
    .filter((identifier) => bundle.includes(identifier));
  assert.deepEqual(leaked, [], "Provider accounting fields belong only in the server bundle");
});

test("ships the adaptive workspace recovery and review copy without replacing the public shell", async () => {
  const clientDirectory = fileURLToPath(new URL("client", artifactRoot));
  const bundle = await readBundleText(clientDirectory);

  assert.match(bundle, /What will change/);
  assert.match(bundle, /This plan is temporarily unavailable/);
  assert.match(bundle, /Learning path/);
  assert.doesNotMatch(bundle, /self-assessment is verified/iu);
});
