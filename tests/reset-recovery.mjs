import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4194;
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
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.some(tool=>tool.name==='faultline_reset_case'));

  const fixture=await page.evaluate(()=>window.faultline.inspect().case);
  assert.equal(await page.evaluate(()=>typeof window.faultline.resetCase),'function','browser API must expose guarded recoverable fixture reset');

  const customCase={
    html:'<main><button id="trigger">Trigger</button><p id="keep">keep me</p></main>',
    css:'#trigger{display:block} #keep{font-weight:700}',
    js:"document.querySelector('#trigger').dataset.ready='yes';",
    oracle:{kind:'dom_exists',selector:'#trigger',equals:true,action:{kind:'none',selector:''},delayMs:0}
  };

  const loaded=await page.evaluate(({customCase})=>window.faultline.loadCase({expectedRevision:'r1',case:customCase}),{customCase});
  assert.equal(loaded.revision,'r2');

  const reset=await page.evaluate(()=>window.faultline.resetCase({expectedRevision:'r2'}));
  assert.equal(reset.revision,'r3','reset must advance exactly one canonical revision instead of rewinding to r1');
  assert.deepEqual(reset.case,fixture,'reset must restore the canonical fixture atomically');
  assert.deepEqual(reset.pins,[],'reset must clear pins atomically');

  const stale=await page.evaluate(()=>{
    try{window.faultline.resetCase({expectedRevision:'r2'});return null}catch(error){return String(error?.message||error)}
  });
  assert.match(stale,/^STALE_REVISION/,'reset must reject stale optimistic revisions');
  const afterStale=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(afterStale.revision,'r3','stale reset must not mutate canonical revision');
  assert.deepEqual(afterStale.case,fixture,'stale reset must not mutate canonical case');

  const restored=await page.evaluate(()=>window.faultline.restore({expectedRevision:'r3',targetRevision:'r2'}));
  assert.equal(restored.revision,'r4','pre-reset state must remain recoverable as a prior revision');
  assert.deepEqual(restored.case,customCase,'restore after reset must recover the exact pre-reset case');

  await page.evaluate(()=>document.getElementById('reset').click());
  await page.waitForFunction(()=>window.faultline.inspect().revision==='r5');
  const uiReset=await page.evaluate(()=>window.faultline.inspect());
  assert.deepEqual(uiReset.case,fixture,'human Reset fixture action must use the canonical recoverable reset path');

  const tool=await page.evaluate(()=>{
    const entry=window.__webmcpTools.find(item=>item.name==='faultline_reset_case');
    return entry&&{name:entry.name,inputSchema:entry.inputSchema,annotations:entry.annotations};
  });
  assert.ok(tool,'WebMCP must expose the same guarded reset capability as the human/browser API');
  assert.deepEqual(tool.inputSchema.required,['expectedRevision'],'WebMCP reset must require an optimistic revision guard');
  assert.equal(tool.annotations.readOnlyHint,false,'reset is mutating and must not be annotated read-only');

  console.log('Recoverable reset PASS: fixture reset is revision-guarded, restorable, shared by UI/browser API/WebMCP, and never rewinds canonical history.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}