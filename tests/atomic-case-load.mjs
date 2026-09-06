import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4191;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>tools.push({...tool,execute:async(input,options)=>JSON.stringify(await tool.execute(input,options))})}});
    window.__webmcpTools=tools;
  });
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.some(tool=>tool.name==='faultline_load_case'));

  const before=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(await page.evaluate(()=>typeof window.faultline.loadCase),'function','browser API must expose an atomic complete-case loader');

  const nextCase={
    html:'<main><button id="go">Go</button><p id="noise">noise</p></main>',
    css:'#go{opacity:1} #noise{display:block}',
    js:"document.querySelector('#go').dataset.clicked='yes';",
    oracle:{kind:'dom_exists',selector:'#go',equals:true,action:{kind:'none',selector:''},delayMs:0}
  };
  const loaded=await page.evaluate(async ({revision,nextCase})=>window.faultline.loadCase({expectedRevision:revision,case:nextCase}),{revision:before.revision,nextCase});
  assert.equal(loaded.revision,'r2','loading a complete case must advance canonical state exactly once');
  assert.deepEqual(loaded.case,nextCase,'all case axes and the oracle must commit atomically');

  const stale=await page.evaluate(async ({revision,nextCase})=>{
    try{await window.faultline.loadCase({expectedRevision:revision,case:nextCase});return null}catch(e){return String(e?.message||e)}
  },{revision:before.revision,nextCase});
  assert.match(stale,/^STALE_REVISION/,'atomic case load must preserve optimistic concurrency');

  const invalid={...nextCase,oracle:{kind:'unknown',action:{kind:'none'}}};
  const current=await page.evaluate(()=>window.faultline.inspect());
  const invalidResult=await page.evaluate(async ({revision,invalid})=>{
    try{await window.faultline.loadCase({expectedRevision:revision,case:invalid});return null}catch(e){return String(e?.message||e)}
  },{revision:current.revision,invalid});
  assert.equal(invalidResult,'INVALID_ORACLE','invalid complete cases must be rejected before canonical mutation');
  const afterInvalid=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(afterInvalid.revision,current.revision,'rejected complete cases must not advance revision');
  assert.deepEqual(afterInvalid.case,current.case,'rejected complete cases must leave canonical state untouched');

  const tool=await page.evaluate(()=>{const entry=window.__webmcpTools.find(item=>item.name==='faultline_load_case');return entry&&{name:entry.name,inputSchema:entry.inputSchema};});
  assert.ok(tool,'WebMCP must expose the atomic complete-case loader');
  assert.deepEqual(tool.inputSchema.required,['expectedRevision','case'],'WebMCP loader must require revision and case');
  assert.equal(tool.inputSchema.properties.case.additionalProperties,false,'case schema must reject unknown fields');
  assert.deepEqual(tool.inputSchema.properties.case.required,['html','css','js','oracle'],'case schema must require all canonical case fields');

  console.log('Atomic case load PASS: complete HTML/CSS/JS/oracle state commits in one guarded revision and is exposed through WebMCP.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}