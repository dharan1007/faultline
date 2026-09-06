import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4201;
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
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.some(tool=>tool.name==='faultline_cancel_active'));

  const prepared=await page.evaluate(()=>{
    const current=window.faultline.inspect();
    return window.faultline.defineOracle({
      expectedRevision:current.revision,
      oracle:{...current.case.oracle,delayMs:350}
    });
  });

  const outcome=await page.evaluate(async expectedRevision=>{
    const runTool=window.__webmcpTools.find(t=>t.name==='faultline_run');
    const cancelTool=window.__webmcpTools.find(t=>t.name==='faultline_cancel_active');
    const started=performance.now();
    const cancelMe=runTool.execute({expectedRevision,requestId:'cancel-me'})
      .then(value=>({resolved:true,value,elapsed:performance.now()-started}))
      .catch(error=>({resolved:false,name:error?.name||'',message:String(error?.message||error),elapsed:performance.now()-started}));
    const keepMe=runTool.execute({expectedRevision,requestId:'keep-me'})
      .then(value=>({resolved:true,value,elapsed:performance.now()-started}))
      .catch(error=>({resolved:false,name:error?.name||'',message:String(error?.message||error),elapsed:performance.now()-started}));

    await new Promise(r=>setTimeout(r,35));
    const cancelResult=JSON.parse(await cancelTool.execute({requestId:'cancel-me'}));
    const [cancelled,kept]=await Promise.all([cancelMe,keepMe]);
    return {cancelled,kept,cancelResult,runSchema:runTool.inputSchema,cancelSchema:cancelTool.inputSchema};
  },prepared.revision);

  assert.ok(outcome.runSchema?.properties?.requestId,'long-running WebMCP tools must accept a caller-owned requestId');
  assert.ok(outcome.runSchema.required?.includes('requestId'),'requestId must be required for deterministic cancellation ownership');
  assert.deepEqual(outcome.cancelSchema?.required,['requestId'],'cancel tool must require the requestId it owns');
  assert.equal(outcome.cancelled.resolved,false,'targeted operation must reject after cancellation');
  assert.equal(outcome.cancelled.name,'AbortError','targeted operation must reject with AbortError');
  assert.ok(outcome.cancelled.elapsed<500,`targeted cancellation must be prompt; elapsed=${outcome.cancelled.elapsed}`);
  assert.equal(outcome.kept.resolved,true,'unrelated concurrent WebMCP work must continue');
  assert.equal(JSON.parse(outcome.kept.value).status,'FAIL','unrelated run must complete normally against the failing fixture');
  assert.equal(outcome.cancelResult.status,'CANCEL_REQUESTED');
  assert.equal(outcome.cancelResult.operations.length,1,'targeted cancellation must affect exactly one operation');
  assert.equal(outcome.cancelResult.operations[0].requestId,'cancel-me');
  assert.equal(outcome.cancelResult.operations[0].tool,'faultline_run');

  console.log('WebMCP targeted cancellation PASS: caller-owned request IDs cancel one operation without aborting unrelated concurrent work.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
