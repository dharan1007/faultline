import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4185;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async(tool)=>tools.push({...tool,execute:async(input,options)=>JSON.stringify(await tool.execute(input,options))})}});
    window.__webmcpTools=tools;
  });
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.some(tool=>tool.name==='faultline_autopilot'));

  const prepared=await page.evaluate(()=>{
    const current=window.faultline.inspect();
    return window.faultline.defineOracle({
      expectedRevision:current.revision,
      oracle:{...current.case.oracle,delayMs:500}
    });
  });

  const result=await page.evaluate(async expectedRevision=>{
    const autopilotTool=window.__webmcpTools.find(t=>t.name==='faultline_autopilot');
    const pending=autopilotTool.execute({expectedRevision,requestId:'autopilot-revision-race',maxTrialsPerAxis:12})
      .then(value=>({ok:true,value}),error=>({ok:false,error:String(error?.message||error)}));

    await new Promise(r=>setTimeout(r,60));
    const beforeConcurrent=window.faultline.inspect();
    const marker='/* concurrent owner edit */';
    const concurrent=window.faultline.applySource({
      expectedRevision:beforeConcurrent.revision,
      targetAxis:'css',
      source:`${beforeConcurrent.case.css}\n${marker}`
    });

    const outcome=await pending;
    const after=window.faultline.inspect();
    return {outcome,concurrentRevision:concurrent.revision,afterRevision:after.revision,css:after.case.css,marker};
  },prepared.revision);

  assert.equal(result.outcome.ok,false,'autopilot must reject when canonical state changes after its inspected revision');
  assert.match(result.outcome.error,/STALE_REVISION/,'autopilot must surface a stale-revision error instead of adopting the concurrent write');
  assert.equal(result.afterRevision,result.concurrentRevision,'autopilot must not commit any reductions after a concurrent owner edit');
  assert.ok(result.css.includes(result.marker),'the concurrent owner edit must remain canonical and untouched');

  console.log('Autopilot revision isolation PASS: a concurrent canonical edit aborts automation instead of being silently adopted and reduced.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}