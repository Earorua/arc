import { chromium } from '../../work/ui-tools/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = process.argv[2], label = process.argv[3] || 'final';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage(), errors = [], results = [];
let current = '';
page.on('pageerror', e => errors.push({ current, url: page.url(), message: e.message }));
for (let round = 0; round < 3; round++) {
  for (const route of ['/', '/today', '/path', '/stack', '/proof', '/history', '/coach', '/setup', '/sign-in', '/method', '/showcase', '/admin']) {
    current = route;
    const response = await page.goto('http://127.0.0.1:4181' + route, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    results.push({ round, route, heading: await page.getByRole('heading', { level: 1 }).first().textContent() });
  }
}
current = '/setup draft reload';
await page.goto('http://127.0.0.1:4181/setup', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: '继续', exact: true }).click();
await page.getByRole('radio', { name: '不确定', exact: true }).first().check();
await page.reload({ waitUntil: 'networkidle' });
assert.equal(await page.getByRole('radio', { name: '不确定', exact: true }).first().isChecked(), true);
await writeFile(out + '/ssr-hydration-' + label + '.json', JSON.stringify({ label, builtSSR: true, syntheticGuestAPIs: true, results, errors }, null, 2));
await browser.close();
console.log(JSON.stringify({ views: results.length + 1, errors }));
if (errors.length) process.exitCode = 1;

