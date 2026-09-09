import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { captureFaultlineCase } from '../playwright/faultline-capture.mjs';

const targetPort=4201;
const workbenchPort=4202;
const targetHtml=`<!doctype html><html><head><title>Broken checkout</title><style>#status{color:rgb(255, 0, 0);font-weight:700}.noise{display:block}</style></head><body><main><p id="status" data-state="broken">Checkout failed</p><p class="noise">irrelevant capture noise</p></main></body></html>`;
const targetServer=spawn(process.execPath,['-e',`const http=require('http');const html=${JSON.stringify(targetHtml)};http.createServer((req,res)=>{res.setHeader('content-type','text/html; charset=utf-8');res.end(html)}).listen(${targetPort},'127.0.0.1')`],{stdio:'inherit'});
const workbenchServer=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${workbenchPort},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,800));

let browser;
try {
  browser=await chromium.launch({headless:true});
  const targetPage=await browser.newPage({viewport:{width:1280,height:720}});
  await targetPage.goto(`http://127.0.0.1:${targetPort}/checkout`,{waitUntil:'networkidle'});
  const outputDir=await mkdtemp(join(tmpdir(),'faultline-capture-'));
  const outputPath=join(outputDir,'checkout.faultline.json');
  const oracle={kind:'dom_attribute',selector:'#status',property:'data-state',equals:'broken',action:{kind:'none'},delayMs:0};

  const artifact=await captureFaultlineCase({page:targetPage,oracle,outputPath,browserName:'chromium',capturedAt:'2026-09-09T12:00:00.000Z'});
  assert.equal(artifact.format,'faultline.capture');
  assert.equal(artifact.version,1);
  assert.match(artifact.case.html,/id="status"/,'capture must snapshot the failing DOM directly from Playwright');
  assert.match(artifact.case.html,/irrelevant capture noise/,'capture must preserve reducible DOM noise from the real page');
  assert.match(artifact.case.css,/#status/,'capture must collect accessible browser CSS instead of requiring a hand-authored source case');
  assert.equal(artifact.case.js,'','snapshot capture must not invent application JavaScript');
  assert.deepEqual(artifact.case.oracle,oracle);
  assert.equal(artifact.baseline.status,'FAIL','adapter must prove the requested failure condition exists on the live Playwright page');
  assert.equal(artifact.baseline.evidence.actual,'broken');
  assert.deepEqual(JSON.parse(await readFile(outputPath,'utf8')),artifact,'written capture artifact must equal the validated returned artifact');

  const workbench=await browser.newPage({viewport:{width:1280,height:900}});
  await workbench.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>tools.push({...tool,execute:async(input,options)=>JSON.stringify(await tool.execute(input,options))})}});
    window.__webmcpTools=tools;
  });
  const pageErrors=[];
  workbench.on('pageerror',error=>pageErrors.push(String(error)));
  await workbench.goto(`http://127.0.0.1:${workbenchPort}/`,{waitUntil:'networkidle'});
  await workbench.waitForFunction(()=>window.faultline&&window.__webmcpTools?.some(tool=>tool.name==='faultline_import_capture'));

  const toolContract=await workbench.evaluate(()=>{const tool=window.__webmcpTools.find(item=>item.name==='faultline_import_capture');return tool&&{required:tool.inputSchema.required,properties:Object.keys(tool.inputSchema.properties).sort()};});
  assert.deepEqual(toolContract.required,['expectedRevision','artifact']);
  assert.ok(toolContract.properties.includes('artifact'));
  assert.ok(toolContract.properties.includes('expectedRevision'));

  const before=await workbench.evaluate(()=>window.faultline.inspect());
  const imported=await workbench.evaluate(async ({expectedRevision,artifact})=>JSON.parse(await window.__webmcpTools.find(tool=>tool.name==='faultline_import_capture').execute({expectedRevision,artifact})),{expectedRevision:before.revision,artifact});
  assert.equal(imported.status,'IMPORTED');
  assert.equal(imported.baseline.status,'FAIL','FAULTLINE must independently re-run the captured case before committing it');
  assert.notEqual(imported.revision,before.revision);
  const after=await workbench.evaluate(()=>window.faultline.inspect());
  assert.deepEqual(after.case,artifact.case);
  assert.equal(after.capture?.provenance?.url,`http://127.0.0.1:${targetPort}/checkout`,'capture provenance must remain attached to canonical state');

  const reduced=await workbench.evaluate(()=>window.faultline.reduce({expectedRevision:window.faultline.inspect().revision,targetAxis:'html',maxTrials:40}));
  assert.equal(reduced.status,'FAIL');
  const afterReduce=await workbench.evaluate(()=>window.faultline.inspect());
  assert.equal(afterReduce.capture?.provenance?.url,`http://127.0.0.1:${targetPort}/checkout`,'reduction must retain source provenance');
  const exported=await workbench.evaluate(async()=>JSON.parse(await window.__webmcpTools.find(tool=>tool.name==='faultline_export').execute({})));
  assert.equal(exported.capture?.provenance?.url,`http://127.0.0.1:${targetPort}/checkout`,'WebMCP export must carry capture provenance beside the standalone reproducer');

  const nonFailing={...artifact,case:{...artifact.case,oracle:{...artifact.case.oracle,equals:'healthy'}},baseline:{...artifact.baseline,status:'FAIL'}};
  const stableBefore=await workbench.evaluate(()=>window.faultline.inspect());
  const rejected=await workbench.evaluate(async ({expectedRevision,artifact})=>{try{await window.__webmcpTools.find(tool=>tool.name==='faultline_import_capture').execute({expectedRevision,artifact});return null}catch(error){return String(error?.message||error)}},{expectedRevision:stableBefore.revision,artifact:nonFailing});
  assert.equal(rejected,'CAPTURE_BASELINE_NOT_FAILING:PASS','capture import must reject a case whose failure does not reproduce inside the FAULTLINE sandbox');
  const stableAfter=await workbench.evaluate(()=>window.faultline.inspect());
  assert.equal(stableAfter.revision,stableBefore.revision,'failed baseline verification must not mutate the canonical revision');
  assert.deepEqual(stableAfter.case,stableBefore.case,'failed baseline verification must leave canonical source untouched');
  assert.deepEqual(stableAfter.capture,stableBefore.capture,'failed baseline verification must leave capture provenance untouched');

  await workbench.locator('#case-import > summary').click();
  assert.equal(await workbench.locator('#capture-import-file').count(),1,'human workbench must keep an accessible capture-file surface');
  await workbench.locator('#capture-import-file').setInputFiles({name:'non-failing.faultline.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(nonFailing))});
  await workbench.locator('#import-capture').click();
  await workbench.waitForTimeout(100);
  const afterUiReject=await workbench.evaluate(()=>window.faultline.inspect());
  assert.equal(afterUiReject.revision,stableBefore.revision,'human capture import must use the same transactional baseline gate');
  assert.match(await workbench.locator('#summary').textContent(),/CAPTURE_BASELINE_NOT_FAILING:PASS/);
  assert.equal(pageErrors.length,0,pageErrors.join('\n'));

  console.log('Playwright capture ingestion PASS: a real failing page becomes a self-contained artifact without hand-authored source, WebMCP re-verifies FAIL transactionally, reduction preserves provenance, export carries origin metadata, and non-reproducing captures cannot mutate canonical state.');
} finally {
  if(browser)await browser.close();
  targetServer.kill('SIGTERM');
  workbenchServer.kill('SIGTERM');
}
