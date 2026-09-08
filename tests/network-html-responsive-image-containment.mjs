import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';

const appPort=4229;
const sinkPort=4230;
let imageHits=0;
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1gAAAABJRU5ErkJggg==','base64');
const sink=http.createServer((req,res)=>{
  if(req.url?.startsWith('/responsive.png'))imageHits++;
  res.setHeader('content-type','image/png');
  res.end(pixel);
});
await new Promise((resolve,reject)=>sink.once('error',reject).listen(sinkPort,'127.0.0.1',resolve));

const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${appPort},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try {
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  await page.goto(`http://127.0.0.1:${appPort}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  const state=await page.evaluate(({sinkPort})=>{
    const current=window.faultline.inspect();
    return window.faultline.loadCase({expectedRevision:current.revision,case:{
      html:`<picture><source media="(min-width: 1px)" srcset="http://127.0.0.1:${sinkPort}/responsive.png 1x"><img id="asset" alt="responsive dependency"></picture>`,
      css:'',
      js:'',
      oracle:{kind:'dom_property',selector:'#asset',property:'naturalWidth',equals:1,action:{kind:'none'},delayMs:120}
    }});
  },{sinkPort});

  const result=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:state.revision});
  await page.waitForTimeout(180);
  assert.equal(imageHits,0,'responsive image dependencies must never leave the experiment sandbox');
  assert.equal(result.status,'UNRESOLVED','a blocked responsive image must not be reported as ordinary oracle evidence');
  assert.equal(result.evidence?.reason,'UNSAFE_NETWORK','responsive image rejection must be explicit and machine-readable');
  assert.equal(result.evidence?.axis,'html','network evidence must identify the HTML axis');
  assert.equal(result.evidence?.capability,'external-image','network evidence must identify the blocked image dependency');

  await page.locator('#preview-run').click();
  await page.waitForTimeout(220);
  assert.equal(imageHits,0,'explicit preview execution must not request responsive external images');
  const summary=await page.locator('#summary').textContent();
  assert.match(summary||'',/UNSAFE_NETWORK · html · external-image/,'blocked responsive preview dependency must be visible to the user');

  console.log('Responsive image-network containment PASS: blocked srcset dependencies become deterministic unsafe-network evidence in runner and preview.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
  await new Promise(resolve=>sink.close(resolve));
}
