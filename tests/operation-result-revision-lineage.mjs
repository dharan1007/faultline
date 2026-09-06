import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4214;
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
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length===16);

  const prepared=await page.evaluate(()=>{
    const state=window.faultline.inspect();
    return window.faultline.defineOracle({expectedRevision:state.revision,oracle:{...state.case.oracle,delayMs:350}});
  });

  const runRace=await page.evaluate(async testedRevision=>{
    const tool=window.__webmcpTools.find(t=>t.name==='faultline_run');
    const pending=tool.execute({expectedRevision:testedRevision});
    await new Promise(r=>setTimeout(r,60));
    const current=window.faultline.inspect();
    const edited=window.faultline.applySource({expectedRevision:current.revision,targetAxis:'css',source:`${current.case.css}\n/* concurrent run edit */`});
    const result=JSON.parse(await pending);
    return {result,currentRevision:edited.revision};
  },prepared.revision);

  assert.equal(runRace.result.testedRevision,prepared.revision,'run response must identify the exact canonical revision executed');
  assert.equal(runRace.result.canonicalRevision,runRace.currentRevision,'run response must separately report canonical state after execution');
  assert.notEqual(runRace.result.testedRevision,runRace.result.canonicalRevision,'race fixture must prove tested and current revisions diverged');

  const probeSetup=await page.evaluate(()=>{
    const state=window.faultline.inspect();
    const unit=window.faultline.units({targetAxis:'html'}).units[0];
    if(!unit)throw new Error('TEST_SETUP_NO_HTML_UNIT');
    return {revision:state.revision,unitId:unit.id};
  });

  const probeRace=await page.evaluate(async setup=>{
    const tool=window.__webmcpTools.find(t=>t.name==='faultline_probe');
    const pending=tool.execute({expectedRevision:setup.revision,targetAxis:'html',unitId:setup.unitId});
    await new Promise(r=>setTimeout(r,60));
    const current=window.faultline.inspect();
    const edited=window.faultline.applySource({expectedRevision:current.revision,targetAxis:'css',source:`${current.case.css}\n/* concurrent probe edit */`});
    const result=JSON.parse(await pending);
    return {result,currentRevision:edited.revision};
  },probeSetup);

  assert.equal(probeRace.result.testedRevision,probeSetup.revision,'probe response must identify the exact canonical revision tested');
  assert.equal(probeRace.result.canonicalRevision,probeRace.currentRevision,'probe response must distinguish current canonical state from the tested snapshot');
  assert.notEqual(probeRace.result.testedRevision,probeRace.result.canonicalRevision,'probe race fixture must prove tested and current revisions diverged');

  console.log('Operation result lineage PASS: run and probe responses identify both the executed revision and the current canonical revision after concurrent edits.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
