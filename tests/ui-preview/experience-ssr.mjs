import { register } from 'node:module';
import { writeFile } from 'node:fs/promises';
register('../cloudflare-workers-loader.mjs', import.meta.url);
const {default: worker}=await import('../../dist/server/index.js');
const results=[];
for(const route of ['/', '/today', '/path', '/stack', '/proof', '/coach', '/history', '/setup', '/sign-in', '/method', '/showcase', '/admin', '/arc-unknown-page-for-404-verification']) {
 const response=await worker.fetch(new Request('http://localhost'+route,{headers:{accept:'text/html'}}),{ASSETS:{fetch:async()=>new Response('Not found',{status:404})}},{waitUntil(){},passThroughOnException(){}});
 const html=await response.text(); results.push({route,status:response.status,main:/<main[\s>]/.test(html),branded404:route.includes('404-verification')?html.includes('这个页面暂时找不到了'):undefined});
}
await writeFile(process.argv[2]+'/server-results.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2)); if(results.some(r=>r.status!==(r.route.includes('404-verification')?404:200)||!r.main||r.branded404===false))process.exitCode=1;
