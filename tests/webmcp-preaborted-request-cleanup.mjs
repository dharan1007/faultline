import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4219;
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
  await page.waitForFunction(()=>window.__webmcpTools?.length>=16 && window.faultline);

  const first=await page.evaluate(async()=>{
    const run=window.__webmcpTools.find(tool=>tool.name==='faultline_run');
    const controller=new AbortController();
    controller.abort();
    try{
      await run.execute({expectedRevision:'r1',requestId:'reusable-preabort'},{signal:controller.signal});
      return {resolved:true};
    }catch(error){
      return {resolved:false,name:error?.name||'',message:String(error?.message||error)};
    }
  });
  assert.equal(first.resolved,false,'an already-aborted host signal must reject before execution');
  assert.equal(first.name,'AbortError','pre-aborted execution must reject with AbortError');

  const second=await page.evaluate(async()=>{
    const run=window.__webmcpTools.find(tool=>tool.name==='faultline_run');
    try{
      return {resolved:true,value:JSON.parse(await run.execute({expectedRevision:'r1',requestId:'reusable-preabort'},{}))};
    }catch(error){
      return {resolved:false,name:error?.name||'',message:String(error?.message||error)};
    }
  });
  assert.equal(second.resolved,true,'a pre-aborted invocation must release its compatibility requestId for safe retry');
  assert.equal(second.value?.testedRevision,'r1','retry must execute normally against the requested canonical revision');

  console.log('Pre-aborted WebMCP request cleanup PASS: host cancellation cannot leak a compatibility requestId or poison later retries.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
