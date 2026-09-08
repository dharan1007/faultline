import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';

const appPort=4219;
const sinkPort=4220;
let workerHits=0;
const sink=http.createServer((req,res)=>{
  if(req.url?.startsWith('/worker.js'))workerHits++;
  res.setHeader('content-type','application/javascript');
  res.end('self.postMessage("loaded")');
});
await new Promise((resolve,reject)=>sink.once('error',reject).listen(sinkPort,'127.0.0.1',resolve));

const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${appPort},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try {
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${appPort}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  const state=await page.evaluate(({sinkPort})=>{
    const current=window.faultline.inspect();
    return window.faultline.loadCase({expectedRevision:current.revision,case:{
      html:'<main id="payload">contained</main>',
      css:'',
      js:`try{const worker=new Worker('http://127.0.0.1:${sinkPort}/worker.js');worker.onerror=()=>{}}catch{};document.querySelector('#payload').dataset.afterWorker='yes'`,
      oracle:{kind:'dom_exists',selector:'#payload',equals:true,action:{kind:'none'},delayMs:0}
    }});
  },{sinkPort});

  const result=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:state.revision});
  await page.waitForTimeout(180);
  assert.equal(workerHits,0,'worker scripts must never leave the experiment sandbox');
  assert.equal(result.status,'UNRESOLVED','a blocked Worker attempt must not be reported as ordinary oracle evidence');
  assert.equal(result.evidence?.reason,'UNSAFE_NETWORK','Worker rejection must be explicit and machine-readable');
  assert.equal(result.evidence?.capability,'worker','network evidence must identify the blocked Worker API');

  await page.locator('#preview-run').click();
  await page.waitForTimeout(220);
  assert.equal(workerHits,0,'explicit preview execution must not request worker scripts');
  const summary=await page.locator('#summary').textContent();
  assert.match(summary||'',/UNSAFE_NETWORK · js · worker/,'blocked preview Worker must be visible to the user');

  console.log('Worker-network containment PASS: blocked Worker attempts become deterministic unsafe-network evidence in runner and preview.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
  await new Promise(resolve=>sink.close(resolve));
}
