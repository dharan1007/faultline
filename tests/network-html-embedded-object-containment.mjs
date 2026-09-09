import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';

const appPort=4235;
const sinkPort=4236;
let objectHits=0;
const sink=http.createServer((req,res)=>{
  if(req.url?.startsWith('/dependency.html'))objectHits++;
  res.setHeader('content-type','text/html; charset=utf-8');
  res.end('<!doctype html><title>external object dependency</title>');
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
      html:`<object id="plugin" data="http://127.0.0.1:${sinkPort}/dependency.html" type="text/html"></object>`,
      css:'',
      js:'',
      oracle:{kind:'dom_exists',selector:'#plugin',equals:true,action:{kind:'none'},delayMs:120}
    }});
  },{sinkPort});

  const result=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:state.revision});
  await page.waitForTimeout(180);
  assert.equal(objectHits,0,'external object dependencies must never leave the experiment sandbox');
  assert.equal(result.status,'UNRESOLVED','a blocked object dependency must not be reported as ordinary oracle evidence');
  assert.equal(result.evidence?.reason,'UNSAFE_NETWORK','object dependency rejection must be explicit and machine-readable');
  assert.equal(result.evidence?.axis,'html','network evidence must identify the HTML axis');
  assert.equal(result.evidence?.capability,'external-embedded-object','network evidence must identify the blocked embedded object dependency');

  await page.locator('#preview-run').click();
  await page.waitForTimeout(220);
  assert.equal(objectHits,0,'explicit preview execution must not request an external object dependency');
  const summary=await page.locator('#summary').textContent();
  assert.match(summary||'',/UNSAFE_NETWORK · html · external-embedded-object/,'blocked preview object dependency must be visible to the user');

  const embedState=await page.evaluate(({sinkPort})=>{
    const current=window.faultline.inspect();
    return window.faultline.loadCase({expectedRevision:current.revision,case:{
      html:`<embed id="plugin" src="http://127.0.0.1:${sinkPort}/dependency.html" type="text/html">`,
      css:'',
      js:'',
      oracle:{kind:'dom_exists',selector:'#plugin',equals:true,action:{kind:'none'},delayMs:120}
    }});
  },{sinkPort});
  const embedResult=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:embedState.revision});
  await page.waitForTimeout(180);
  assert.equal(objectHits,0,'external embed dependencies must never leave the experiment sandbox');
  assert.equal(embedResult.status,'UNRESOLVED','a blocked embed dependency must not be reported as ordinary oracle evidence');
  assert.equal(embedResult.evidence?.capability,'external-embedded-object','embed dependencies must share the embedded-object evidence capability');

  const inertState=await page.evaluate(()=>{
    const current=window.faultline.inspect();
    return window.faultline.loadCase({expectedRevision:current.revision,case:{
      html:'<object id="plugin"><span>fallback only</span></object>',
      css:'',
      js:'',
      oracle:{kind:'dom_exists',selector:'#plugin',equals:true,action:{kind:'none'},delayMs:0}
    }});
  });
  const inertResult=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:inertState.revision});
  assert.equal(inertResult.status,'FAIL','an object without a resource dependency must remain executable with ordinary oracle evidence');

  console.log('HTML embedded-object containment PASS: blocked object/embed dependencies become deterministic unsafe-network evidence while inert object markup remains runnable.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
  await new Promise(resolve=>sink.close(resolve));
}
