import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4212;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js')||f.endsWith('.mjs'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(resolve=>setTimeout(resolve,700));

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
  await page.waitForFunction(()=>window.faultline&&window.__webmcpTools?.some(tool=>tool.name==='faultline_units'));

  const failingCase={
    html:'<main id="app"></main>',
    css:'#app{display:block}',
    js:`function reproduce(){
  const required=true;
  console.debug('function noise');
  if(required){
    document.querySelector('#app').setAttribute('data-failed','yes');
    console.info('inner noise');
  }
}
reproduce();
console.warn('root noise');`,
    oracle:{kind:'dom_attribute',selector:'#app',property:'data-failed',equals:'yes',action:{kind:'none'},delayMs:0}
  };

  const loaded=await page.evaluate(async failingCase=>{
    const before=window.faultline.inspect();
    return window.faultline.loadCase({expectedRevision:before.revision,case:failingCase});
  },failingCase);

  const initial=await page.evaluate(()=>window.faultline.units({targetAxis:'js'}));
  const fn=initial.units.find(unit=>unit.text.startsWith('function reproduce()'));
  const ifStatement=initial.units.find(unit=>unit.text.trim().startsWith('if(required)'));
  const assignment=initial.units.find(unit=>unit.text.includes("setAttribute('data-failed','yes')")&&!unit.text.trim().startsWith('if'));
  const rootNoise=initial.units.find(unit=>unit.text.includes("console.warn('root noise')"));
  assert.ok(fn&&ifStatement&&assignment&&rootNoise,'real browser API must expose nested and root parser-backed JavaScript statements');
  assert.equal(fn.parentId,null);
  assert.equal(ifStatement.parentId,fn.id);
  assert.equal(assignment.parentId,ifStatement.id);
  assert.ok(assignment.depth>ifStatement.depth&&ifStatement.depth>fn.depth,'nested JavaScript depth must increase through semantic ancestors');

  const toolListed=await page.evaluate(async()=>{
    const tool=window.__webmcpTools.find(item=>item.name==='faultline_units');
    return JSON.parse(await tool.execute({targetAxis:'js'}));
  });
  assert.deepEqual(toolListed,initial,'WebMCP and browser API must expose the identical parser-backed JavaScript hierarchy');

  const pinned=await page.evaluate(({revision,unitId})=>window.faultline.pin({expectedRevision:revision,targetAxis:'js',unitId,pinned:true}),{revision:loaded.revision,unitId:assignment.id});
  const protectedUnits=await page.evaluate(()=>window.faultline.units({targetAxis:'js'}));
  assert.equal(protectedUnits.units.find(unit=>unit.id===assignment.id)?.pinned,true,'required inner statement must be directly pinned');
  assert.equal(protectedUnits.units.find(unit=>unit.id===ifStatement.id)?.protectedByDescendant,true,'pinned JavaScript statement must protect its control-flow ancestor');
  assert.equal(protectedUnits.units.find(unit=>unit.id===fn.id)?.protectedByDescendant,true,'pinned JavaScript statement must protect its function ancestor');

  const reduction=await page.evaluate(async expectedRevision=>window.faultline.reduce({expectedRevision,targetAxis:'js',maxTrials:120}),pinned.revision);
  assert.equal(reduction.status,'FAIL','parser-backed JavaScript reduction must preserve the browser failure');
  assert.ok(reduction.passes>=2,'JavaScript reduction must traverse multiple structural depths');

  const after=await page.evaluate(()=>({inspect:window.faultline.inspect(),units:window.faultline.units({targetAxis:'js'})}));
  assert.ok(after.inspect.case.js.includes("setAttribute('data-failed','yes')"),'required failure-producing statement must survive');
  assert.ok(after.inspect.case.js.includes('function reproduce()'),'required ancestor function must survive');
  assert.ok(after.inspect.case.js.includes('if(required)'),'required ancestor control flow must survive');
  assert.ok(!after.inspect.case.js.includes('function noise'),'irrelevant statement inside a required function must be removable');
  assert.ok(!after.inspect.case.js.includes('inner noise'),'irrelevant sibling inside required control flow must be removable');
  assert.ok(!after.inspect.case.js.includes('root noise'),'irrelevant root statement must be removable');

  const remappedAssignment=after.units.units.find(unit=>unit.text.includes("setAttribute('data-failed','yes')"));
  assert.ok(remappedAssignment?.pinned,'pin must remain attached after JavaScript source offsets change');
  const finalRun=await page.evaluate(async expectedRevision=>window.faultline.run({expectedRevision}),after.inspect.revision);
  assert.equal(finalRun.status,'FAIL','independent final Chromium execution must reproduce the same reduced failure');

  console.log('JavaScript parser reduction PASS: FAULTLINE exposes parser-backed JS hierarchy through Browser API/WebMCP, protects pinned ancestors, removes irrelevant nested/root statements, remaps pins, and independently preserves FAIL.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
