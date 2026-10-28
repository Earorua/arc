import { chromium } from '../../work/ui-tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const out=process.argv[2]; const browser=await chromium.launch({headless:true}); const results=[];
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage(); const origin='http://127.0.0.1:4180';
const check=async(name,run)=>{ try { await run(); results.push({name,passed:true}); } catch(error) { results.push({name,passed:false,error:String(error)}); } };
await check('Today completion retains the owned task in Proof compose',async()=>{
 await page.goto(origin+'/today'); await page.getByRole('heading',{level:1}).waitFor();
 for(const box of await page.getByRole('checkbox').all()) await box.check();
 await page.getByRole('button',{name:'完成任务',exact:true}).click();
 const link=page.getByRole('link',{name:'添加作品证据',exact:true}); const href=await link.getAttribute('href'); const unit=new URL(href,origin).searchParams.get('unit'); assert.ok(unit);
 await link.click(); await page.getByRole('heading',{name:'添加作品',exact:true}).waitFor();
 assert.equal(await page.getByRole('combobox',{name:'关联学习单元'}).inputValue(),unit);
 assert.notEqual(await page.getByRole('combobox',{name:'关联技能'}).inputValue(),'');
 assert.equal(await page.getByRole('combobox',{name:'可见范围'}).inputValue(),'private');
 await page.getByRole('link',{name:'返回今日学习'}).click(); await page.waitForURL('**/today');
});
await check('Path selected unit restores through Back and refresh',async()=>{
 await page.goto(origin+'/path'); const summary=page.locator('.path-unit-detail > summary').first(); await summary.click();
 assert.ok(new URL(page.url()).searchParams.get('unit')); await page.reload(); await page.locator('.path-unit-detail[open]').first().waitFor();
 await page.goBack(); await page.waitForURL('**/path'); assert.equal(await page.locator('.path-unit-detail[open]').count(),0);
});
await check('Setup completion offers an explicit continuation to the original resource search',async()=>{
 const source='/stack?q=TypeScript';
 await page.goto(origin+'/path?created=1&returnTo='+encodeURIComponent(source));
 const link=page.getByRole('link',{name:'继续查看技能与资料',exact:true});
 assert.equal(await link.getAttribute('href'),source); await link.click();
 await page.waitForURL('**/stack?q=TypeScript'); assert.equal(await page.getByLabel('搜索技能',{exact:true}).inputValue(),'TypeScript');
});
await check('Proof detail and a draft survive address reload and navigation',async()=>{
 await page.goto(origin+'/proof'); await page.locator('.proof-list-item').first().click(); assert.ok(new URL(page.url()).searchParams.get('proof'));
 await page.reload(); await page.locator('.proof-root').waitFor(); await page.getByRole('button',{name:'返回作品列表'}).click();
 await page.getByRole('button',{name:'添加作品',exact:true}).click(); await page.getByLabel('作品标题',{exact:true}).fill('浏览器验收草稿');
 await page.getByRole('link',{name:'学习路线',exact:true}).click(); await page.goBack(); await page.getByLabel('作品标题',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('作品标题',{exact:true}).inputValue(),'浏览器验收草稿');
 await page.goto(origin+'/proof?proof=missing'); await page.getByRole('heading',{name:'无法读取这项作品'}).waitFor();
});
await check('Coach draft survives leaving and Back; active generation can veto Back',async()=>{
 await page.goto(origin+'/coach'); await page.getByLabel('本次规划的重点').fill('每周只安排三个晚上');
 await page.getByRole('link',{name:'返回学习路线'}).click(); await page.goBack(); assert.equal(await page.getByLabel('本次规划的重点').inputValue(),'每周只安排三个晚上');
 await page.goto(origin+'/path'); await page.locator('.workspace-tools > summary').click(); await page.getByRole('link',{name:'学习规划',exact:true}).click(); await page.waitForURL('**/coach'); await page.evaluate(()=>history.replaceState(history.state,'','/coach?simulate=running')); await page.getByRole('button',{name:'开始深度规划'}).click(); await page.getByRole('button',{name:'正在深度规划…'}).waitFor();
 let message=''; page.once('dialog',async d=>{message=d.message(); await d.dismiss();});
 await page.evaluate(()=>history.back()); await page.waitForTimeout(150); assert.match(message,/离开会中断/); assert.equal(new URL(page.url()).pathname,'/coach');
 page.once('dialog',async d=>d.accept()); await page.evaluate(()=>history.back()); await page.waitForURL('**/path');
});
await check('History keeps direct selection and read-only route',async()=>{
 await page.goto(origin+'/history'); await page.getByRole('button',{name:/查看 数据产品经理/}).click(); assert.equal(new URL(page.url()).searchParams.get('goal'),'history-preview');
 await page.reload(); await page.getByText('历史版本 · 只读').waitFor(); assert.equal(await page.getByRole('link',{name:/继续今日学习/}).count(),0);
 await page.getByRole('button',{name:'返回历史列表'}).click(); await page.getByRole('button',{name:/查看 数据产品经理/}).waitFor();
});
const mobile=await context.newPage({viewport:{width:390,height:844}}); await mobile.setViewportSize({width:390,height:844});
await check('Mobile Stack preserves search through detail Back and Forward',async()=>{
 await mobile.goto(origin+'/stack'); await mobile.getByLabel('搜索技能',{exact:true}).fill('TypeScript');
 assert.equal(new URL(mobile.url()).searchParams.get('q'),'TypeScript');
 const items=mobile.locator('.stack-index button[aria-controls="selected-skill-detail"]'); await items.first().click(); assert.ok(new URL(mobile.url()).searchParams.get('skill'));
 await mobile.goBack(); await mobile.waitForURL(url=>url.pathname==='/stack' && url.searchParams.get('q')==='TypeScript' && !url.searchParams.has('skill')); assert.ok(await mobile.locator('.stack-index').isVisible());
 assert.equal(await mobile.getByLabel('搜索技能',{exact:true}).inputValue(),'TypeScript');
 await mobile.goForward(); assert.ok(await mobile.locator('.stack-browser.is-detail-open').isVisible());
});
await check('Mobile Proof actions avoid companion overlap and keyboard mode hides bottom navigation',async()=>{
 await mobile.goto(origin+'/proof?compose=1'); await mobile.getByLabel('作品标题',{exact:true}).waitFor();
 const overlap=await mobile.evaluate(()=>{const a=document.querySelector('.proof-editor-actions')?.getBoundingClientRect(), b=document.querySelector('.companion-launcher')?.getBoundingClientRect();return a&&b?Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)):0;}); assert.equal(overlap,0);
 await mobile.getByLabel('作品标题',{exact:true}).focus(); assert.equal(await mobile.locator('.workspace-bottom-nav').isVisible(),false);
});
await writeFile(`${out}/flow-results.json`,JSON.stringify(results,null,2)); await browser.close(); console.log(JSON.stringify(results,null,2)); if(results.some(r=>!r.passed)) process.exitCode=1;
