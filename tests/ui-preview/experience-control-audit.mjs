import { chromium } from '../../work/ui-tools/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';

const out = process.argv[2];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
function inspect() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = s => {
    context.clearRect(0, 0, 1, 1); context.fillStyle = s; context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const mix = (f, b) => f.slice(0, 3).map((n, i) => n * f[3] + b[i] * (1 - f[3]));
  const lum = c => c.map(n => { n /= 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((a, n, i) => a + n * [.2126, .7152, .0722][i], 0);
  const failures = []; let checked = 0;
  for (const el of document.querySelectorAll('main *,header *,aside *')) {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) ||
        !Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim()) ||
        el.closest(':disabled,[inert]')) continue;
    const ancestors = []; for (let p = el; p; p = p.parentElement) ancestors.push(p);
    // Text over imagery or fading transitions needs visual inspection.
    if (ancestors.some(p => +getComputedStyle(p).opacity < 1 || getComputedStyle(p).backgroundImage !== 'none')) continue;
    let bg = [255, 255, 255]; for (const a of ancestors.reverse()) bg = mix(rgba(getComputedStyle(a).backgroundColor), bg);
    const s = getComputedStyle(el), fg = mix(rgba(s.color), bg), ls = [lum(fg), lum(bg)].sort((a, b) => a - b);
    const ratio = (ls[1] + .05) / (ls[0] + .05);
    const limit = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && parseInt(s.fontWeight) >= 700) ? 3 : 4.5;
    checked++;
    if (ratio + .01 < limit) failures.push({ text: el.textContent.trim().slice(0, 60), cls: el.className, color: s.color, bg, ratio: +ratio.toFixed(2), limit });
  }
  const controls = [...document.querySelectorAll('button,a,summary,label')]
    .filter(e => e.checkVisibility({ checkVisibilityCSS: true }) && e.getBoundingClientRect().width > 0 && !e.disabled);
  const smallLabels = controls.filter(e => parseFloat(getComputedStyle(e).fontSize) < 14).map(e => ({ text: e.textContent.trim().slice(0, 40), cls: e.className, font: getComputedStyle(e).fontSize }));
  const smallPrimaryTargets = controls.filter(e => /primary|return|back|send/.test(e.className) && (e.getBoundingClientRect().height < 44 || e.getBoundingClientRect().width < 44)).map(e => ({ text: e.textContent.trim().slice(0, 40), cls: e.className }));
  return { checked, failures, smallLabels, smallPrimaryTargets };
}
const results = [];
for (const route of ['/today', '/path', '/stack', '/proof?compose=1', '/coach', '/history', '/setup', '/sign-in', '/method', '/showcase']) {
  await page.goto('http://127.0.0.1:4180' + route, { waitUntil: 'networkidle' });
  results.push({ route, ...await page.evaluate(inspect) });
}
await page.goto('http://127.0.0.1:4180/today', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: '打开学习伙伴', exact: true }).click();
results.push({ route: 'companion', ...await page.evaluate(inspect) });
await writeFile(out + '/contrast-and-controls-results.json', JSON.stringify(results, null, 2));
const issues = results.filter(r => r.failures.length || r.smallLabels.length || r.smallPrimaryTargets.length);
console.log(JSON.stringify({ checkedText: results.reduce((n, r) => n + r.checked, 0), issues }));
await browser.close();
if (issues.length) process.exitCode = 1;

