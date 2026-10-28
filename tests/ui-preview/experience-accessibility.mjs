import { chromium } from '../../work/ui-tools/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Isolated, actual page components; no business writes or external provider calls.
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const origin = 'http://127.0.0.1:4180';
const results = [];
async function check(name, run) {
  try { await run(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) }); }
}
await check('Keyboard can skip navigation and see a focused primary destination', async () => {
  await page.goto(origin + '/today', { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').textContent(), '跳到主要内容');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'main-content');
  await page.getByRole('link', { name: '学习路线', exact: true }).focus();
  const style = await page.locator(':focus').evaluate(e => ({ width: getComputedStyle(e).outlineWidth, style: getComputedStyle(e).outlineStyle }));
  assert.notEqual(style.style, 'none'); assert.notEqual(style.width, '0px');
  await page.keyboard.press('Enter'); await page.waitForURL('**/path');
});
await check('Proof keyboard detail returns focus to its original list trigger', async () => {
  await page.goto(origin + '/proof');
  const first = page.locator('.proof-list-item').first(); await first.focus();
  const title = await first.textContent();
  await page.keyboard.press('Enter'); await page.getByRole('button', { name: '返回作品列表' }).waitFor();
  await page.getByRole('button', { name: '返回作品列表' }).focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.classList.contains('proof-list-item'));
  assert.equal(await page.locator(':focus').textContent(), title);
});
await check('Reduced-motion preference disables workspace animation and transitions', async () => {
  await page.goto(origin + '/today', { waitUntil: 'networkidle' });
  const moving = await page.locator('.workspace-shell').evaluate(root => [...root.querySelectorAll('*')].filter(e => {
    const s = getComputedStyle(e);
    return (s.animationName !== 'none' && s.animationDuration.split(',').some(n => parseFloat(n) > 0)) || s.transitionDuration.split(',').some(n => parseFloat(n) > 0);
  }).length);
  assert.equal(moving, 0);
});
await page.setViewportSize({ width: 390, height: 844 });
await check('Mobile time editor cancel and submit remain uncovered by the companion', async () => {
  await page.goto(origin + '/setup?mode=edit&section=time');
  const actions = page.locator('.setup-actions :is(button,a)');
  assert.ok(await actions.count() >= 2);
  for (const action of await actions.all()) {
    await action.scrollIntoViewIfNeeded();
    assert.ok(await action.evaluate(e => {
      const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit === e || e.contains(hit);
    }));
  }
});
for (const route of ['/path', '/stack', '/proof', '/coach']) {
  await check(`Long visible titles wrap without overflow: ${route}`, async () => {
    await page.goto(origin + route);
    await page.locator('h1').first().evaluate(e => { e.textContent = '面向复杂跨团队研究与数据产品的全栈人工智能学习方向 · ExtremelyLongUnbrokenEnglishResourceNameForLayoutVerification'; });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  });
}
await writeFile(process.argv[2] + '/accessibility-results.json', JSON.stringify(results, null, 2));
await browser.close(); console.log(JSON.stringify(results, null, 2));
if (results.some(r => !r.passed)) process.exitCode = 1;
