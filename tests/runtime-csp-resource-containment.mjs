import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';

const appPort=4235;
const sinkPort=4236;
let resourceHits=0;
const sink=http.createServer((req,res)=>{
  if(req.url?.startsWith('/dynamic.png')){
    resourceHits++;
    res.setHeader('content-type','image/png');
    return res.end(Buffer.from([137,80,78,71,13,10,26,10]));
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

  const forgedState=await page.evaluate(()=>{
    const current=window.faultline.inspect();
    return window.faultline.loadCase({expectedRevision:current.revision,case:{
      html:'<main id="target">synthetic policy fixture</main>',
      css:'',
      js:`dispatchEvent(new SecurityPolicyViolationEvent('securitypolicyviolation',{effectiveDirective:'img-src',violatedDirective:'img-src',blockedURI:'https://forged.invalid/image.png'}));`,
      oracle:{kind:'dom_exists',selector:'#target',equals:true,action:{kind:'none'},delayMs:40}
    }});
  });
  const forgedResult=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:forgedState.revision});
  assert.equal(forgedResult.status,'FAIL','candidate-created synthetic CSP events must not forge deterministic unsafe-network evidence');

  const state=await page.evaluate(({sinkPort})=>{
    const current=window.faultline.inspect();
    return window.faultline.loadCase({expectedRevision:current.revision,case:{
      html:'<main id="target">dynamic resource fixture</main>',
      css:'',
      js:`const image=document.createElement('img');image.alt='';image.src='http://127.0.0.1:${sinkPort}/dynamic.png';document.body.append(image);`,
      oracle:{kind:'dom_exists',selector:'#target',equals:true,action:{kind:'none'},delayMs:120}
    }});
  },{sinkPort});

  const result=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:state.revision});
  await page.waitForTimeout(180);
  assert.equal(resourceHits,0,'runtime-created external resources must never leave the experiment sandbox');
  assert.equal(result.status,'UNRESOLVED','a CSP-blocked runtime dependency must not be reported as ordinary oracle evidence');
  assert.equal(result.evidence?.reason,'UNSAFE_NETWORK','runtime CSP rejection must be explicit and machine-readable');
  assert.equal(result.evidence?.axis,'js','runtime-created dependency evidence must identify the JavaScript axis');
  assert.equal(result.evidence?.capability,'runtime-csp-resource','runtime-created dependency evidence must identify the generic CSP resource capability');
  assert.equal(result.evidence?.directive,'img-src','runtime-created dependency evidence must expose the effective CSP directive');

  await page.locator('#preview-run').click();
  await page.waitForTimeout(260);
  assert.equal(resourceHits,0,'explicit preview execution must not request the runtime-created external resource');
  const summary=await page.locator('#summary').textContent();
  assert.match(summary||'',/UNSAFE_NETWORK · js · runtime-csp-resource · img-src/,'blocked runtime dependency must be visible to the user in preview');

  const embeddedState=await page.evaluate(()=>{
    const current=window.faultline.inspect();
    return window.faultline.loadCase({expectedRevision:current.revision,case:{
      html:'<main id="target">embedded resource fixture</main>',
      css:'',
      js:`const image=document.createElement('img');image.alt='';image.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';document.body.append(image);`,
      oracle:{kind:'dom_exists',selector:'#target',equals:true,action:{kind:'none'},delayMs:40}
    }});
  });
  const embeddedResult=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:embeddedState.revision});
  assert.equal(embeddedResult.status,'FAIL','CSP-permitted runtime data resources must remain executable with ordinary oracle evidence');

  console.log('Runtime CSP resource containment PASS: trusted browser CSP violations become deterministic unsafe-network evidence, synthetic events cannot forge evidence, and data resources remain runnable.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
  await new Promise(resolve=>sink.close(resolve));
}
