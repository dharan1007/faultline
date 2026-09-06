import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4199;
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
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.some(tool=>tool.name==='faultline_reduce'));

  const prepared=await page.evaluate(()=>{
    const current=window.faultline.inspect();
    return window.faultline.loadCase({
      expectedRevision:current.revision,
      case:{
        html:'<main id="subject" class="bad"><h1>Failure</h1><p>alpha</p><p>beta</p><p>gamma</p></main>',
        css:'.bad{color:rgb(255, 0, 0)} h1{font-weight:700} p{margin:4px}',
        js:'',
        oracle:{kind:'computed_style',selector:'#subject',property:'color',equals:'rgb(255, 0, 0)',action:{kind:'none'},delayMs:300}
      }
    });
  });

  const result=await page.evaluate(async expectedRevision=>{
    const pending=window.faultline.reduce({expectedRevision,targetAxis:'html',maxTrials:20})
      .then(value=>({ok:true,value}),error=>({ok:false,error:String(error?.message||error)}));

    await new Promise(r=>setTimeout(r,80));
    const beforeConcurrent=window.faultline.inspect();
    const concurrentCss='.bad{color:rgb(0, 0, 255)} h1{font-weight:700} p{margin:4px}';
    const concurrent=window.faultline.applySource({
      expectedRevision:beforeConcurrent.revision,
      targetAxis:'css',
      source:concurrentCss
    });

    const outcome=await pending;
    const after=window.faultline.inspect();
    return {outcome,concurrentRevision:concurrent.revision,afterRevision:after.revision,css:after.case.css,concurrentCss};
  },prepared.revision);

  assert.equal(result.outcome.ok,false,'reduction must reject when canonical state changes after its inspected revision');
  assert.match(result.outcome.error,/STALE_REVISION/,'all reduction trials must remain bound to the inspected case so the only terminal conflict is the stale commit guard');
  assert.doesNotMatch(result.outcome.error,/REDUCTION_LOST_FAILURE/,'a concurrent edit on another axis must not contaminate in-flight reduction trials');
  assert.equal(result.afterRevision,result.concurrentRevision,'failed stale reduction must not advance canonical revision');
  assert.equal(result.css,result.concurrentCss,'the concurrent canonical edit must remain untouched');

  console.log('Reduction snapshot isolation PASS: every trial stays bound to one inspected case and concurrent edits resolve only through the stale-revision guard.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
