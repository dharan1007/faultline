import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';

const appPort=4233;
const sinkPort=4234;
let mediaHits=0;
let posterHits=0;
let trackHits=0;
const sink=http.createServer((req,res)=>{
  if(req.url?.startsWith('/dependency.mp4')){
    mediaHits++;
    res.setHeader('content-type','video/mp4');
    return res.end(Buffer.from([0,0,0,20,102,116,121,112,105,115,111,109,0,0,0,0,105,115,111,109]));
  }
  if(req.url?.startsWith('/poster.png')){
    posterHits++;
    res.setHeader('content-type','image/png');
    return res.end(Buffer.from([137,80,78,71,13,10,26,10]));
  }
  if(req.url?.startsWith('/captions.vtt')){
    trackHits++;
    res.setHeader('content-type','text/vtt');
    return res.end('WEBVTT\n\n00:00.000 --> 00:01.000\nCaption');
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
      html:`<video id="media" src="http://127.0.0.1:${sinkPort}/dependency.mp4" controls></video>`,
      css:'',
      js:'',
      oracle:{kind:'dom_exists',selector:'#media',equals:true,action:{kind:'none'},delayMs:120}
    }});
  },{sinkPort});

  const result=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:state.revision});
  await page.waitForTimeout(180);
  assert.equal(mediaHits,0,'external media dependencies must never leave the experiment sandbox');
  assert.equal(result.status,'UNRESOLVED','a blocked external media dependency must not be reported as ordinary oracle evidence');
  assert.equal(result.evidence?.reason,'UNSAFE_NETWORK','external media rejection must be explicit and machine-readable');
  assert.equal(result.evidence?.axis,'html','network evidence must identify the HTML axis');
  assert.equal(result.evidence?.capability,'external-media','network evidence must identify the blocked media dependency');

  await page.locator('#preview-run').click();
  await page.waitForTimeout(220);
  assert.equal(mediaHits,0,'explicit preview execution must not request external media');
  const summary=await page.locator('#summary').textContent();
  assert.match(summary||'',/UNSAFE_NETWORK · html · external-media/,'blocked preview media dependency must be visible to the user');

  const posterState=await page.evaluate(({sinkPort})=>{
    const current=window.faultline.inspect();
    return window.faultline.loadCase({expectedRevision:current.revision,case:{
      html:`<video id="media" poster="http://127.0.0.1:${sinkPort}/poster.png"></video>`,
      css:'',
      js:'',
      oracle:{kind:'dom_exists',selector:'#media',equals:true,action:{kind:'none'},delayMs:120}
    }});
  },{sinkPort});
  const posterResult=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:posterState.revision});
  await page.waitForTimeout(180);
  assert.equal(posterHits,0,'external poster dependencies must never leave the experiment sandbox');
  assert.equal(posterResult.status,'UNRESOLVED','a blocked external poster dependency must not be reported as ordinary oracle evidence');
  assert.equal(posterResult.evidence?.reason,'UNSAFE_NETWORK','poster rejection must be explicit and machine-readable');
  assert.equal(posterResult.evidence?.axis,'html','poster evidence must identify the HTML axis');
  assert.equal(posterResult.evidence?.capability,'external-media','poster evidence must use the media dependency capability');

  const trackState=await page.evaluate(({sinkPort})=>{
    const current=window.faultline.inspect();
    return window.faultline.loadCase({expectedRevision:current.revision,case:{
      html:`<video id="media"><track kind="captions" src="http://127.0.0.1:${sinkPort}/captions.vtt" default></video>`,
      css:'',
      js:'',
      oracle:{kind:'dom_exists',selector:'#media',equals:true,action:{kind:'none'},delayMs:120}
    }});
  },{sinkPort});
  const trackResult=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:trackState.revision});
  await page.waitForTimeout(180);
  assert.equal(trackHits,0,'external track dependencies must never leave the experiment sandbox');
  assert.equal(trackResult.status,'UNRESOLVED','a blocked external track dependency must not be reported as ordinary oracle evidence');
  assert.equal(trackResult.evidence?.reason,'UNSAFE_NETWORK','track rejection must be explicit and machine-readable');
  assert.equal(trackResult.evidence?.axis,'html','track evidence must identify the HTML axis');
  assert.equal(trackResult.evidence?.capability,'external-media','track evidence must use the media dependency capability');

  await page.locator('#preview-run').click();
  await page.waitForTimeout(220);
  assert.equal(trackHits,0,'explicit preview execution must not request external tracks');
  const trackSummary=await page.locator('#summary').textContent();
  assert.match(trackSummary||'',/UNSAFE_NETWORK · html · external-media/,'blocked preview track dependency must be visible to the user');

  const embeddedState=await page.evaluate(()=>{
    const current=window.faultline.inspect();
    return window.faultline.loadCase({expectedRevision:current.revision,case:{
      html:'<video id="media" poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="><track kind="captions" src="data:text/vtt,WEBVTT"></video>',
      css:'',
      js:'',
      oracle:{kind:'dom_exists',selector:'#media',equals:true,action:{kind:'none'},delayMs:0}
    }});
  });
  const embeddedResult=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:embeddedState.revision});
  assert.equal(embeddedResult.status,'FAIL','self-contained data media dependencies must remain executable and preserve ordinary oracle evidence');

  console.log('HTML media-network containment PASS: primary, poster, and track dependencies become deterministic unsafe-network evidence while data media remains runnable.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
  await new Promise(resolve=>sink.close(resolve));
}
