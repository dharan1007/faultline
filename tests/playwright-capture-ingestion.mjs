import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import assert from 'node:assert/strict';
import { captureFaultlineFailure } from '../capture/playwright.mjs';

const fixturePort=4196;
const workbenchPort=4197;

const fixtureHtml=`<!doctype html><html><head><style>#status{font-weight:700}.noise{color:#777}</style></head><body>
<main id="app"><label>Name <input id="name"></label><button id="save">Save</button><p id="status">idle</p><p class="noise">remove me</p></main>
<script>
const name=document.querySelector('#name');
const save=document.querySelector('#save');
const status=document.querySelector('#status');
save.addEventListener('click',()=>{status.textContent=name.value==='alice'?'broken':'ok';});
</script></body></html>`;

const fixtureServer=createServer((req,res)=>{
  if(req.url==='/favicon.ico'){res.statusCode=204;return res.end();}
  res.setHeader('content-type','text/html; charset=utf-8');
  res.end(fixtureHtml);
});

const workbenchServer=createServer(async(req,res)=>{
  try{
    let pathname=new URL(req.url,'http://127.0.0.1').pathname;
    if(pathname==='/')pathname='/index.html';
    const file=join(process.cwd(),pathname);
    if(!file.startsWith(process.cwd())){res.statusCode=403;return res.end('forbidden');}
    const body=await readFile(file);
    const type={'.js':'application/javascript','.mjs':'application/javascript','.html':'text/html; charset=utf-8','.json':'application/json'}[extname(file)]||'application/octet-stream';
    res.setHeader('content-type',type);
    res.end(body);
  }catch{
    res.statusCode=404;
    res.end('not found');
  }
});

await new Promise(resolve=>fixtureServer.listen(fixturePort,'127.0.0.1',resolve));
await new Promise(resolve=>workbenchServer.listen(workbenchPort,'127.0.0.1',resolve));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext();
  const fixturePage=await context.newPage();
  await fixturePage.goto(`http://127.0.0.1:${fixturePort}/`,{waitUntil:'networkidle'});

  const capture=await captureFaultlineFailure(fixturePage,{
    label:'real form regression',
    actions:[
      {kind:'set_value',selector:'#name',value:'alice'},
      {kind:'click',selector:'#save'}
    ],
    oracle:{kind:'dom_property',selector:'#status',property:'textContent',equals:'broken',delayMs:0}
  });

  assert.equal(capture.schema,'faultline.capture.v1');
  assert.equal(capture.expectedStatus,'FAIL');
  assert.equal(capture.provenance.label,'real form regression');
  assert.match(capture.provenance.url,/127\.0\.0\.1/);
  assert.match(capture.source.html,/id="name"/);
  assert.doesNotMatch(capture.source.html,/<script/i);
  assert.match(capture.source.js,/addEventListener\('click'/);
  assert.equal(capture.oracle.action.kind,'sequence');
  assert.deepEqual(capture.oracle.action.steps,[
    {kind:'set_value',selector:'#name',value:'alice'},
    {kind:'click',selector:'#save'}
  ]);

  const page=await context.newPage();
  await page.addInitScript(()=>{
    const registrations=new Map();
    Object.defineProperty(window,'__faultlineTools',{configurable:true,value:registrations});
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async(definition)=>{registrations.set(definition.name,definition);}}});
  });
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  await page.goto(`http://127.0.0.1:${workbenchPort}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline&&window.__faultlineTools?.size>0);

  assert.equal(await page.locator('#capture-import-json').count(),1,'human workflow must expose a labelled capture JSON editor');
  assert.equal(await page.locator('label[for="capture-import-json"]').count(),1,'capture editor must have an accessible label');
  assert.equal(await page.locator('#import-capture').count(),1,'human workflow must expose explicit capture import');
  assert.equal(await page.locator('#export-capture-json').count(),1,'capture export control must be discoverable');
  assert.equal(await page.locator('#export-capture-json').isDisabled(),true,'capture export must remain disabled without provenance');

  const before=await page.evaluate(()=>window.faultline.inspect());
  const imported=await page.evaluate(async({expectedRevision,capture})=>window.faultline.importCapture({expectedRevision,capture}),{expectedRevision:before.revision,capture});
  assert.equal(imported.baseline.status,'FAIL','capture must baseline-reproduce before canonical commit');
  assert.equal(imported.state.captureProvenance.label,'real form regression');
  assert.equal(imported.state.captureProvenance.url,capture.provenance.url);
  assert.equal(Number(imported.state.revision.slice(1)),Number(before.revision.slice(1))+1,'successful capture import must commit exactly once');
  assert.equal(imported.state.case.oracle.action.kind,'sequence');
  assert.equal(await page.evaluate(()=>window.faultline.manifest().some(tool=>tool.name==='faultline_import_capture')),true,'WebMCP manifest must expose capture ingestion');
  assert.equal(await page.evaluate(()=>window.__faultlineTools.has('faultline_import_capture')),true,'native WebMCP registration must expose capture ingestion');
  assert.equal(await page.evaluate(()=>window.__faultlineTools.get('faultline_import_capture').inputSchema.properties.capture.properties.schema.const),'faultline.capture.v1');

  const afterDirect=await page.evaluate(()=>window.faultline.inspect());
  const resetToBefore=await page.evaluate(({expectedRevision,original})=>window.faultline.loadCase({expectedRevision,case:original}),{expectedRevision:afterDirect.revision,original:before.case});
  assert.equal(resetToBefore.captureProvenance,null,'raw case load must deliberately clear capture provenance');

  const webmcpImported=await page.evaluate(async({expectedRevision,capture})=>{
    const tool=window.__faultlineTools.get('faultline_import_capture');
    return await tool.execute({expectedRevision,capture,requestId:'capture-e2e'});
  },{expectedRevision:resetToBefore.revision,capture});
  const webmcpState=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(webmcpState.captureProvenance.label,'real form regression','WebMCP import must use canonical provenance state');
  assert.equal(webmcpImported.content?.[0]?.type||'text','text','native WebMCP result must remain serializable through registered surface');

  const resetAgain=await page.evaluate(({expectedRevision,original})=>window.faultline.loadCase({expectedRevision,case:original}),{expectedRevision:webmcpState.revision,original:before.case});
  await page.locator('#capture-import-json').fill(JSON.stringify(capture,null,2));
  await page.locator('#import-capture').click();
  await page.waitForFunction(previous=>window.faultline.inspect().revision!==previous,resetAgain.revision);
  const humanState=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(humanState.captureProvenance.label,'real form regression','human import must use canonical importCapture path');
  assert.equal(await page.locator('#export-capture-json').isDisabled(),false,'capture export must enable after successful import');
  assert.match(await page.locator('#summary').textContent(),/baseline.*FAIL/i,'human workflow must visibly confirm baseline failure');
  const exportedCapture=await page.evaluate(()=>window.faultline.exportCapture());
  assert.equal(exportedCapture.schema,'faultline.capture.v1');
  assert.equal(exportedCapture.provenance.url,capture.provenance.url);
  assert.deepEqual(exportedCapture.source,{html:humanState.case.html,css:humanState.case.css,js:humanState.case.js},'capture export must reflect the current reducible source while retaining provenance');

  const canonicalAfter=await page.evaluate(()=>window.faultline.inspect());
  const run=await page.evaluate(()=>window.faultline.run());
  assert.equal(run.status,'FAIL','imported real failure must execute through canonical sandbox');

  const staleError=await page.evaluate(async({capture,staleRevision})=>{
    try{await window.faultline.importCapture({expectedRevision:staleRevision,capture});return null;}
    catch(error){return String(error?.message||error);}
  },{capture,staleRevision:before.revision});
  assert.equal(staleError,'STALE_REVISION');
  const afterStale=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(afterStale.revision,canonicalAfter.revision,'stale capture import must not mutate revision');
  assert.deepEqual(afterStale.case,canonicalAfter.case,'stale capture import must not mutate case');
  assert.deepEqual(afterStale.captureProvenance,canonicalAfter.captureProvenance,'stale capture import must not mutate provenance');

  const passingCapture=structuredClone(capture);
  passingCapture.oracle.equals='not-broken';
  const passError=await page.evaluate(async({capture,expectedRevision})=>{
    try{await window.faultline.importCapture({expectedRevision,capture});return null;}
    catch(error){return String(error?.message||error);}
  },{capture:passingCapture,expectedRevision:canonicalAfter.revision});
  assert.equal(passError,'CAPTURE_BASELINE_PASS');
  const afterPass=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(afterPass.revision,canonicalAfter.revision,'non-failing capture must not mutate revision');
  assert.deepEqual(afterPass.case,canonicalAfter.case,'non-failing capture must not mutate case');
  assert.deepEqual(afterPass.captureProvenance,canonicalAfter.captureProvenance,'non-failing capture must not mutate provenance');

  assert.equal(pageErrors.length,0,pageErrors.join('\n'));
  console.log('Playwright capture ingestion PASS: real-page failure becomes a provenance-bound canonical case through browser API, WebMCP, and accessible human import only after baseline reproduction.');
} finally {
  if(browser)await browser.close();
  await new Promise(resolve=>fixtureServer.close(resolve));
  await new Promise(resolve=>workbenchServer.close(resolve));
}
