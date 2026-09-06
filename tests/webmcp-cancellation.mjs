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
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.some(tool=>tool.name==='faultline_run'));

  const prepared=await page.evaluate(()=>{
    const current=window.faultline.inspect();
    return window.faultline.defineOracle({
      expectedRevision:current.revision,
      oracle:{...current.case.oracle,delayMs:1200}
    });
  });

  const outcome=await page.evaluate(async expectedRevision=>{
    const runTool=window.__webmcpTools.find(t=>t.name==='faultline_run');
    const cancelTool=window.__webmcpTools.find(t=>t.name==='faultline_cancel_active');
    assertWebMCP(runTool,'faultline_run');
    assertWebMCP(cancelTool,'faultline_cancel_active');

    const started=performance.now();
    const pending=runTool.execute({expectedRevision})
      .then(()=>({resolved:true,elapsed:performance.now()-started}))
      .catch(error=>({resolved:false,name:error?.name||'',message:String(error?.message||error),elapsed:performance.now()-started}));

    await new Promise(r=>setTimeout(r,30));
    const cancelResult=JSON.parse(await cancelTool.execute({}));
    const result=await pending;
    return {result,cancelResult};

    function assertWebMCP(tool,name){
      if(!tool)throw new Error(`${name} is not registered`);
      if(tool.execute.length>1)throw new Error(`${name} execute callback must use the current one-argument WebMCP contract`);
    }
  },prepared.revision);

  assert.equal(outcome.result.resolved,false,'cancelled WebMCP execution must reject');
  assert.equal(outcome.result.name,'AbortError','cancelled WebMCP execution must reject with AbortError');
  assert.ok(outcome.result.elapsed<500,`cancel must stop promptly; elapsed=${outcome.result.elapsed}`);
  assert.equal(outcome.cancelResult.status,'CANCEL_REQUESTED','cancel tool must report an active cancellation request');
  assert.equal(outcome.cancelResult.operations.length,1,'cancel must identify the active WebMCP operation');
  assert.equal(outcome.cancelResult.operations[0].tool,'faultline_run');

  const history=await page.evaluate(()=>window.faultline.history());
  assert.equal(history.some(entry=>entry.kind==='run'&&entry.revision===prepared.revision),false,'cancelled runs must not be recorded as completed evidence');
  console.log('WebMCP cancellation PASS: spec-compliant one-argument tool calls can cancel active long-running work promptly without recording completed evidence.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
