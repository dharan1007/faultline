import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4197;
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
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length>=14);

  assert.equal(await page.evaluate(()=>typeof window.faultline.revisions),'function','browser API must expose recoverable revision discovery');

  await page.evaluate(()=>window.faultline.applySource({expectedRevision:'r1',targetAxis:'html',source:'<main id="r2">two</main>'}));
  await page.evaluate(()=>window.faultline.applySource({expectedRevision:'r2',targetAxis:'css',source:'#r2{display:block}'}));

  const discovered=await page.evaluate(()=>window.faultline.revisions());
  assert.equal(discovered.currentRevision,'r3');
  assert.deepEqual(discovered.revisions.map(item=>item.revision).slice(0,3),['r3','r2','r1'],'recoverable revisions must be newest-first and include the current revision');
  assert.equal(discovered.revisions[0].current,true,'current revision must be explicit');
  assert.equal(discovered.revisions[1].event?.kind,'source_edit','revision discovery must explain the mutation that produced a revision');
  assert.equal(discovered.revisions[1].event?.axis,'html');
  assert.equal(discovered.revisions[1].summary?.oracleKind,'dom_property','revision discovery must provide enough safe metadata to choose a recovery point');
  assert.equal(typeof discovered.revisions[1].summary?.htmlChars,'number');

  const tool=await page.evaluate(()=>{
    const entry=window.__webmcpTools.find(item=>item.name==='faultline_revisions');
    return entry&&{name:entry.name,inputSchema:entry.inputSchema,annotations:entry.annotations};
  });
  assert.ok(tool,'WebMCP must expose revision discovery before faultline_restore');
  assert.equal(tool.annotations.readOnlyHint,true,'revision discovery must be read-only');
  assert.equal(tool.annotations.untrustedContentHint,false,'revision metadata must not expose candidate-controlled source text');

  const beforeTool=await page.evaluate(()=>window.faultline.inspect());
  const toolResult=await page.evaluate(async()=>{
    const entry=window.__webmcpTools.find(item=>item.name==='faultline_revisions');
    return JSON.parse(await entry.execute({limit:2},{}));
  });
  const afterTool=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(toolResult.revisions.length,2,'WebMCP limit must bound revision metadata');
  assert.equal(afterTool.revision,beforeTool.revision,'revision discovery must not mutate canonical state');
  assert.deepEqual(afterTool.case,beforeTool.case,'revision discovery must not mutate canonical source');

  const restored=await page.evaluate(({targetRevision})=>window.faultline.restore({expectedRevision:'r3',targetRevision}),{targetRevision:toolResult.revisions[1].revision});
  assert.equal(restored.revision,'r4','a discovered revision ID must be directly usable with restore');
  assert.equal(restored.case.html,'<main id="r2">two</main>');

  await page.waitForSelector('#revision-recovery');
  const ui=await page.evaluate(()=>({
    text:document.getElementById('revision-recovery')?.textContent||'',
    buttons:[...document.querySelectorAll('#revision-recovery button[data-revision]')].map(button=>({revision:button.dataset.revision,disabled:button.disabled}))
  }));
  assert.match(ui.text,/Recoverable revisions/i,'human UI must expose recovery instead of hiding it behind the browser API');
  assert.ok(ui.buttons.some(button=>button.revision==='r3'&&!button.disabled),'human UI must offer a prior recoverable revision as a restore action');

  console.log('Revision discovery PASS: humans and WebMCP agents can enumerate bounded recoverable revisions and feed a discovered ID directly into guarded restore.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
