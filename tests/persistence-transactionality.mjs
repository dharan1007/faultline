import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4187;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  const outcome=await page.evaluate(()=>{
    const before=window.faultline.inspect();
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(){throw new DOMException('quota exceeded','QuotaExceededError')};
    let error=null;
    try{
      window.faultline.applySource({expectedRevision:before.revision,targetAxis:'html',source:'<main id="durable">must persist</main>'});
    }catch(e){
      error=String(e?.message||e);
    }finally{
      Storage.prototype.setItem=original;
    }
    return {before,after:window.faultline.inspect(),error};
  });

  assert.equal(outcome.error,'PERSISTENCE_FAILED','failed durable writes must reject with a machine-readable persistence error');
  assert.equal(outcome.after.revision,outcome.before.revision,'failed persistence must roll back the canonical revision');
  assert.equal(outcome.after.case.html,outcome.before.case.html,'failed persistence must roll back the canonical case');

  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);
  const reloaded=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(reloaded.revision,outcome.before.revision,'reload must observe the same revision after a rejected non-durable mutation');
  assert.equal(reloaded.case.html,outcome.before.case.html,'reload must observe the same source after a rejected non-durable mutation');
  console.log('Persistence transactionality PASS: canonical mutations either persist durably or roll back without revision divergence.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
