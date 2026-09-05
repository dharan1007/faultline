import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4198;
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
      for(let i=0;i<90;i++){
        const before=window.faultline.inspect();
        const source=`<main id="case-${i}">${'x'.repeat(800+i)}</main>`;
        window.faultline.applySource({expectedRevision:before.revision,targetAxis:'html',source});
      }
    }catch(e){
      error=String(e?.message||e);
    }finally{
      Storage.prototype.setItem=original;
    }
    const current=window.faultline.inspect();
    const persisted=JSON.parse(localStorage.getItem('faultline-prod-v3'));
    return {
      error,
      revision:current.revision,
      html:current.case.html,
      persistedRevision:persisted?.store?.revision,
      storeSnapshots:persisted?.store?.snapshots?.length,
      storeLedger:persisted?.store?.ledger?.length,
      runtimeRevisions:persisted?.revisions?.length,
      serializedBytes:localStorage.getItem('faultline-prod-v3')?.length||0
    };
  });

  assert.equal(outcome.error,null,'bounded persistence must keep canonical mutations durable under a realistic storage ceiling');
  assert.equal(outcome.revision,'r91','retention must never rewind or renumber canonical revisions');
  assert.equal(outcome.persistedRevision,91,'persisted revision counter must remain monotonic after compaction');
  assert.match(outcome.html,/case-89/,'latest canonical case must survive retention');
  assert.ok(outcome.storeSnapshots<=32,`revision-store snapshots must be bounded, got ${outcome.storeSnapshots}`);
  assert.ok(outcome.storeLedger<=64,`revision-store ledger must be bounded, got ${outcome.storeLedger}`);
  assert.ok(outcome.runtimeRevisions<=32,`runtime restore snapshots must be bounded, got ${outcome.runtimeRevisions}`);
  assert.ok(outcome.serializedBytes<=90000,`persisted workspace must remain below the simulated ceiling, got ${outcome.serializedBytes}`);

  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);
  const reloaded=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(reloaded.revision,'r91','compacted workspace must hydrate at the exact canonical revision');
  assert.match(reloaded.case.html,/case-89/,'compacted workspace must hydrate the latest canonical case');
  console.log('Persistence retention PASS: long sessions keep bounded recoverable history without losing the current canonical revision.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
