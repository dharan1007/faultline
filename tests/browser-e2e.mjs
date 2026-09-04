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
  await page.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{
      registerTool:async(tool)=>{
        if(!tool?.name||!tool?.description||typeof tool.execute!=='function')throw new TypeError('invalid WebMCP tool');
        if(tool.handler)throw new TypeError('legacy handler is forbidden');
        tools.push(tool);
      }
    }});
    window.__webmcpTools=tools;
  });
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const response=await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  assert.equal(response.status(),200);
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length===10);
  assert.deepEqual(await page.evaluate(()=>Object.keys(window.faultline).sort()),['applySource','autopilot','defineOracle','exportCase','history','inspect','manifest','pin','probe','reduce','restore','run'].sort());
  assert.equal(await page.locator('#webmcp').textContent(),'WebMCP ready · 10 tools');
  const toolContract=await page.evaluate(()=>window.__webmcpTools.map(t=>({name:t.name,execute:typeof t.execute,handler:'handler' in t})));
  assert.equal(toolContract.length,10);assert.ok(toolContract.every(t=>t.execute==='function'&&!t.handler));

  const baseline=await page.evaluate(()=>window.faultline.run());
  assert.equal(baseline.status,'FAIL');
  const before=await page.evaluate(()=>window.faultline.inspect());
  assert.ok(before.case.html.includes('noise'));
  const noiseId=await page.evaluate(()=>{const u=[...document.querySelectorAll('.unit')].find(x=>x.textContent.includes('Irrelevant debug noise'));return u?.dataset.unitId});
  assert.ok(noiseId);
  const probe=await page.evaluate(id=>window.faultline.probe({targetAxis:'html',unitId:id}),noiseId);
  assert.equal(probe.status,'FAIL');assert.equal(probe.mutated,false);
  const reduction=await page.evaluate(()=>window.faultline.reduce({targetAxis:'html',maxTrials:40}));
  assert.equal(reduction.status,'FAIL');
  const after=await page.evaluate(()=>window.faultline.inspect());
  assert.ok(after.case.html.includes('modal'));
  assert.ok(!after.case.html.includes('Irrelevant debug noise'));
  assert.ok(after.revision!==before.revision);

  const persistedRevision=after.revision;
  const persistedHtml=after.case.html;
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length===10);
  const reloaded=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(reloaded.revision,persistedRevision);
  assert.equal(reloaded.case.html,persistedHtml);
  assert.ok((await page.evaluate(()=>window.faultline.history())).length>=3);

  const edited=await page.evaluate(()=>window.faultline.applySource({targetAxis:'html',source:window.faultline.inspect().case.html+'<p id="reload-noise">reload noise</p>'}));
  assert.notEqual(edited.revision,persistedRevision);
  assert.ok(edited.case.html.includes('reload-noise'));
  const restored=await page.evaluate(targetRevision=>window.faultline.restore({targetRevision}),persistedRevision);
  assert.ok(!restored.case.html.includes('reload-noise'));
  assert.ok(restored.revision!==edited.revision);

  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  assert.equal(await page.locator('#source').isVisible(),true);
  assert.equal(await page.locator('#preview').isVisible(),true);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('Browser gate PASS: Chromium loaded UI, registered 10 spec-valid WebMCP tools, ran oracle, probed, reduced, persisted revisions across reload, restored a pre-reload snapshot, and passed mobile overflow checks.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
