import { chromium } from '../../work/ui-tools/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true}); const out=process.argv[2]; const results=[];
for(const [width,height,label] of [[320,740,'small-mobile'],[720,900,'200-percent-equivalent'],[768,1024,'tablet'],[844,390,'landscape']]) {
 const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
 for(const route of ['/today','/path','/stack','/proof?compose=1','/coach','/setup?mode=edit&section=time','/history','/sign-in','/showcase']) {
  const p=await context.newPage(); await p.goto('http://127.0.0.1:4180'+route,{waitUntil:'networkidle'});
  const metrics=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,inputs:[...document.querySelectorAll('input:not([type=checkbox]),textarea,select')].filter(e=>e.getClientRects().length).map(e=>parseFloat(getComputedStyle(e).fontSize)),main:!!document.querySelector('main'),nav:document.querySelector('.workspace-bottom-nav')?.getBoundingClientRect().bottom,viewport:innerHeight}));
  results.push({label,route,...metrics}); await p.close();
 }
 await context.close();
}
const p=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
await p.goto('http://127.0.0.1:4180/setup'); await p.getByRole('button',{name:'继续',exact:true}).click();
await p.screenshot({path:out+'/mobile-setup-skills.jpg',fullPage:true,type:'jpeg',quality:80});
assert.ok(await p.locator('.audit-group[open], .skill-audit-group[open], details[open]').count()>0);
await p.goto('http://127.0.0.1:4180/setup?mode=edit&section=time');
await p.screenshot({path:out+'/mobile-setup-time-final.jpg',fullPage:true,type:'jpeg',quality:80});
await writeFile(out+'/responsive-results.json',JSON.stringify(results,null,2));
await browser.close(); const issues=results.filter(r=>r.overflow||r.inputs.some(n=>n<16)||!r.main); console.log(JSON.stringify({views:results.length,issues},null,2)); if(issues.length)process.exitCode=1;
