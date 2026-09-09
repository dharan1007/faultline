import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4202;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try {
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>tools.push({...tool,execute:async(input,options)=>JSON.stringify(await tool.execute(input,options))})}});
    window.__webmcpTools=tools;
  });
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.some(tool=>tool.name==='faultline_reduce'));

  const before=await page.evaluate(()=>window.faultline.inspect());
  const outcome=await page.evaluate(async expectedRevision=>{
    const tool=window.__webmcpTools.find(t=>t.name==='faultline_reduce');
    try {
      const value=await tool.execute({expectedRevision,requestId:'budget-integrity',targetAxis:'html',maxTrials:1});
      return {error:null,value:JSON.parse(value)};
    } catch (error) {
      return {error:String(error?.message||error),value:null};
    }
  },before.revision);
  const after=await page.evaluate(()=>window.faultline.inspect());

  assert.match(outcome.error||'',/TRIAL_BUDGET_EXHAUSTED/,'an exhausted hierarchical reduction budget must be explicit instead of reporting an incomplete reduction as complete');
  assert.equal(after.revision,before.revision,'budget exhaustion must not commit a partial canonical reduction');
  assert.deepEqual(after.case,before.case,'budget exhaustion must preserve the exact canonical case');

  const htmlResult=await page.evaluate(async()=>{
    const initial=window.faultline.inspect();
    const loaded=window.faultline.loadCase({expectedRevision:initial.revision,case:{
      html:'<main><aside id="failure">failure</aside><div id="noise-before"><span>noise</span></div><section id="protected"><form><input id="keep"></form><p id="noise-inside">noise</p></section></main>',
      css:'',
      js:'',
      oracle:{kind:'dom_exists',selector:'#failure',equals:true,action:{kind:'none'},delayMs:0}
    }});
    const units=window.faultline.units({targetAxis:'html'});
    const input=units.units.find(unit=>unit.text==='<input id="keep">');
    if(!input)throw new Error('TEST_INPUT_UNIT_NOT_FOUND');
    const pinned=window.faultline.pin({expectedRevision:loaded.revision,targetAxis:'html',unitId:input.id,pinned:true});
    const reduced=await window.faultline.reduce({expectedRevision:pinned.revision,targetAxis:'html',maxTrials:100});
    const inspected=window.faultline.inspect();
    const finalUnits=window.faultline.units({targetAxis:'html'});
    const finalRun=await window.faultline.run({expectedRevision:inspected.revision});
    return {reduced,inspected,finalUnits,finalRun};
  });

  assert.equal(htmlResult.reduced.status,'FAIL','hierarchical HTML reduction must preserve the configured failure');
  assert.equal(htmlResult.finalRun.status,'FAIL','the committed hierarchical HTML result must independently reproduce the failure');
  assert.doesNotMatch(htmlResult.inspected.case.html,/noise-before/,'coarse reduction must remove an irrelevant whole branch before descending');
  assert.doesNotMatch(htmlResult.inspected.case.html,/noise-inside/,'coarse-to-fine reduction must remove irrelevant descendants from surviving branches');
  assert.match(htmlResult.inspected.case.html,/id="protected"/,'a pinned descendant must protect its section ancestor even though that section is irrelevant to the oracle');
  assert.match(htmlResult.inspected.case.html,/<form><input id="keep"><\/form>/,'a pinned descendant must protect its form ancestor and itself');
  const remappedInput=htmlResult.finalUnits.units.find(unit=>unit.text==='<input id="keep">');
  assert.ok(remappedInput,'the pinned descendant must still be discoverable after earlier source deletion shifts its range');
  assert.equal(remappedInput.pinned,true,'the persisted pin must remap to the descendant current unit id after source shrinkage');
  assert.ok(htmlResult.inspected.pins.includes(`html|${remappedInput.id}`),'canonical pin state must store the remapped current unit id');

  const cssResult=await page.evaluate(async()=>{
    const beforeCss=window.faultline.inspect();
    const loaded=window.faultline.loadCase({expectedRevision:beforeCss.revision,case:{
      html:'<div id="target" class="required">X</div>',
      css:'.required{color:red;padding:40px;border:10px solid black}.noise{display:none;opacity:.3}',
      js:'',
      oracle:{kind:'computed_style',selector:'#target',property:'color',equals:'rgb(255, 0, 0)',action:{kind:'none'},delayMs:0}
    }});
    const reduced=await window.faultline.reduce({expectedRevision:loaded.revision,targetAxis:'css',maxTrials:100});
    const inspected=window.faultline.inspect();
    const finalRun=await window.faultline.run({expectedRevision:inspected.revision});
    return {reduced,inspected,finalRun};
  });

  assert.equal(cssResult.reduced.status,'FAIL','hierarchical CSS reduction must preserve the computed-style failure');
  assert.equal(cssResult.finalRun.status,'FAIL','the committed CSS reduction must independently reproduce the failure');
  assert.doesNotMatch(cssResult.inspected.case.css,/\.noise/,'coarse CSS reduction must remove an irrelevant complete rule');
  assert.match(cssResult.inspected.case.css,/color:red/,'required declaration must remain');
  assert.doesNotMatch(cssResult.inspected.case.css,/padding|border/,'declaration-level reduction must remove irrelevant declarations inside a required rule');

  console.log('Hierarchical reduction integrity PASS: one global budget rejects safely, pinned descendants protect/remap through ancestor reductions, and HTML/CSS reduce coarse-to-fine while preserving FAIL.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
