import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4176;
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
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.some(tool=>tool.name==='faultline_probe'));

  const prepared=await page.evaluate(()=>{
    const current=window.faultline.inspect();
    return window.faultline.defineOracle({
      expectedRevision:current.revision,
      oracle:{...current.case.oracle,delayMs:500}
    });
  });

  const runResult=await page.evaluate(async testedRevision=>{
    const runTool=window.__webmcpTools.find(t=>t.name==='faultline_run');
    const pending=runTool.execute({expectedRevision:testedRevision});
    await new Promise(r=>setTimeout(r,60));
    const current=window.faultline.inspect();
    window.faultline.applySource({
      expectedRevision:current.revision,
      targetAxis:'css',
      source:`${current.case.css}\n/* concurrent edit */`
    });
    await pending;
    const after=window.faultline.inspect();
    const entry=window.faultline.history().filter(e=>e.kind==='run').at(-1);
    return {entry,canonicalRevision:after.revision};
  },prepared.revision);

  assert.notEqual(runResult.canonicalRevision,prepared.revision,'test must advance canonical state while run is in flight');
  assert.equal(runResult.entry.revision,prepared.revision,'run evidence must stay attributed to the revision actually executed');

  await page.evaluate(()=>document.getElementById('reset').click());
  const probeSetup=await page.evaluate(()=>{
    const current=window.faultline.inspect();
    const prepared=window.faultline.defineOracle({
      expectedRevision:current.revision,
      oracle:{...current.case.oracle,delayMs:500}
    });
    const after=window.faultline.inspect();
    return {revision:prepared.revision,unitId:after.unitCounts.html?document.querySelector('.unit')?.dataset.unitId:null};
  });
  assert.ok(probeSetup.unitId,'probe race test requires a semantic unit');

  const probeResult=await page.evaluate(async setup=>{
    const probeTool=window.__webmcpTools.find(t=>t.name==='faultline_probe');
    const pending=probeTool.execute({expectedRevision:setup.revision,targetAxis:'html',unitId:setup.unitId});
    await new Promise(r=>setTimeout(r,60));
    const current=window.faultline.inspect();
    window.faultline.applySource({
      expectedRevision:current.revision,
      targetAxis:'css',
      source:`${current.case.css}\n/* concurrent probe edit */`
    });
    await pending;
    const after=window.faultline.inspect();
    const entry=window.faultline.history().filter(e=>e.kind==='probe').at(-1);
    return {entry,canonicalRevision:after.revision};
  },probeSetup);

  assert.notEqual(probeResult.canonicalRevision,probeSetup.revision,'test must advance canonical state while probe is in flight');
  assert.equal(probeResult.entry.revision,probeSetup.revision,'probe evidence must stay attributed to the revision actually executed');
  console.log('Evidence lineage PASS: concurrent canonical edits cannot relabel run/probe evidence to a revision that was never executed.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}