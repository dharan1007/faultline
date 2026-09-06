import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4191;
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
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.some(tool=>tool.name==='faultline_probe'));

  const result=await page.evaluate(async()=>{
    const probeTool=window.__webmcpTools.find(tool=>tool.name==='faultline_probe');
    const manifestProbe=window.faultline.manifest().find(tool=>tool.name==='faultline_probe');
    const before=window.faultline.inspect();
    const unit=window.faultline.units({targetAxis:'html'}).units[0];
    const historyBefore=window.faultline.history().length;
    const storageBefore=localStorage.getItem('faultline-prod-v3');
    await probeTool.execute({expectedRevision:before.revision,requestId:'probe-annotation',targetAxis:'html',unitId:unit.id});
    const after=window.faultline.inspect();
    const historyAfter=window.faultline.history().length;
    const storageAfter=localStorage.getItem('faultline-prod-v3');
    return {
      readOnlyHint:probeTool.annotations?.readOnlyHint,
      manifestReadOnlyHint:manifestProbe?.annotations?.readOnlyHint,
      beforeRevision:before.revision,
      afterRevision:after.revision,
      historyBefore,
      historyAfter,
      storageChanged:storageAfter!==storageBefore,
      latestKind:window.faultline.history().at(-1)?.kind
    };
  });

  assert.equal(result.beforeRevision,result.afterRevision,'probe must remain non-canonical: canonical revision must not change');
  assert.equal(result.historyAfter,result.historyBefore+1,'probe must persist one reproducibility evidence event');
  assert.equal(result.latestKind,'probe','persisted evidence must identify the probe operation');
  assert.equal(result.storageChanged,true,'probe evidence must be durable across reloads');
  assert.equal(result.readOnlyHint,false,'a tool that persists observable evidence must not advertise readOnlyHint=true');
  assert.equal(result.manifestReadOnlyHint,result.readOnlyHint,'browser manifest and registered WebMCP tool must expose the same risk annotation');
  console.log('WebMCP probe annotation PASS: persisted probe evidence is correctly advertised as a state-modifying tool effect.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
