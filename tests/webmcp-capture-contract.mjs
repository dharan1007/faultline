import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4226;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js')||f.endsWith('.mjs'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

const capture={
  schema:'faultline.capture.v1',
  capturedAt:'2026-09-09T00:00:00.000Z',
  source:{
    url:'http://127.0.0.1:9999/source-only-metadata',
    title:'WebMCP capture fixture',
    html:'<button id="save" aria-disabled="true">Save</button>',
    css:'',
    js:''
  },
  oracle:{kind:'dom_attribute',selector:'#save',property:'aria-disabled',equals:'false',action:{kind:'none'},delayMs:0},
  environment:{browser:'chromium',viewport:{width:1280,height:720}},
  provenance:{adapter:'@faultline/playwright-capture',testTitle:'save remains disabled',testFile:'profile.spec.mjs'},
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
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length===window.faultline.manifest().length);

  const schema=await page.evaluate(()=>window.__webmcpTools.find(tool=>tool.name==='faultline_import_capture')?.inputSchema);
  assert.ok(schema,'faultline_import_capture must be registered');
  assert.equal(schema.type,'object');
  assert.equal(schema.additionalProperties,false,'capture import must not accept arbitrary top-level commands');
  assert.ok(schema.required.includes('expectedRevision'));
  assert.ok(schema.required.includes('capture'));
  const captureSchema=schema.properties.capture;
  assert.equal(captureSchema.type,'object');
  assert.equal(captureSchema.additionalProperties,false,'capture artifact shape must be explicit at the WebMCP boundary');
  assert.ok(captureSchema.required.includes('schema'));
  assert.ok(captureSchema.required.includes('source'));
  assert.ok(captureSchema.required.includes('oracle'));
  assert.ok(captureSchema.required.includes('provenance'));
  assert.equal(captureSchema.properties.source.additionalProperties,false);
  assert.equal(captureSchema.properties.source.properties.html.maxLength,1024*1024);
  assert.equal(captureSchema.properties.source.properties.css.maxLength,1024*1024);
  assert.equal(captureSchema.properties.source.properties.js.maxLength,1024*1024);
  assert.deepEqual(Object.keys(captureSchema.properties).sort(),['capturedAt','diagnostics','environment','oracle','provenance','schema','source'].sort(),'WebMCP capture schema must not expose URL-fetch/browser-command escape hatches');

  const before=await page.evaluate(()=>window.faultline.inspect());
  const imported=await page.evaluate(async({capture,revision})=>{
    const tool=window.__webmcpTools.find(item=>item.name==='faultline_import_capture');
    return JSON.parse(await tool.execute({expectedRevision:revision,capture},{signal:new AbortController().signal}));
  },{capture,revision:before.revision});
  assert.equal(imported.status,'IMPORTED');
  assert.equal(imported.baseline.status,'FAIL');
  assert.notEqual(imported.revision,before.revision);

  const state=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(state.captureProvenance.provenance.testTitle,'save remains disabled');

  const exported=await page.evaluate(async()=>{
    const tool=window.__webmcpTools.find(item=>item.name==='faultline_export');
    return JSON.parse(await tool.execute({},{}));
  });
  assert.equal(exported.schema,'faultline.export.v1');
  assert.equal(exported.captureProvenance.provenance.testTitle,'save remains disabled');
  assert.equal(exported.case.html,capture.source.html);
  assert.match(exported.standaloneHtml,/<!doctype html>/i);
  assert.equal(exported.html,exported.standaloneHtml,'legacy standalone HTML field must remain compatible');

  console.log('WebMCP capture contract PASS: agents import bounded verified captures and export provenance-aware bundles through the canonical runtime.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
