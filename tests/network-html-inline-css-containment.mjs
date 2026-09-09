import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';

const appPort=4231;
const sinkPort=4232;
let styleBlockHits=0;
let styleAttributeHits=0;
const sink=http.createServer((req,res)=>{
  if(req.url?.startsWith('/style-block.svg')){
    styleBlockHits++;
    res.setHeader('content-type','image/svg+xml');
    return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>');
  }
  if(req.url?.startsWith('/style-attribute.svg')){
    styleAttributeHits++;
    res.setHeader('content-type','image/svg+xml');
    return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="blue"/></svg>');
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

  const styleBlockState=await page.evaluate(({sinkPort})=>{
    const current=window.faultline.inspect();
    return window.faultline.loadCase({expectedRevision:current.revision,case:{
      html:`<style>#payload{background-image:url("http://127.0.0.1:${sinkPort}/style-block.svg")}</style><main id="payload">contained</main>`,
      css:'',
      js:'',
      oracle:{kind:'dom_exists',selector:'#payload',equals:true,action:{kind:'none'},delayMs:100}
    }});
  },{sinkPort});
  const styleBlockResult=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:styleBlockState.revision});

  const styleAttributeState=await page.evaluate(({sinkPort})=>{
    const current=window.faultline.inspect();
    return window.faultline.loadCase({expectedRevision:current.revision,case:{
      html:`<main id="payload" style="background-image:url('http://127.0.0.1:${sinkPort}/style-attribute.svg')">contained</main>`,
      css:'',
      js:'',
      oracle:{kind:'dom_exists',selector:'#payload',equals:true,action:{kind:'none'},delayMs:100}
    }});
  },{sinkPort});
  const styleAttributeResult=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:styleAttributeState.revision});

  await page.waitForTimeout(180);
  assert.equal(styleBlockHits,0,'resources referenced by HTML <style> must never leave the experiment sandbox');
  assert.equal(styleAttributeHits,0,'resources referenced by HTML style attributes must never leave the experiment sandbox');
  assert.equal(styleBlockResult.status,'UNRESOLVED','a blocked resource inside HTML <style> must not be reported as ordinary oracle evidence');
  assert.equal(styleBlockResult.evidence?.reason,'UNSAFE_NETWORK','HTML <style> resource rejection must be explicit and machine-readable');
  assert.equal(styleBlockResult.evidence?.axis,'html','inline HTML CSS evidence must identify the HTML axis');
  assert.equal(styleBlockResult.evidence?.capability,'external-inline-css-resource','inline HTML CSS evidence must identify the blocked dependency');
  assert.equal(styleAttributeResult.status,'UNRESOLVED','a blocked resource inside an HTML style attribute must not be reported as ordinary oracle evidence');
  assert.equal(styleAttributeResult.evidence?.reason,'UNSAFE_NETWORK','HTML style-attribute rejection must be explicit and machine-readable');
  assert.equal(styleAttributeResult.evidence?.axis,'html','style-attribute evidence must identify the HTML axis');
  assert.equal(styleAttributeResult.evidence?.capability,'external-inline-css-resource','style-attribute evidence must identify the blocked dependency');

  await page.locator('#preview-run').click();
  await page.waitForTimeout(220);
  assert.equal(styleAttributeHits,0,'explicit preview execution must not request resources referenced by HTML style attributes');
  const summary=await page.locator('#summary').textContent();
  assert.match(summary||'',/UNSAFE_NETWORK · html · external-inline-css-resource/,'blocked inline HTML CSS dependency must be visible to the user');

  const dataState=await page.evaluate(()=>{
    const current=window.faultline.inspect();
    return window.faultline.loadCase({expectedRevision:current.revision,case:{
      html:'<style>#payload{background-image:url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E")}</style><main id="payload">contained</main>',
      css:'',
      js:'',
      oracle:{kind:'dom_exists',selector:'#payload',equals:true,action:{kind:'none'},delayMs:0}
    }});
  });
  const dataResult=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:dataState.revision});
  assert.equal(dataResult.status,'FAIL','self-contained data resources inside HTML inline CSS must remain executable');

  console.log('HTML inline-CSS containment PASS: blocked <style> and style-attribute resources become deterministic unsafe-network evidence while data resources remain runnable.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
  await new Promise(resolve=>sink.close(resolve));
}
