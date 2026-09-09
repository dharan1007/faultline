import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4211;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>tools.push({...tool,execute:async(input,options)=>JSON.stringify(await tool.execute(input,options))})}});
    window.__webmcpTools=tools;
  });
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.some(tool=>tool.name==='faultline_units'));

  const nestedCase={
    html:'<footer id="noise-before"><div><span>delete me first</span></div></footer><main id="app"><aside id="irrelevant"><div><p>discard branch</p></div></aside><section id="required"><div class="inner-noise"><em>discard inner</em></div><button id="save">Save</button></section></main>',
    css:'#app{display:block;color:black;padding:8px}.inner-noise{opacity:.4;color:gray}#save{padding:4px}',
    js:"document.querySelector('#save').addEventListener('click',()=>document.querySelector('#app').setAttribute('data-failed','yes'));",
    oracle:{kind:'dom_attribute',selector:'#app',property:'data-failed',equals:'yes',action:{kind:'click',selector:'#save'},delayMs:0}
  };

  const loaded=await page.evaluate(async nestedCase=>{
    const before=window.faultline.inspect();
    return window.faultline.loadCase({expectedRevision:before.revision,case:nestedCase});
  },nestedCase);

  const initialUnits=await page.evaluate(()=>window.faultline.units({targetAxis:'html'}));
  const button=initialUnits.units.find(unit=>unit.text.startsWith('<button id="save"'));
  const required=initialUnits.units.find(unit=>unit.text.startsWith('<section id="required"'));
  const main=initialUnits.units.find(unit=>unit.text.startsWith('<main id="app"'));
  assert.ok(button&&required&&main,'nested parent and child units must all be discoverable');
  assert.equal(button.parentId,required.id,'button must identify its immediate structural parent');
  assert.equal(required.parentId,main.id,'required section must identify its main ancestor');
  assert.ok(button.depth>required.depth&&required.depth>main.depth,'depth must increase through nested HTML');

  const pinned=await page.evaluate(({revision,unitId})=>window.faultline.pin({expectedRevision:revision,targetAxis:'html',unitId,pinned:true}),{revision:loaded.revision,unitId:button.id});
  const afterPinUnits=await page.evaluate(()=>window.faultline.units({targetAxis:'html'}));
  const pinnedButton=afterPinUnits.units.find(unit=>unit.id===button.id);
  const protectedRequired=afterPinUnits.units.find(unit=>unit.id===required.id);
  const protectedMain=afterPinUnits.units.find(unit=>unit.id===main.id);
  assert.equal(pinnedButton.pinned,true,'direct pin must remain explicit');
  assert.equal(protectedRequired.protectedByDescendant,true,'pinned descendant must structurally protect its section ancestor');
  assert.equal(protectedMain.protectedByDescendant,true,'pinned descendant must structurally protect its root ancestor');

  const toolListed=await page.evaluate(async()=>{
    const tool=window.__webmcpTools.find(item=>item.name==='faultline_units');
    return JSON.parse(await tool.execute({targetAxis:'html'}));
  });
  assert.deepEqual(toolListed,afterPinUnits,'WebMCP and browser API must expose the same hierarchy and protection state');

  const reduction=await page.evaluate(async expectedRevision=>window.faultline.reduce({expectedRevision,targetAxis:'html',maxTrials:120}),pinned.revision);
  assert.equal(reduction.status,'FAIL','hierarchical reduction must preserve the failure');

  const after=await page.evaluate(()=>({inspect:window.faultline.inspect(),units:window.faultline.units({targetAxis:'html'})}));
  assert.ok(!after.inspect.case.html.includes('noise-before'),'coarse reduction must remove an irrelevant root subtree');
  assert.ok(!after.inspect.case.html.includes('id="irrelevant"'),'coarse-to-fine reduction must remove an irrelevant nested subtree');
  assert.ok(!after.inspect.case.html.includes('inner-noise'),'reduction must descend into the surviving required branch');
  assert.ok(after.inspect.case.html.includes('id="app"')&&after.inspect.case.html.includes('id="required"')&&after.inspect.case.html.includes('id="save"'),'pinned descendant and required ancestors must survive');

  const remappedButton=after.units.units.find(unit=>unit.text.startsWith('<button id="save"'));
  assert.ok(remappedButton,'pinned button must remain discoverable after earlier source removal shifts offsets');
  assert.equal(remappedButton.pinned,true,'direct pin must be remapped to the surviving unit id');
  assert.ok(after.inspect.pins.includes(`html|${remappedButton.id}`),'canonical pin storage must contain the remapped unit id');
  assert.notEqual(remappedButton.id,button.id,'removing earlier source must force a real pin-offset remap');

  const finalRun=await page.evaluate(async expectedRevision=>window.faultline.run({expectedRevision}),after.inspect.revision);
  assert.equal(finalRun.status,'FAIL','independent final browser execution must still reproduce the failure');

  const cssUnits=await page.evaluate(()=>window.faultline.units({targetAxis:'css'}));
  assert.ok(cssUnits.units.some(unit=>unit.kind==='declaration'&&unit.parentId&&unit.depth>0),'CSS hierarchy must expose declaration children after the HTML reduction');

  console.log('Hierarchical reduction PASS: FAULTLINE removes whole irrelevant branches, descends into surviving structure, remaps pins, and exposes hierarchy through WebMCP.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
