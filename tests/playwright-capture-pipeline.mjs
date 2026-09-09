import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const execFileAsync=promisify(execFile);
const faultlinePort=4237;
const targetPort=4238;
const root=process.cwd();
const temp=await mkdtemp(join(tmpdir(),'faultline-capture-'));
const configPath=join(temp,'capture.config.json');
const capturePath=join(temp,'failure.faultline.json');

const mime=path=>path.endsWith('.js')?'application/javascript':path.endsWith('.html')?'text/html; charset=utf-8':'text/plain';
const faultlineServer=createServer(async(req,res)=>{
  try{
    let pathname=new URL(req.url,'http://127.0.0.1').pathname;
    if(pathname==='/')pathname='/index.html';
    const file=resolve(root,`.${pathname}`);
    if(!file.startsWith(root)){res.writeHead(403);return res.end('forbidden');}
    const body=await readFile(file);
    res.setHeader('content-type',mime(file));
    res.end(body);
  }catch{res.writeHead(404);res.end('not found');}
});
const targetHtml=`<!doctype html><html><head><title>Captured checkout failure</title><style>.bug{font-weight:700}.noise{opacity:.5}</style></head><body>
<button id="trigger" type="button">Open checkout</button>
<p id="bug" class="bug" data-state="closed">Checkout state</p>
<span class="noise">unrelated analytics label</span>
<script>document.querySelector('#trigger').addEventListener('click',()=>document.querySelector('#bug').setAttribute('data-state','wrong'));</script>
</body></html>`;
const targetServer=createServer((req,res)=>{res.setHeader('content-type','text/html; charset=utf-8');res.end(targetHtml);});
await Promise.all([
  new Promise(resolveListen=>faultlineServer.listen(faultlinePort,'127.0.0.1',resolveListen)),
  new Promise(resolveListen=>targetServer.listen(targetPort,'127.0.0.1',resolveListen))
]);

let browser;
try{
  const config={
    url:`http://127.0.0.1:${targetPort}/`,
    output:capturePath,
    viewport:{width:960,height:720},
    actions:[{kind:'click',selector:'#trigger'}],
    oracle:{kind:'dom_attribute',selector:'#bug',property:'data-state',equals:'open',action:{kind:'click',selector:'#trigger'},delayMs:0}
  };
  await writeFile(configPath,JSON.stringify(config,null,2));
  await execFileAsync(process.execPath,['scripts/capture-playwright.mjs','--config',configPath],{cwd:root});
  const capture=JSON.parse(await readFile(capturePath,'utf8'));
  assert.equal(capture.format,'faultline.capture.v1');
  assert.equal(capture.mode,'snapshot');
  assert.equal(capture.case.js,'','snapshot capture must not pretend to reconstruct application JavaScript');
  assert.match(capture.case.html,/data-state="wrong"/,'capture must contain the real post-interaction failing DOM state');
  assert.deepEqual(capture.case.oracle.action,{kind:'none'},'post-interaction snapshot must not replay capture actions in FAULTLINE');
  assert.deepEqual(capture.provenance.actions,[{kind:'click',selector:'#trigger'}]);
  assert.deepEqual(capture.unresolvedResources,[]);

  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>tools.push(tool)}});
    window.__webmcpTools=tools;
  });
  await page.goto(`http://127.0.0.1:${faultlinePort}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length>0);

  assert.equal(await page.evaluate(()=>typeof window.faultline.importCapture),'function');
  assert.equal(await page.evaluate(()=>typeof window.faultline.exportCapture),'function');
  const toolNames=await page.evaluate(()=>window.__webmcpTools.map(tool=>tool.name));
  assert.ok(toolNames.includes('faultline_import_capture'));
  assert.ok(toolNames.includes('faultline_export_capture'));
  assert.equal(await page.locator('#capture-file').getAttribute('aria-describedby'),'capture-import-help');
  assert.equal(await page.locator('#capture-import-json').getAttribute('aria-describedby'),'capture-import-help');

  const before=await page.evaluate(()=>window.faultline.inspect());
  const imported=await page.evaluate(async({expectedRevision,capture})=>{
    const tool=window.__webmcpTools.find(entry=>entry.name==='faultline_import_capture');
    return await tool.execute({expectedRevision,capture});
  },{expectedRevision:before.revision,capture});
  assert.equal(imported.baseline.status,'FAIL','capture import must prove the failure before canonical mutation');
  assert.notEqual(imported.revision,before.revision);
  assert.equal(imported.captureProvenance.provenance.url,`http://127.0.0.1:${targetPort}/`);
  assert.equal((await page.evaluate(()=>window.faultline.run())).status,'FAIL');

  const exported=await page.evaluate(()=>window.faultline.exportCapture());
  assert.equal(exported.format,'faultline.capture.v1');
  assert.equal(exported.provenance.url,capture.provenance.url);
  assert.deepEqual(exported.case,imported.case);

  const failRevision=imported.revision;
  const nonFailing=structuredClone(capture);
  nonFailing.case.oracle.equals='wrong';
  const passRejection=await page.evaluate(async({expectedRevision,capture})=>{
    try{await window.faultline.importCapture({expectedRevision,capture});return 'NO_ERROR';}catch(error){return error.message;}
  },{expectedRevision:failRevision,capture:nonFailing});
  assert.equal(passRejection,'CAPTURE_BASELINE_NOT_FAILING');
  assert.equal((await page.evaluate(()=>window.faultline.inspect().revision)),failRevision,'PASS preflight must be non-mutating');

  const unresolved=structuredClone(capture);
  unresolved.unresolvedResources=['https://example.invalid/theme.css'];
  const unresolvedRejection=await page.evaluate(async({expectedRevision,capture})=>{
    try{await window.faultline.importCapture({expectedRevision,capture});return 'NO_ERROR';}catch(error){return error.message;}
  },{expectedRevision:failRevision,capture:unresolved});
  assert.equal(unresolvedRejection,'CAPTURE_UNRESOLVED_RESOURCES');
  assert.equal((await page.evaluate(()=>window.faultline.inspect().revision)),failRevision,'dependency-incomplete capture must be non-mutating');

  const staleRejection=await page.evaluate(async capture=>{
    try{await window.faultline.importCapture({expectedRevision:'r1',capture});return 'NO_ERROR';}catch(error){return error.message;}
  },capture);
  assert.equal(staleRejection,'STALE_REVISION');
  assert.equal((await page.evaluate(()=>window.faultline.inspect().revision)),failRevision);

  const reduced=await page.evaluate(async()=>{
    const state=window.faultline.inspect();
    return await window.faultline.reduce({expectedRevision:state.revision,axis:'html',maxTrials:64});
  });
  assert.equal(reduced.captureProvenance.provenance.url,capture.provenance.url,'reduction must retain capture provenance');
  const restored=await page.evaluate(targetRevision=>{
    const state=window.faultline.inspect();
    return window.faultline.restore({expectedRevision:state.revision,targetRevision});
  },failRevision);
  assert.equal(restored.captureProvenance.provenance.url,capture.provenance.url,'revision recovery must restore capture provenance');
  assert.deepEqual(restored.case,imported.case);

  const resetState=await page.evaluate(()=>{const state=window.faultline.inspect();return window.faultline.resetCase({expectedRevision:state.revision});});
  assert.equal(resetState.captureProvenance,null,'plain case load/reset must clear stale capture provenance');
  await page.locator('#capture-file').setInputFiles(capturePath);
  await page.waitForFunction(()=>document.getElementById('capture-import-json').value.includes('faultline.capture.v1'));
  const humanBefore=await page.evaluate(()=>window.faultline.inspect().revision);
  await page.locator('#import-capture').click();
  await page.waitForFunction(previous=>window.faultline.inspect().revision!==previous,humanBefore);
  const humanImported=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(humanImported.captureProvenance.provenance.url,capture.provenance.url);
  assert.equal(await page.locator('#health').textContent(),'FAIL');
  assert.match(await page.locator('#summary').textContent(),/CAPTURE VERIFIED · FAIL/);

  console.log('Playwright capture pipeline PASS: real browser interaction -> versioned snapshot -> WebMCP/human transactional FAIL import -> reduction/recovery provenance -> export, with PASS/unresolved/stale rollback.');
} finally {
  if(browser)await browser.close();
  await Promise.all([
    new Promise(resolveClose=>faultlineServer.close(resolveClose)),
    new Promise(resolveClose=>targetServer.close(resolveClose))
  ]);
}
