import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4211;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>tools.push(tool)}});
    window.__webmcpTools=tools;
  });
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length>=16);

  const r2=await page.evaluate(()=>window.faultline.applySource({expectedRevision:'r1',targetAxis:'html',source:'<main id="canonical-r2">canonical</main>'}));
  assert.equal(r2.revision,'r2');

  await page.evaluate(()=>{
    const key='faultline-prod-v3';
    const raw=JSON.parse(localStorage.getItem(key));
    const current=raw.revisions.find(([revision])=>revision==='r2')?.[1];
    if(!current)throw new Error('TEST_SETUP_MISSING_R2');
    const forged=structuredClone(current);
    forged.value.html='<main id="forged-r99">forged future recovery</main>';
    raw.revisions.push(['r99',forged]);
    localStorage.setItem(key,JSON.stringify(raw));
  });

  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length>=16);

  const discovered=await page.evaluate(()=>window.faultline.revisions());
  assert.equal(discovered.currentRevision,'r2','canonical revision must remain the persisted store revision');
  assert.ok(!discovered.revisions.some(item=>item.revision==='r99'),'runtime recovery history must reject revisions newer than the canonical store revision');

  const restoreResult=await page.evaluate(async()=>{
    try{
      await window.faultline.restore({expectedRevision:'r2',targetRevision:'r99'});
      return {ok:true};
    }catch(error){
      return {ok:false,message:String(error?.message||error)};
    }
  });
  assert.equal(restoreResult.ok,false,'a forged future runtime revision must never become restorable');
  assert.match(restoreResult.message,/REVISION_NOT_FOUND/,'future runtime revisions must be discarded during hydration');

  console.log('Runtime revision hydration integrity PASS: persisted runtime recovery points cannot exceed the canonical revision or become restorable.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
