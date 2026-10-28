import { chromium } from '../../work/ui-tools/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const out = process.argv[2];
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const origin = 'http://127.0.0.1:4180';
const results = [];
async function check(name, run) {
  try { await run(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) }); }
}
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(8000);

await check('Existing goal with unavailable research gives an honest recovery instead of disabled Continue', async () => {
  await page.goto(origin + '/setup?mode=create', { waitUntil: 'networkidle' });
  await page.getByRole('textbox', { name: '自定义岗位' }).fill('AI 工程师');
  await page.getByText('岗位研究暂不可用，当前无法创建新路线。你的现有计划与学习记录会继续保留。').waitFor();
  assert.equal(await page.getByRole('button', { name: '继续', exact: true }).count(), 0);
  assert.equal(await page.locator('.custom-role-disclosure').count(), 0);
  await page.getByRole('button', { name: '重新检查岗位研究' }).click();
  await page.getByText('岗位研究暂不可用，当前无法创建新路线。你的现有计划与学习记录会继续保留。').waitFor();
  await page.screenshot({ path: out + '/mobile-setup-research-unavailable.jpg', fullPage: true });
  await page.getByRole('link', { name: '返回学习路线', exact: true }).click();
  await page.waitForURL('**/path');
});
await check('Four setup steps restore uncertainty, URL and browser Back', async () => {
  await page.goto(origin + '/setup', { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('step') === 'foundation');
  assert.equal(await page.locator('.adaptive-setup-flow .setup-step-names li').count(), 4);
  await page.getByRole('radio', { name: '不确定', exact: true }).first().check();
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.getByRole('radio', { name: '不确定', exact: true }).first().isChecked(), true);
  await page.screenshot({ path: out + '/mobile-setup-foundation.jpg', fullPage: true });
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('step') === 'time');
  await page.getByLabel('每周可用分钟', { exact: true }).fill('600');
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('step') === 'confirm');
  await page.getByRole('heading', { name: '确认你的学习路线。' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '创建路线', exact: true }).count(), 1);
  await page.screenshot({ path: out + '/mobile-setup-confirm.jpg', fullPage: true });
  await page.goBack();
  await page.waitForURL(url => url.searchParams.get('step') === 'time');
  assert.equal(await page.getByLabel('每周可用分钟', { exact: true }).inputValue(), '600');
});
await check('Today resources collapse on phone and current skill returns to Today', async () => {
  await page.goto(origin + '/today', { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.today-resource-disclosure').getAttribute('open'), null);
  await page.locator('.today-resource-disclosure > summary').click();
  assert.notEqual(await page.locator('.today-resource-disclosure').getAttribute('open'), null);
  const href = await page.getByRole('link', { name: '查看当前技能与资料' }).getAttribute('href');
  const skill = new URL(href, origin).searchParams.get('skill');
  assert.ok(skill);
  await page.getByRole('link', { name: '查看当前技能与资料' }).click();
  await page.waitForURL(url => url.pathname === '/stack' && url.searchParams.get('skill') === skill);
  assert.equal(await page.getByRole('link', { name: '继续今日学习', exact: true }).getAttribute('href'), '/today');
  await page.getByRole('link', { name: '返回今日学习', exact: true }).click();
  await page.waitForURL('**/today');
});
await check('Stack proof round trip restores original filters and focus', async () => {
  await page.goto(origin + '/stack?scope=all&category=quality&q=testing&skill=testing', { waitUntil: 'networkidle' });
  await page.locator('.skill-audit > summary').click();
  const evidence = page.locator('.skill-proof-link a');
  const destination = new URL(await evidence.getAttribute('href'), origin);
  const source = destination.searchParams.get('returnTo');
  assert.ok(source.includes('scope=all') && source.includes('category=quality') && source.includes('q=testing') && source.includes('skill=testing'));
  await evidence.click();
  await page.getByRole('link', { name: '返回原技能', exact: true }).click();
  await page.waitForURL(origin + source);
  await page.waitForFunction(() => document.activeElement?.closest('.skill-proof-link') !== null);
  assert.notEqual(await page.locator('.skill-audit').getAttribute('open'), null);
  await page.screenshot({ path: out + '/mobile-stack-restored.jpg', fullPage: true });
});
await check('History shows real counts and prioritizes returning to its list', async () => {
  await page.goto(origin + '/history', { waitUntil: 'networkidle' });
  await page.locator('.history-progress').waitFor();
  assert.match(await page.locator('.history-progress').textContent(), /已完成 \d+ \/ \d+ 个学习单元/);
  await page.getByRole('button', { name: /查看 数据产品经理/ }).click();
  assert.equal(await page.getByRole('button', { name: '返回历史列表', exact: true }).count(), 1);
  assert.equal(await page.locator('.history-current-return').getByRole('link').getAttribute('href'), '/path');
  assert.equal(await page.getByRole('link', { name: '去做当前任务' }).count(), 0);
});
await check('Companion uses header help, preserves page position and keeps controls visible on short screens', async () => {
  await page.goto(origin + '/today', { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.companion-launcher').isVisible(), false);
  await page.evaluate(() => window.scrollTo(0, 600));
  const y = await page.evaluate(() => scrollY);
  // Click the visible sticky header at its screen position. Locator.click scrolls
  // its normal-flow box into view first, moving the page before the user action.
  const trigger = await page.getByRole('button', { name: '打开学习伙伴', exact: true }).boundingBox();
  assert.ok(trigger && trigger.y >= 0 && trigger.y + trigger.height <= 844);
  await page.mouse.click(trigger.x + trigger.width / 2, trigger.y + trigger.height / 2);
  assert.equal(await page.locator('.companion-suggestions button').count(), 2);
  await page.getByRole('textbox', { name: '向学习伙伴提问' }).fill('我想调整晚上的安排');
  await page.screenshot({ path: out + '/mobile-companion.jpg' });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.hasAttribute('data-companion-trigger'));
  assert.equal(await page.locator('[data-companion-trigger]').evaluate(e => e === document.activeElement), true);
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - y) <= 1);
  await page.setViewportSize({ width: 390, height: 420 });
  await page.getByRole('button', { name: '打开学习伙伴', exact: true }).click();
  await page.getByRole('button', { name: '发送消息', exact: true }).scrollIntoViewIfNeeded();
  assert.ok(await page.getByRole('button', { name: '发送消息', exact: true }).evaluate(e => { const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e === hit || e.contains(hit); }));
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
});
await check('Account motion preference applies to the full site and logged-in home actions continue learning', async () => {
  await page.goto(origin + '/today', { waitUntil: 'networkidle' });
  await page.locator('.account-menu > summary').click();
  await page.getByText('学习偏好', { exact: true }).click();
  await page.getByRole('checkbox', { name: '减少动效', exact: true }).check();
  assert.ok(await page.locator('html').evaluate(e => e.classList.contains('reduce-motion')));
  await page.locator('.account-menu > summary').click();
  await page.getByRole('link', { name: 'Arc. 首页', exact: true }).click();
  await page.waitForURL(origin + '/');
  assert.equal(await page.locator('.discovery-hero-actions .primary-action').textContent().then(t => t.includes('继续学习')), true);
  assert.equal(await page.locator('.discovery-finale-actions .primary-action').getAttribute('href'), '/today');
});
await context.close();
await browser.close();
await writeFile(out + '/completion-flow-results.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
if (results.some(result => !result.passed)) process.exitCode = 1;
