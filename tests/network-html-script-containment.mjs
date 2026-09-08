import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';

const appPort=4221;
const sinkPort=4222;
let scriptHits=0;
const sink=http.createServer((req,res)=>{
  if(req.url?.startsWith('/dependency.js'))scriptHits++;
  res.setHeader('content-type','application/javascript');
  res.end('window.externalDependencyLoaded=true');
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
      html:`<script src="http://127.0.0.1:${sinkPort}/dependency.js"></script><main id="payload">contained</main>`,
      css:'',
      js:`document.querySelector('#payload').dataset.dependency=String(Boolean(window.externalDependencyLoaded))`,
      oracle:{kind:'dom_property',selector:'#payload',property:'dataset.dependency',equals:'true',action:{kind:'none'},delayMs:0}
    }});
  },{sinkPort});

  const result=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:state.revision});
  await page.waitForTimeout(180);
  assert.equal(scriptHits,0,'external script dependencies must never leave the experiment sandbox');
  assert.equal(result.status,'UNRESOLVED','a blocked external script must not be reported as ordinary oracle evidence');
  assert.equal(result.evidence?.reason,'UNSAFE_NETWORK','external script rejection must be explicit and machine-readable');
  assert.equal(result.evidence?.axis,'html','network evidence must identify the HTML axis');
  assert.equal(result.evidence?.capability,'external-script','network evidence must identify the blocked script dependency');

  await page.locator('#preview-run').click();
  await page.waitForTimeout(220);
  assert.equal(scriptHits,0,'explicit preview execution must not request external scripts');
  const summary=await page.locator('#summary').textContent();
  assert.match(summary||'',/UNSAFE_NETWORK · html · external-script/,'blocked preview script dependency must be visible to the user');

  console.log('HTML script-network containment PASS: blocked external script dependencies become deterministic unsafe-network evidence in runner and preview.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
  await new Promise(resolve=>sink.close(resolve));
}
