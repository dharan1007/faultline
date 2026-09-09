import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const faultlinePort=4221;
const targetPort=4222;
const faultlineServer=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js')||f.endsWith('.mjs'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');if(f.endsWith('.css'))res.setHeader('content-type','text/css');res.end(b)})}).listen(${faultlinePort},'127.0.0.1')`],{stdio:'inherit'});
const targetServer=spawn(process.execPath,['-e',`const http=require('http');http.createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('content-type','application/javascript');return res.end("document.querySelector('#trigger').addEventListener('click',()=>document.querySelector('#status').setAttribute('data-broken','true'));\n")}if(req.url==='/style.css'){res.setHeader('content-type','text/css');return res.end('#status{font-weight:700}.noise{display:block}')};res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html><head><title>Captured regression</title><link rel="stylesheet" href="/style.css"></head><body><main><button id="trigger">Trigger</button><p id="status" data-broken="false">ready</p><p class="noise">noise</p></main><script src="/app.js"></script></body></html>')}).listen(${targetPort},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,800));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:900,height:700}});
  const targetPage=await context.newPage();
  await targetPage.goto(`http://127.0.0.1:${targetPort}/`,{waitUntil:'networkidle'});

  const faultlinePage=await context.newPage();
  await faultlinePage.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>tools.push({...tool,execute:async(input,options)=>JSON.stringify(await tool.execute(input,options))})}});
    window.__webmcpTools=tools;
  });
  await faultlinePage.goto(`http://127.0.0.1:${faultlinePort}/`,{waitUntil:'networkidle'});
  await faultlinePage.waitForFunction(()=>window.faultline&&window.__webmcpTools?.length);

  const manifest=await faultlinePage.evaluate(()=>window.faultline.manifest());
  assert.ok(manifest.some(tool=>tool.name==='faultline_load_capture'),'WebMCP/browser manifest must expose faultline_load_capture');
  assert.equal(await faultlinePage.evaluate(()=>typeof window.faultline.loadCapture),'function','browser API must expose loadCapture');
  assert.ok(existsSync(new URL('../integrations/playwright/index.mjs',import.meta.url)),'Playwright capture integration module must exist');

  const { captureFaultlineBaseline }=await import('../integrations/playwright/index.mjs');
  const oracle={kind:'dom_attribute',selector:'#status',property:'data-broken',equals:'true',action:{kind:'click',selector:'#trigger'},delayMs:0};
  const capture=await captureFaultlineBaseline(targetPage,{oracle,includeJavaScript:true,playwright:{projectName:'chromium',testTitle:'captured browser regression'}});

  assert.equal(capture.schema,'faultline.capture.v1');
  assert.equal(capture.provenance.url,`http://127.0.0.1:${targetPort}/`);
  assert.equal(capture.provenance.title,'Captured regression');
  assert.deepEqual(capture.provenance.viewport,{width:900,height:700});
  assert.equal(capture.provenance.playwright.testTitle,'captured browser regression');
  assert.match(capture.case.html,/id="trigger"/);
  assert.doesNotMatch(capture.case.html,/<script|stylesheet/i,'captured HTML must not retain duplicate executable/resource-loading elements');
  assert.match(capture.case.css,/#status\s*\{/,'accessible CSSOM must be captured');
  assert.match(capture.case.js,/data-broken/,'same-origin external JavaScript must be captured when explicitly enabled');
  assert.deepEqual(capture.case.oracle,oracle);
  assert.ok(Array.isArray(capture.diagnostics.omittedResources));
  assert.ok(capture.diagnostics.capturedScripts.some(item=>item.url.endsWith('/app.js')));

  const before=await faultlinePage.evaluate(()=>window.faultline.inspect());
  const loaded=await faultlinePage.evaluate(({revision,capture})=>window.faultline.loadCapture({expectedRevision:revision,capture}),{revision:before.revision,capture});
  assert.equal(loaded.revision,'r2','capture import must commit one canonical revision');
  assert.deepEqual(loaded.case,capture.case,'capture provenance/diagnostics must not leak into executable canonical case');
  assert.equal(loaded.capture.schema,'faultline.capture.v1');
  assert.equal(loaded.capture.url,capture.provenance.url);
  const run=await faultlinePage.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:loaded.revision});
  assert.equal(run.status,'FAIL','captured baseline plus action/oracle must reproduce the real browser failure');
  assert.equal(run.evidence.actual,'true');

  const afterRun=await faultlinePage.evaluate(()=>window.faultline.inspect());
  const stale=await faultlinePage.evaluate(({staleRevision,capture})=>{try{window.faultline.loadCapture({expectedRevision:staleRevision,capture});return null}catch(error){return String(error?.message||error)}},{staleRevision:before.revision,capture});
  assert.match(stale,/^STALE_REVISION/,'capture import must preserve optimistic concurrency');

  const invalid={...capture,schema:'faultline.capture.v999'};
  const invalidResult=await faultlinePage.evaluate(({revision,invalid})=>{try{window.faultline.loadCapture({expectedRevision:revision,capture:invalid});return null}catch(error){return String(error?.message||error)}},{revision:afterRun.revision,invalid});
  assert.equal(invalidResult,'INVALID_CAPTURE_SCHEMA');
  const afterInvalid=await faultlinePage.evaluate(()=>window.faultline.inspect());
  assert.equal(afterInvalid.revision,afterRun.revision,'invalid capture must not mutate revision');
  assert.deepEqual(afterInvalid.case,afterRun.case,'invalid capture must leave canonical case untouched');

  const tool=await faultlinePage.evaluate(()=>{const entry=window.__webmcpTools.find(item=>item.name==='faultline_load_capture');return entry&&{inputSchema:entry.inputSchema};});
  assert.deepEqual(tool.inputSchema.required,['expectedRevision','capture']);
  assert.deepEqual(tool.inputSchema.properties.capture.properties.schema.enum,['faultline.capture.v1']);
  assert.equal(tool.inputSchema.properties.capture.additionalProperties,false);

  await faultlinePage.waitForSelector('#capture-import-json');
  await faultlinePage.evaluate(()=>window.faultline.resetCase({expectedRevision:window.faultline.inspect().revision}));
  const fixtureRevision=await faultlinePage.evaluate(()=>window.faultline.inspect().revision);
  await faultlinePage.fill('#capture-import-json',JSON.stringify(capture));
  await faultlinePage.click('#import-capture');
  await faultlinePage.waitForFunction(previous=>window.faultline.inspect().revision!==previous,fixtureRevision);
  const humanLoaded=await faultlinePage.evaluate(()=>window.faultline.inspect());
  assert.deepEqual(humanLoaded.case,capture.case,'human capture paste path must use the same canonical importer');
  assert.match(await faultlinePage.locator('#summary').textContent(),/Captured regression|127\.0\.0\.1/,'human import must surface capture provenance');

  const moduleSource=readFileSync(new URL('../integrations/playwright/index.mjs',import.meta.url),'utf8');
  assert.match(moduleSource,/createFaultlineTest/,'integration must provide a reusable Playwright failure fixture, not only a one-off snapshot helper');

  console.log('Playwright failure capture PASS: a real browser baseline becomes a versioned artifact, imports through Browser API/WebMCP/human UI, and deterministically reproduces FAIL.');
} finally {
  if(browser)await browser.close();
  faultlineServer.kill('SIGTERM');
  targetServer.kill('SIGTERM');
}