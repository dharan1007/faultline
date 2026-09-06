import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4216;
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
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length>=16);

  const result=await page.evaluate(async()=>{
    const tool=window.__webmcpTools.find(item=>item.name==='faultline_run');
    if(!tool)throw new Error('RUN_TOOL_NOT_REGISTERED');
    const revision=window.faultline.inspect().revision;
    const controller=new AbortController();
    const signal=controller.signal;
    const originalAdd=AbortSignal.prototype.addEventListener;
    const originalRemove=AbortSignal.prototype.removeEventListener;
    let activeAbortListeners=0;
    AbortSignal.prototype.addEventListener=function(type,listener,options){
      if(this===signal&&type==='abort')activeAbortListeners++;
      return originalAdd.call(this,type,listener,options);
    };
    AbortSignal.prototype.removeEventListener=function(type,listener,options){
      if(this===signal&&type==='abort')activeAbortListeners--;
      return originalRemove.call(this,type,listener,options);
    };
    try{
      const first=JSON.parse(await tool.execute({expectedRevision:revision},{signal}));
      const second=JSON.parse(await tool.execute({expectedRevision:revision},{signal}));
      return {firstStatus:first.status,secondStatus:second.status,activeAbortListeners};
    } finally {
      AbortSignal.prototype.addEventListener=originalAdd;
      AbortSignal.prototype.removeEventListener=originalRemove;
    }
  });

  assert.equal(result.firstStatus,'FAIL','fixture run must complete normally');
  assert.equal(result.secondStatus,'FAIL','reusing one live host signal must remain valid');
  assert.equal(result.activeAbortListeners,0,'completed WebMCP executions must detach every abort listener they add to a reusable host signal');

  console.log('WebMCP abort-listener cleanup PASS: completed native-cancellable calls leave no FAULTLINE abort listeners attached to a reusable host signal.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
