import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4188;
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
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length===11);

  const before=await page.evaluate(()=>window.faultline.inspect());
  const invalidOracle={kind:'totally_unknown',selector:'',property:'',equals:true,action:{kind:'explode',selector:''},delayMs:-10};
  const result=await page.evaluate(async ({revision,invalidOracle})=>{
    try{
      await window.faultline.defineOracle({expectedRevision:revision,oracle:invalidOracle});
      return {ok:true,error:null};
    }catch(e){
      return {ok:false,error:String(e?.message||e)};
    }
  },{revision:before.revision,invalidOracle});
  assert.equal(result.ok,false,'invalid oracle definitions must be rejected before canonical mutation');
  assert.equal(result.error,'INVALID_ORACLE','invalid oracle definitions must fail with a stable machine-readable error');

  const after=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(after.revision,before.revision,'rejected oracle definitions must not advance canonical revision');
  assert.deepEqual(after.case.oracle,before.case.oracle,'rejected oracle definitions must not replace the canonical oracle');

  const schema=await page.evaluate(()=>window.__webmcpTools.find(tool=>tool.name==='faultline_define_oracle').inputSchema.properties.oracle);
  assert.deepEqual(schema.properties.kind.enum,['dom_property','computed_style','dom_exists','runtime_error'],'WebMCP schema must enumerate supported oracle kinds');
  assert.equal(schema.additionalProperties,false,'oracle schema must reject unknown top-level fields');
  assert.deepEqual(schema.properties.action.properties.kind.enum,['none','click'],'WebMCP schema must enumerate supported action kinds');
  assert.equal(schema.properties.action.additionalProperties,false,'oracle action schema must reject unknown fields');

  console.log('Oracle contract validation PASS: invalid oracle definitions are rejected atomically and WebMCP advertises a constrained oracle schema.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
