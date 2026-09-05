import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4179;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline && document.querySelector('.unit'));

  const initial=await page.evaluate(()=>window.faultline.inspect());
  const unitId=await page.evaluate(()=>document.querySelector('.unit').dataset.unitId);
  const pinned=await page.evaluate(({revision,unitId})=>window.faultline.pin({expectedRevision:revision,targetAxis:'html',unitId,pinned:true}),{revision:initial.revision,unitId});

  assert.notEqual(pinned.revision,initial.revision,'pinning canonical reduction state must advance revision');
  assert.ok(pinned.pins.includes(`html|${unitId}`),'new revision must contain the pin');

  const stale=await page.evaluate(async({revision,unitId})=>{
    try{
      await window.faultline.pin({expectedRevision:revision,targetAxis:'html',unitId,pinned:false});
      return null;
    }catch(error){ return String(error?.message||error); }
  },{revision:initial.revision,unitId});
  assert.match(stale||'',/STALE_REVISION/,'a stale actor must not mutate pins after the revision advances');

  const restored=await page.evaluate(({expectedRevision,targetRevision})=>window.faultline.restore({expectedRevision,targetRevision}),{expectedRevision:pinned.revision,targetRevision:initial.revision});
  assert.deepEqual(restored.pins,[],'restoring the pre-pin revision must restore its immutable empty pin snapshot');
  assert.notEqual(restored.revision,pinned.revision,'restore must create a new canonical revision');

  console.log('Pin revision-integrity gate PASS: pin mutations advance canonical revision, stale pin writes are rejected, and historical pin snapshots remain immutable.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
