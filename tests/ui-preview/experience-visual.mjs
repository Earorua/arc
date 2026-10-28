import { chromium } from '../../work/ui-tools/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const out = process.argv[2];
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
for (const [width, height, device] of [[1440, 1000, 'desktop'], [390, 844, 'mobile']]) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  for (const route of ['/', '/today', '/path', '/stack', '/proof', '/proof?compose=1', '/coach', '/history', '/setup', '/setup?mode=edit&section=time', '/sign-in', '/method', '/showcase', '/admin', '/not-found', '/today?guest=1']) {
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:4180${route}`, { waitUntil: 'networkidle' });
    await page.locator('h1').first().waitFor({ timeout: 10000 }).catch(() => {});
    await page.screenshot({ path: `${out}/${device}-${route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'}.jpg`, fullPage: true, type: 'jpeg', quality: 78 });
    results.push({ device, route, errors, ...await page.evaluate(() => ({ title: document.querySelector('h1')?.textContent, overflow: document.documentElement.scrollWidth > innerWidth + 1, headings: [...document.querySelectorAll('h1')].map(e => e.textContent), nav: (() => { const n=document.querySelector('.workspace-bottom-nav')?.getBoundingClientRect(); return n ? { top:n.top, bottom:n.bottom, viewport:innerHeight } : null; })() })) });
    await page.close();
  }
  await context.close();
}
await writeFile(`${out}/visual-results.json`, JSON.stringify(results, null, 2));
await browser.close();
const issues = results.filter(r => r.errors.length || r.overflow || r.headings.length !== 1 || (r.device === 'mobile' && r.nav && Math.abs(r.nav.bottom - r.nav.viewport) > 1));
console.log(JSON.stringify({ views: results.length, issues }, null, 2));
if (issues.length) process.exitCode = 1;
