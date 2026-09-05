import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4202;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>tools.push(tool)}});
    window.__webmcpTools=tools;
  });
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline && document.getElementById('preview'));
  const preview=page.frameLocator('#preview');

  const initial=await page.evaluate(()=>window.faultline.inspect());
  const nextCase={
    html:'<main><button id="keep">Keep</button><p id="noise">Transient candidate noise</p></main>',
    css:'#keep{display:block} #noise{display:block}',
    js:'document.querySelector("#keep").dataset.ready="yes";',
    oracle:{kind:'dom_exists',selector:'#keep',equals:true,action:{kind:'none',selector:''},delayMs:0}
  };
  const loaded=await page.evaluate(({revision,nextCase})=>window.faultline.loadCase({expectedRevision:revision,case:nextCase}),{revision:initial.revision,nextCase});
  await preview.locator('#noise').waitFor({state:'attached'});
  assert.equal(await preview.locator('#noise').textContent(),'Transient candidate noise','visible preview must refresh immediately after complete case load');
  assert.deepEqual(loaded.case,nextCase,'canonical case must load before preview verification');

  const noiseUnit=await page.evaluate(()=>{
    const row=[...document.querySelectorAll('#units .unit')].find(el=>el.textContent.includes('Transient candidate noise'));
    return row?.dataset.unitId||null;
  });
  assert.ok(noiseUnit,'fixture must expose the removable noise as a semantic unit');

  const probe=await page.evaluate(async ({revision,noiseUnit})=>window.faultline.probe({expectedRevision:revision,targetAxis:'html',unitId:noiseUnit}),{revision:loaded.revision,noiseUnit});
  assert.equal(probe.mutated,false,'probe must remain non-mutating');
  const afterProbe=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(afterProbe.revision,loaded.revision,'probe must not advance canonical revision');
  assert.deepEqual(afterProbe.case,nextCase,'probe must leave canonical case untouched');
  assert.equal(await preview.locator('#noise').textContent(),'Transient candidate noise','visible preview must remain canonical after a non-mutating probe');

  const reset=await page.evaluate(({revision})=>window.faultline.resetCase({expectedRevision:revision}),{revision:afterProbe.revision});
  await preview.locator('#modal').waitFor({state:'attached'});
  assert.equal(reset.case.html.includes('id="modal"'),true,'reset must restore canonical fixture');
  assert.equal(await preview.locator('#modal').getAttribute('id'),'modal','visible preview must refresh immediately after canonical reset');
  assert.equal(await preview.locator('#noise').textContent(),'Irrelevant debug noise','visible preview must reflect the reset fixture rather than an experiment candidate');

  console.log('Canonical preview isolation PASS: canonical mutations refresh the visible preview and non-mutating probes cannot replace it with an experiment candidate.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}