import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4174;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async(tool)=>tools.push(tool)}});
    window.__webmcpTools=tools;
  });
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length===11);

  const prepared=await page.evaluate(()=>{
    const current=window.faultline.inspect();
    return window.faultline.defineOracle({
      expectedRevision:current.revision,
      oracle:{...current.case.oracle,delayMs:1200}
    });
  });

  const outcome=await page.evaluate(async expectedRevision=>{
    const tool=window.__webmcpTools.find(t=>t.name==='faultline_run');
    const controller=new AbortController();
    const started=performance.now();
    const pending=tool.execute({expectedRevision},{signal:controller.signal})
      .then(()=>({resolved:true,elapsed:performance.now()-started}))
      .catch(error=>({resolved:false,name:error?.name||'',message:String(error?.message||error),elapsed:performance.now()-started}));
    setTimeout(()=>controller.abort(),30);
    return pending;
  },prepared.revision);

  assert.equal(outcome.resolved,false,'aborted WebMCP execution must reject');
  assert.equal(outcome.name,'AbortError','aborted WebMCP execution must reject with AbortError');
  assert.ok(outcome.elapsed<500,`abort must stop promptly; elapsed=${outcome.elapsed}`);

  const history=await page.evaluate(()=>window.faultline.history());
  assert.equal(history.some(entry=>entry.kind==='run'&&entry.revision===prepared.revision),false,'aborted runs must not be recorded as completed evidence');
  console.log('WebMCP cancellation PASS: abort signal stops an in-flight experiment promptly and leaves no completed evidence record.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
