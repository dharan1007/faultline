import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';

const appPort=4235;
const sinkPort=4236;
let resourceHits=0;
const sink=http.createServer((req,res)=>{
  if(req.url?.startsWith('/dependency.svg'))resourceHits++;
  res.setHeader('content-type','image/svg+xml');
  res.end('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>');
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
      css:`#payload{background-image:url("http://127.0.0.1:${sinkPort}/dependency.svg")}`,
      js:'',
      oracle:{kind:'dom_exists',selector:'#payload',equals:true,action:{kind:'none'},delayMs:100}
    }});
  },{sinkPort});

  const result=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:state.revision});
  await page.waitForTimeout(180);
  assert.equal(resourceHits,0,'CSS url() dependencies must never leave the experiment sandbox');
  assert.equal(result.status,'UNRESOLVED','a blocked CSS url() dependency must not be reported as ordinary oracle evidence');
  assert.equal(result.evidence?.reason,'UNSAFE_NETWORK','CSS url() rejection must be explicit and machine-readable');
  assert.equal(result.evidence?.axis,'css','network evidence must identify the CSS axis');
  assert.equal(result.evidence?.capability,'external-css-resource','network evidence must identify the blocked CSS resource dependency');

  await page.locator('#preview-run').click();
  await page.waitForTimeout(220);
  assert.equal(resourceHits,0,'explicit preview execution must not request CSS url() dependencies');
  const summary=await page.locator('#summary').textContent();
  assert.match(summary||'',/UNSAFE_NETWORK · css · external-css-resource/,'blocked preview CSS resource must be visible to the user');

  const embeddedState=await page.evaluate(()=>{
    const current=window.faultline.inspect();
    return window.faultline.loadCase({expectedRevision:current.revision,case:{
      html:'<main id="payload">contained</main>',
      css:'#payload{background-image:url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E")}',
      js:'',
      oracle:{kind:'dom_exists',selector:'#payload',equals:true,action:{kind:'none'},delayMs:0}
    }});
  });
  const embeddedResult=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:embeddedState.revision});
  assert.equal(embeddedResult.status,'FAIL','self-contained data CSS resources must remain executable and preserve ordinary oracle evidence');

  console.log('CSS resource-network containment PASS: blocked url() dependencies become deterministic unsafe-network evidence while data resources remain runnable.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
  await new Promise(resolve=>sink.close(resolve));
}
