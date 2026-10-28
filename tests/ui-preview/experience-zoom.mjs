import { chromium } from '../../work/ui-tools/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// A private browser profile and local-only extension set the actual tab zoom.
// No CSS zoom, device-scale substitution, real account or service writes.
const out = process.argv[2];
const extension = resolve('work/zoom-verification-extension');
await mkdir(extension, { recursive: true });
await writeFile(extension + '/manifest.json', JSON.stringify({
  manifest_version: 3, name: 'Arc isolated zoom verification', version: '1.0',
  host_permissions: ['http://127.0.0.1/*'], background: { service_worker: 'worker.js' },
}));
await writeFile(extension + '/worker.js', 'chrome.runtime.onInstalled.addListener(() => {});');
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
const page = await context.newPage();
const origin = 'http://127.0.0.1:4180';
await page.goto(origin + '/today', { waitUntil: 'networkidle' });
const zoom = await worker.evaluate(async () => {
  const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1/*' });
  await chrome.tabs.setZoom(tab.id, 2);
  return chrome.tabs.getZoom(tab.id);
});
assert.equal(zoom, 2);
await page.waitForFunction(() => innerWidth === 720);
const results = [];
for (const route of ['/', '/today', '/path', '/stack', '/proof?compose=1', '/coach', '/history', '/setup', '/setup?mode=edit&section=time', '/sign-in', '/method', '/showcase', '/admin', '/not-found']) {
  await page.goto(origin + route, { waitUntil: 'networkidle' });
  const metrics = await page.evaluate(() => ({
    viewport: innerWidth, devicePixelRatio,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    inputs: [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]),textarea,select')]
      .filter(e => e.checkVisibility()).map(e => parseFloat(getComputedStyle(e).fontSize)),
  }));
  results.push({ route, zoom, ...metrics });
  assert.equal(metrics.viewport, 720);
  assert.equal(metrics.overflow, false, route);
  assert.ok(metrics.inputs.every(size => size >= 16), route);
}
await page.goto(origin + '/proof?compose=1', { waitUntil: 'networkidle' });
const input = page.locator('.proof-editor input:not([type=checkbox]):not([type=radio]):not([type=file])').first();
await input.fill('200% 缩放下的作品标题');
assert.equal(await input.inputValue(), '200% 缩放下的作品标题');
await input.press('Tab');
assert.ok(await page.locator(':focus').evaluate(e => {
  const r = e.getBoundingClientRect();
  return r.top >= 0 && r.bottom <= innerHeight;
}));
await page.screenshot({ path: out + '/actual-zoom-200-proof.jpg' });
await page.goto(origin + '/setup', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: '继续', exact: true }).click();
await page.getByRole('radio', { name: '不确定', exact: true }).first().check();
await page.getByRole('button', { name: '继续', exact: true }).click();
await page.getByLabel('每周可用分钟', { exact: true }).fill('600');
await page.getByRole('button', { name: '继续', exact: true }).click();
await page.getByRole('button', { name: '创建路线', exact: true }).waitFor();
await page.screenshot({ path: out + '/actual-zoom-200-setup-confirm.jpg' });
await writeFile(out + '/actual-zoom-results.json', JSON.stringify({ zoom, views: results, inputAndSetupFlow: true }, null, 2));
await context.close();
console.log(JSON.stringify({ actualZoom: zoom, views: results.length, inputAndSetupFlow: true }));

