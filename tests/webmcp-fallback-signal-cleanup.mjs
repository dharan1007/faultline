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
    Object.defineProperty(AbortSignal,'any',{configurable:true,writable:true,value:undefined});
    window.__webmcpTools=tools;
  });
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length>=16);

  const result=await page.evaluate(async()=>{
    const tool=window.__webmcpTools.find(item=>item.name==='faultline_run');
    if(!tool)throw new Error('RUN_TOOL_NOT_REGISTERED');
    const revision=window.faultline.inspect().revision;
    const hostController=new AbortController();
    const hostSignal=hostController.signal;
    const originalAdd=AbortSignal.prototype.addEventListener;
    const originalRemove=AbortSignal.prototype.removeEventListener;
    let activeHostAbortListeners=0;
    AbortSignal.prototype.addEventListener=function(type,listener,options){
      if(this===hostSignal&&type==='abort')activeHostAbortListeners++;
      return originalAdd.call(this,type,listener,options);
    };
    AbortSignal.prototype.removeEventListener=function(type,listener,options){
      if(this===hostSignal&&type==='abort')activeHostAbortListeners--;
      return originalRemove.call(this,type,listener,options);
    };
    try{
      const first=JSON.parse(await tool.execute({expectedRevision:revision,requestId:'fallback-cleanup-1'},{signal:hostSignal}));
      const second=JSON.parse(await tool.execute({expectedRevision:revision,requestId:'fallback-cleanup-2'},{signal:hostSignal}));
      return {firstStatus:first.status,secondStatus:second.status,activeHostAbortListeners};
    } finally {
      AbortSignal.prototype.addEventListener=originalAdd;
      AbortSignal.prototype.removeEventListener=originalRemove;
    }
  });

  assert.equal(result.firstStatus,'FAIL','fixture run must complete normally through the AbortSignal.any fallback');
  assert.equal(result.secondStatus,'FAIL','reusing one live host signal must remain valid through the fallback combiner');
  assert.equal(result.activeHostAbortListeners,0,'fallback signal combination must detach every abort listener it adds to a reusable host signal after successful execution');

  console.log('WebMCP fallback signal cleanup PASS: the AbortSignal.any compatibility path leaves no listeners attached to reusable host signals.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
