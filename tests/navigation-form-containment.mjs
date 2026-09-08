import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';

const appPort=4203;
const sinkPort=4204;
let sinkHits=0;
const sink=http.createServer((req,res)=>{sinkHits++;res.writeHead(204);res.end();});
await new Promise((resolve,reject)=>sink.once('error',reject).listen(sinkPort,'127.0.0.1',resolve));

const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${appPort},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try {
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${appPort}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  const loadFormCase=async js=>page.evaluate(({sinkPort,js})=>{
    const current=window.faultline.inspect();
    return window.faultline.loadCase({
      expectedRevision:current.revision,
      case:{
        html:`<main id="payload">contained</main><form id="escape-form" action="http://127.0.0.1:${sinkPort}/form-escape" method="post"><button type="submit">Submit</button></form>`,
        css:'',
        js,
        oracle:{kind:'dom_exists',selector:'#payload',equals:true,action:{kind:'none'},delayMs:0}
      }
    });
  },{sinkPort,js});

  const assertContained=async state=>{
    const result=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:state.revision});
    await page.waitForTimeout(120);
    assert.equal(sinkHits,0,'form navigation must never leave the experiment sandbox');
    assert.equal(result.status,'UNRESOLVED','a blocked form navigation attempt must not be reported as ordinary oracle evidence');
    assert.equal(result.evidence?.reason,'UNSAFE_NAVIGATION','form navigation rejection must be explicit and machine-readable');
    assert.equal(result.evidence?.capability,'form-navigation','form navigation must identify its capability');
  };

  await assertContained(await loadFormCase("document.querySelector('#escape-form').requestSubmit()"));
  const directSubmitState=await loadFormCase("document.querySelector('#escape-form').submit()");
  await assertContained(directSubmitState);

  await page.locator('#preview-run').click();
  await page.waitForTimeout(180);
  assert.equal(sinkHits,0,'explicit preview execution must not submit the form onto the network');
  const summary=await page.locator('#summary').textContent();
  assert.match(summary||'',/UNSAFE_NAVIGATION/,'blocked direct form navigation in preview must be visible to the user');

  console.log('Form-navigation containment PASS: requestSubmit and direct submit are blocked and surfaced consistently across deterministic and preview execution.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
  await new Promise(resolve=>sink.close(resolve));
}
