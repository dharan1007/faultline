import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4173;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const requests=[];
  page.on('request',request=>requests.push(request.url()));
  await page.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async(tool)=>{if(!tool?.name||!tool?.description||typeof tool.execute!=='function')throw new TypeError('invalid WebMCP tool');if(tool.handler)throw new TypeError('legacy handler is forbidden');tools.push(tool);}}});
    window.__webmcpTools=tools;
  });
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const response=await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  assert.equal(response.status(),200);
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length===12);
  assert.deepEqual(await page.evaluate(()=>Object.keys(window.faultline).sort()),['applySource','autopilot','defineOracle','exportCase','history','inspect','loadCase','manifest','pin','probe','reduce','restore','run'].sort());
  assert.equal(await page.locator('#webmcp').textContent(),'WebMCP ready · 12 tools');
  const connectionText=await page.locator('.connection').textContent();
  assert.match(connectionText,/twelve WebMCP tools/i);
  assert.match(connectionText,/faultline_load_case/);
  assert.match(connectionText,/faultline_apply_source/);
  assert.match(connectionText,/expectedRevision/);
  const toolContract=await page.evaluate(()=>window.__webmcpTools.map(t=>({name:t.name,execute:typeof t.execute,handler:'handler' in t})));
  assert.equal(toolContract.length,12);assert.ok(toolContract.every(t=>t.execute==='function'&&!t.handler));

  const guardedToolNames=['faultline_load_case','faultline_run','faultline_define_oracle','faultline_apply_source','faultline_probe','faultline_reduce','faultline_pin','faultline_restore','faultline_autopilot'];
  const guardedContracts=await page.evaluate(names=>Object.fromEntries(names.map(name=>{const t=window.__webmcpTools.find(tool=>tool.name===name);return [name,{properties:Object.keys(t?.inputSchema?.properties||{}).sort(),required:[...(t?.inputSchema?.required||[])].sort()}]})),guardedToolNames);
  for(const name of guardedToolNames){
    assert.ok(guardedContracts[name].properties.includes('expectedRevision'),`${name} must expose expectedRevision`);
    assert.ok(guardedContracts[name].required.includes('expectedRevision'),`${name} must require expectedRevision`);
  }

  const sourceToolContract=await page.evaluate(()=>{const t=window.__webmcpTools.find(tool=>tool.name==='faultline_apply_source');return t&&{properties:Object.keys(t.inputSchema?.properties||{}).sort(),required:[...(t.inputSchema?.required||[])].sort(),additionalProperties:t.inputSchema?.additionalProperties};});
  assert.deepEqual(sourceToolContract,{properties:['expectedRevision','source','targetAxis'],required:['expectedRevision','source','targetAxis'],additionalProperties:false});
  const ingestBefore=await page.evaluate(()=>window.faultline.inspect());
  const ingested=await page.evaluate(async({expectedRevision,source})=>{const tool=window.__webmcpTools.find(t=>t.name==='faultline_apply_source');return JSON.parse(await tool.execute({expectedRevision,targetAxis:'js',source}));},{expectedRevision:ingestBefore.revision,source:ingestBefore.case.js+'\n/* ingested through WebMCP */'});
  assert.notEqual(ingested.revision,ingestBefore.revision);assert.ok(ingested.case.js.includes('ingested through WebMCP'));
  const staleRejected=await page.evaluate(async staleRevision=>{const tool=window.__webmcpTools.find(t=>t.name==='faultline_apply_source');try{await tool.execute({expectedRevision:staleRevision,targetAxis:'css',source:'body{color:red}'});return null}catch(e){return String(e?.message||e)}},ingestBefore.revision);
  assert.match(staleRejected,/STALE_REVISION/);
  const beforeStaleOracle=await page.evaluate(()=>window.faultline.inspect());
  const staleOracleRejected=await page.evaluate(async({staleRevision,oracle})=>{const tool=window.__webmcpTools.find(t=>t.name==='faultline_define_oracle');try{await tool.execute({expectedRevision:staleRevision,oracle});return null}catch(e){return String(e?.message||e)}},{staleRevision:ingestBefore.revision,oracle:beforeStaleOracle.case.oracle});
  assert.match(staleOracleRejected,/STALE_REVISION/);
  assert.equal((await page.evaluate(()=>window.faultline.inspect())).revision,beforeStaleOracle.revision,'stale WebMCP mutation must not change canonical revision');

  const concurrencyBefore=await page.evaluate(()=>window.faultline.inspect());
  const delayedOracle={...concurrencyBefore.case.oracle,delayMs:120};
  const delayed=await page.evaluate(({expectedRevision,oracle})=>window.faultline.defineOracle({expectedRevision,oracle}),{expectedRevision:concurrencyBefore.revision,oracle:delayedOracle});
  const concurrentResults=await page.evaluate(expectedRevision=>Promise.all([window.faultline.run({expectedRevision}),window.faultline.run({expectedRevision})]),delayed.revision);
  assert.deepEqual(concurrentResults.map(r=>r.status),['FAIL','FAIL'],'concurrent experiments must not overwrite the shared sandbox');
  assert.equal(concurrentResults.some(r=>r.evidence?.reason==='HOST_TIMEOUT'),false,'concurrent experiments must never induce HOST_TIMEOUT by replacing each other');
  const concurrencyAfter=await page.evaluate(()=>window.faultline.inspect());
  await page.evaluate(({expectedRevision,oracle})=>window.faultline.defineOracle({expectedRevision,oracle}),{expectedRevision:concurrencyAfter.revision,oracle:{...concurrencyAfter.case.oracle,delayMs:0}});

  const baselineRevision=(await page.evaluate(()=>window.faultline.inspect())).revision;
  const baseline=await page.evaluate(async expectedRevision=>JSON.parse(await window.__webmcpTools.find(t=>t.name==='faultline_run').execute({expectedRevision})),baselineRevision);assert.equal(baseline.status,'FAIL');
  const before=await page.evaluate(()=>window.faultline.inspect());assert.ok(before.case.html.includes('noise'));
  const noiseId=await page.evaluate(()=>{const u=[...document.querySelectorAll('.unit')].find(x=>x.textContent.includes('Irrelevant debug noise'));return u?.dataset.unitId});assert.ok(noiseId);
  const probe=await page.evaluate(id=>window.faultline.probe({targetAxis:'html',unitId:id}),noiseId);assert.equal(probe.status,'FAIL');assert.equal(probe.mutated,false);
  const reduction=await page.evaluate(()=>window.faultline.reduce({targetAxis:'html',maxTrials:40}));assert.equal(reduction.status,'FAIL');
  const after=await page.evaluate(()=>window.faultline.inspect());assert.ok(after.case.html.includes('modal'));assert.ok(!after.case.html.includes('Irrelevant debug noise'));assert.ok(after.revision!==before.revision);

  const persistedRevision=after.revision;const persistedHtml=after.case.html;
  await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length===12);
  const reloaded=await page.evaluate(()=>window.faultline.inspect());assert.equal(reloaded.revision,persistedRevision);assert.equal(reloaded.case.html,persistedHtml);assert.ok((await page.evaluate(()=>window.faultline.history())).length>=3);

  const edited=await page.evaluate(()=>window.faultline.applySource({targetAxis:'html',source:window.faultline.inspect().case.html+'<p id="reload-noise">reload noise</p>'}));assert.notEqual(edited.revision,persistedRevision);assert.ok(edited.case.html.includes('reload-noise'));
  const restored=await page.evaluate(targetRevision=>window.faultline.restore({targetRevision}),persistedRevision);assert.ok(!restored.case.html.includes('reload-noise'));assert.ok(restored.revision!==edited.revision);

  const requestCountBeforeContainment=requests.length;
  await page.evaluate(()=>window.faultline.applySource({targetAxis:'js',source:"fetch('/__faultline_side_effect__').catch(()=>{});"}));
  const containedRun=await page.evaluate(()=>window.faultline.run());assert.equal(containedRun.status,'FAIL');await page.waitForTimeout(150);
  assert.equal(requests.slice(requestCountBeforeContainment).some(url=>url.includes('/__faultline_side_effect__')),false,'experiment source escaped the sandbox and reached the network');

  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);assert.equal(await page.locator('#source').isVisible(),true);assert.equal(await page.locator('#preview').isVisible(),true);assert.equal(errors.length,0,errors.join('\n'));
  console.log('Browser gate PASS: Chromium loaded UI, registered 12 spec-valid WebMCP tools with revision guards on every canonical operation, serialized concurrent sandbox experiments, rejected stale source/oracle mutations, ran oracle, probed, reduced, persisted revisions across reload, restored a pre-reload snapshot, blocked experiment network side effects, and passed mobile overflow checks.');
} finally {if(browser)await browser.close();server.kill('SIGTERM');}