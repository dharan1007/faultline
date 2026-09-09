import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://127.0.0.1').pathname;
    const relative=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');
    const file=resolve(root,relative);
    if(!file.startsWith(root)){res.statusCode=403;return res.end('forbidden');}
    const body=await readFile(file);
    const ext=extname(file);
    if(ext==='.js'||ext==='.mjs')res.setHeader('content-type','application/javascript');
    if(ext==='.html')res.setHeader('content-type','text/html; charset=utf-8');
    res.end(body);
  }catch{res.statusCode=404;res.end('not found');}
});
await new Promise((resolveListen,reject)=>server.listen(0,'127.0.0.1',resolveListen).once('error',reject));
const address=server.address();
const origin=`http://127.0.0.1:${address.port}`;

const capture={
  schema:'faultline.capture.v1',
  capturedAt:'2026-09-09T00:00:00.000Z',
  source:{
    url:'http://127.0.0.1:4173/profile',
    title:'Profile',
    html:'<label>Name <input id="name"></label><button id="save" aria-disabled="true">Save</button>',
    css:'button{display:block}',
    js:"const name=document.querySelector('#name'),save=document.querySelector('#save');name.addEventListener('input',()=>save.dataset.name=name.value);save.addEventListener('click',()=>save.setAttribute('aria-disabled',save.dataset.name==='alice'?'true':'false'));"
  },
  oracle:{kind:'dom_attribute',selector:'#save',property:'aria-disabled',equals:'true',action:{kind:'sequence',steps:[{kind:'set_value',selector:'#name',value:'alice'},{kind:'click',selector:'#save'}]},delayMs:0},
  environment:{browser:'chromium',playwrightVersion:'1.55.0',viewport:{width:1280,height:720}},
  provenance:{adapter:'@faultline/playwright-capture',testTitle:'save remains disabled after valid name',testFile:'tests/fixtures/capture-app.html'},
  diagnostics:{externalDependencies:[],consoleErrors:[],pageErrors:[]}
};

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>tools.push({...tool,execute:async(input,options)=>JSON.stringify(await tool.execute(input,options))})}});
    window.__webmcpTools=tools;
  });
  const response=await page.goto(origin,{waitUntil:'networkidle'});
  assert.equal(response.status(),200);
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length===window.faultline.manifest().length);

  const capabilities=await page.evaluate(()=>({
    importCapture:typeof window.faultline.importCapture,
    exportBundle:typeof window.faultline.exportBundle,
    toolNames:window.__webmcpTools.map(tool=>tool.name)
  }));
  assert.equal(capabilities.importCapture,'function','Browser API must expose transactional importCapture');
  assert.equal(capabilities.exportBundle,'function','Browser API must expose provenance-aware exportBundle');
  assert.ok(capabilities.toolNames.includes('faultline_import_capture'),'WebMCP must expose the same canonical capture import operation');

  const before=await page.evaluate(()=>window.faultline.inspect());

  const stale=await page.evaluate(async({capture})=>{
    try{await window.faultline.importCapture({expectedRevision:'r999999',capture});return null;}catch(error){return String(error?.message||error);}
  },{capture});
  assert.match(stale,/^STALE_REVISION\b/,'capture import must reject stale callers before executing or mutating');
  const afterStale=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(afterStale.revision,before.revision);
  assert.deepEqual(afterStale.case,before.case);
  assert.equal(afterStale.captureProvenance,before.captureProvenance);

  const aborted=await page.evaluate(async({capture,revision})=>{
    const controller=new AbortController();
    controller.abort();
    try{await window.faultline.importCapture({expectedRevision:revision,capture},{signal:controller.signal});return null;}catch(error){return String(error?.name||error?.message||error);}
  },{capture,revision:before.revision});
  assert.equal(aborted,'AbortError','pre-aborted capture verification must stop before mutation');
  const afterAbort=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(afterAbort.revision,before.revision);
  assert.deepEqual(afterAbort.case,before.case);
  assert.equal(afterAbort.captureProvenance,before.captureProvenance);

  const persistenceFailure=await page.evaluate(async({capture,revision})=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(){throw new DOMException('quota exceeded','QuotaExceededError')};
    try{
      await window.faultline.importCapture({expectedRevision:revision,capture});
      return {error:null,state:window.faultline.inspect()};
    }catch(error){
      return {error:String(error?.message||error),state:window.faultline.inspect()};
    }finally{
      Storage.prototype.setItem=original;
    }
  },{capture,revision:before.revision});
  assert.equal(persistenceFailure.error,'PERSISTENCE_FAILED','capture import must fail closed when durable persistence fails');
  assert.equal(persistenceFailure.state.revision,before.revision,'failed durable capture import must roll back revision');
  assert.deepEqual(persistenceFailure.state.case,before.case,'failed durable capture import must roll back case');
  assert.equal(persistenceFailure.state.captureProvenance,before.captureProvenance,'failed durable capture import must roll back provenance');

  const imported=await page.evaluate(async({expectedRevision,capture})=>window.faultline.importCapture({expectedRevision,capture}),{expectedRevision:before.revision,capture});
  assert.equal(imported.status,'IMPORTED');
  assert.equal(imported.baseline.status,'FAIL','capture must independently reproduce before canonical mutation');
  assert.notEqual(imported.revision,before.revision);

  const state=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(state.captureProvenance.schema,'faultline.capture.v1');
  assert.equal(state.captureProvenance.provenance.testTitle,'save remains disabled after valid name');
  assert.equal(state.case.html,capture.source.html);

  const bundle=await page.evaluate(()=>window.faultline.exportBundle());
  assert.equal(bundle.schema,'faultline.export.v1');
  assert.equal(bundle.captureProvenance.schema,'faultline.capture.v1');
  assert.match(bundle.standaloneHtml,/aria-disabled/);

  console.log('Capture runtime import PASS: stale, aborted, and non-durable imports roll back while verified FAIL captures commit with provenance-aware export.');
}finally{
  if(browser)await browser.close();
  await new Promise(resolveClose=>server.close(resolveClose));
}
