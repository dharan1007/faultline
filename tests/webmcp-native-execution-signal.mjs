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
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>tools.push({...tool,execute:async(input,options)=>JSON.stringify(await tool.execute(input,options))})}});
    window.__webmcpTools=tools;
  });
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__webmcpTools?.length>=16 && window.faultline);

  const contract=await page.evaluate(()=>{
    const run=window.__webmcpTools.find(tool=>tool.name==='faultline_run');
    return {executeArity:run?.execute?.length,required:run?.inputSchema?.required||[]};
  });
  assert.equal(contract.executeArity,2,'WebMCP execute callback must accept current (inputObject, options) contract');
  assert.ok(!contract.required.includes('requestId'),'native WebMCP execution must not require a proprietary cancellation identifier');

  const result=await page.evaluate(async()=>{
    const run=window.__webmcpTools.find(tool=>tool.name==='faultline_run');
    const controller=new AbortController();
    const promise=run.execute({expectedRevision:'r1'},{signal:controller.signal}).then(
      value=>({resolved:true,value}),
      error=>({resolved:false,name:error?.name||'',message:String(error?.message||error)})
    );
    controller.abort();
    return await promise;
  });
  assert.equal(result.resolved,false,'native AbortSignal must cancel an active long-running WebMCP invocation');
  assert.equal(result.name,'AbortError','native cancellation must reject with AbortError');

  console.log('Native WebMCP execution signal PASS: long-running tools accept the two-argument callback contract, do not require proprietary request IDs, and honor options.signal cancellation.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
