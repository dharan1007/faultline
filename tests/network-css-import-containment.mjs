import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';

const appPort=4227;
const sinkPort=4228;
let stylesheetHits=0;
let resourceHits=0;
const sink=http.createServer((req,res)=>{
  if(req.url?.startsWith('/dependency.css')){
    stylesheetHits++;
    res.setHeader('content-type','text/css');
    return res.end('#payload{color:rgb(4, 5, 6)}');
  }
  if(req.url?.startsWith('/dependency.svg')){
    resourceHits++;
    res.setHeader('content-type','image/svg+xml');
    return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>');
  }
  res.statusCode=404;
  res.end('not found');
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
      css:`@import url("http://127.0.0.1:${sinkPort}/dependency.css");`,
      js:'',
      oracle:{kind:'computed_style',selector:'#payload',property:'color',equals:'rgb(4, 5, 6)',action:{kind:'none'},delayMs:0}
    }});
  },{sinkPort});

  const result=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:state.revision});
  await page.waitForTimeout(180);
  assert.equal(stylesheetHits,0,'CSS @import dependencies must never leave the experiment sandbox');
  assert.equal(result.status,'UNRESOLVED','a blocked CSS @import must not be reported as ordinary oracle evidence');
  assert.equal(result.evidence?.reason,'UNSAFE_NETWORK','CSS @import rejection must be explicit and machine-readable');
  assert.equal(result.evidence?.axis,'css','network evidence must identify the CSS axis');
  assert.equal(result.evidence?.capability,'external-stylesheet-import','network evidence must identify the blocked CSS import dependency');

  await page.locator('#preview-run').click();
  await page.waitForTimeout(220);
  assert.equal(stylesheetHits,0,'explicit preview execution must not request CSS @import dependencies');
  const importSummary=await page.locator('#summary').textContent();
  assert.match(importSummary||'',/UNSAFE_NETWORK · css · external-stylesheet-import/,'blocked preview CSS import must be visible to the user');

  const resourceState=await page.evaluate(({sinkPort})=>{
    const current=window.faultline.inspect();
    return window.faultline.loadCase({expectedRevision:current.revision,case:{
      html:'<main id="payload">contained</main>',
      css:`#payload{background-image:url("http://127.0.0.1:${sinkPort}/dependency.svg")}`,
      js:'',
      oracle:{kind:'dom_exists',selector:'#payload',equals:true,action:{kind:'none'},delayMs:100}
    }});
  },{sinkPort});

  const resourceResult=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:resourceState.revision});
  await page.waitForTimeout(180);
  assert.equal(resourceHits,0,'CSS url() dependencies must never leave the experiment sandbox');
  assert.equal(resourceResult.status,'UNRESOLVED','a blocked CSS url() dependency must not be reported as ordinary oracle evidence');
  assert.equal(resourceResult.evidence?.reason,'UNSAFE_NETWORK','CSS url() rejection must be explicit and machine-readable');
  assert.equal(resourceResult.evidence?.axis,'css','CSS url() evidence must identify the CSS axis');
  assert.equal(resourceResult.evidence?.capability,'external-css-resource','CSS url() evidence must identify the blocked resource dependency');

  await page.locator('#preview-run').click();
  await page.waitForTimeout(220);
  assert.equal(resourceHits,0,'explicit preview execution must not request CSS url() dependencies');
  const resourceSummary=await page.locator('#summary').textContent();
  assert.match(resourceSummary||'',/UNSAFE_NETWORK · css · external-css-resource/,'blocked preview CSS resource must be visible to the user');

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

  console.log('CSS dependency-network containment PASS: blocked @import and url() dependencies become deterministic unsafe-network evidence while data resources remain runnable.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
  await new Promise(resolve=>sink.close(resolve));
}
