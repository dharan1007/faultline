import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4205;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  const outcome=await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    const maxBytes=90000;
    Storage.prototype.setItem=function(key,value){
      if(String(key)==='faultline-prod-v3' && String(value).length>maxBytes){
        throw new DOMException('simulated storage ceiling','QuotaExceededError');
      }
      return original.call(this,key,value);
    };
    let error=null;
    try{
      for(let i=0;i<20;i++){
        const before=window.faultline.inspect();
        const source=`<main id="large-${i}">${String(i).padStart(2,'0')}${'x'.repeat(7000)}</main>`;
        window.faultline.applySource({expectedRevision:before.revision,targetAxis:'html',source});
      }
    }catch(e){
      error=String(e?.message||e);
    }finally{
      Storage.prototype.setItem=original;
    }
    const current=window.faultline.inspect();
    const raw=localStorage.getItem('faultline-prod-v3');
    const persisted=raw?JSON.parse(raw):null;
    return {
      error,
      revision:current.revision,
      html:current.case.html,
      persistedRevision:persisted?.store?.revision,
      storeSnapshots:persisted?.store?.snapshots?.length||0,
      runtimeRevisions:persisted?.revisions?.length||0,
      serializedBytes:raw?.length||0
    };
  });

  assert.equal(outcome.error,null,'quota pressure must compact recoverable history before rejecting a valid canonical mutation');
  assert.equal(outcome.revision,'r21','quota compaction must preserve monotonic canonical revisions');
  assert.equal(outcome.persistedRevision,21,'persisted canonical revision must match memory after quota compaction');
  assert.match(outcome.html,/large-19/,'latest large canonical source must survive quota compaction');
  assert.ok(outcome.storeSnapshots<20,'quota compaction must reduce persisted revision snapshots when byte pressure requires it');
  assert.ok(outcome.runtimeRevisions<16,'quota compaction must reduce duplicate runtime recovery snapshots when byte pressure requires it');
  assert.ok(outcome.serializedBytes<=90000,`persisted workspace must fit the simulated quota, got ${outcome.serializedBytes}`);

  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);
  const reloaded=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(reloaded.revision,'r21','quota-compacted workspace must hydrate the exact current revision');
  assert.match(reloaded.case.html,/large-19/,'quota-compacted workspace must hydrate the latest large source');
  console.log('Persistence quota compaction PASS: byte pressure sheds oldest recovery history before blocking canonical work.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
