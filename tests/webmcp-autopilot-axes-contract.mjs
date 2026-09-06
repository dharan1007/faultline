import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4217;
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
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length===16);

  const contract=await page.evaluate(()=>{
    const tool=window.__webmcpTools.find(item=>item.name==='faultline_autopilot');
    return tool&&tool.inputSchema;
  });
  assert.ok(contract?.properties?.axes,'faultline_autopilot must advertise selective axis automation');
  assert.equal(contract.properties.axes.type,'array');
  assert.deepEqual(contract.properties.axes.items?.enum,['html','css','js']);
  assert.equal(contract.properties.axes.uniqueItems,true,'axis selection must reject duplicate work deterministically');
  assert.equal(contract.properties.axes.minItems,1,'autopilot must never accept an empty automation plan');

  const before=await page.evaluate(()=>window.faultline.inspect());
  const invalid=await page.evaluate(async({revision})=>{
    try{
      await window.faultline.autopilot({expectedRevision:revision,axes:['html','invalid']});
      return {ok:true};
    }catch(error){
      return {ok:false,message:String(error?.message||error)};
    }
  },{revision:before.revision});
  const afterInvalid=await page.evaluate(()=>({state:window.faultline.inspect(),history:window.faultline.history()}));
  assert.equal(invalid.ok,false,'invalid axis plans must be rejected');
  assert.match(invalid.message,/INVALID_AXES/,'invalid axis plans must fail at the contract boundary');
  assert.equal(afterInvalid.state.revision,before.revision,'invalid axis validation must not mutate canonical state');
  assert.equal(afterInvalid.history.length,0,'invalid axis validation must not execute or record baseline evidence');

  const result=await page.evaluate(async({revision})=>{
    const tool=window.__webmcpTools.find(item=>item.name==='faultline_autopilot');
    return JSON.parse(await tool.execute({expectedRevision:revision,axes:['js'],maxTrialsPerAxis:20},{signal:new AbortController().signal}));
  },{revision:before.revision});
  assert.equal(result.status,'COMPLETE');
  assert.deepEqual(result.results.map(item=>item.axis),['js'],'WebMCP selective autopilot must execute exactly the requested axes');

  console.log('WebMCP autopilot axes contract PASS: agents can select validated automation axes and invalid plans fail before any experiment side effects.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
