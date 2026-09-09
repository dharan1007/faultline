import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4217;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(resolve=>setTimeout(resolve,700));

let browser;
try {
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1360,height:900}});
  await page.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>tools.push({...tool,execute:async(input,options)=>JSON.stringify(await tool.execute(input,options))})}});
    window.__webmcpTools=tools;
  });
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.evaluate(()=>localStorage.clear());
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline&&window.__webmcpTools?.some(tool=>tool.name==='faultline_units'));

  const nestedCase={
    html:'<aside id="noise-branch"><div><p>irrelevant parent branch</p></div></aside><main id="required"><section id="required-section"><span class="noise-child">child noise</span><button id="target">Keep</button></section></main>',
    css:'#target{display:block;color:red;padding:12px;} #noise-branch{border:1px solid red;background:yellow;}',
    js:'',
    oracle:{kind:'dom_exists',selector:'#target',equals:true,action:{kind:'none'},delayMs:0}
  };

  let state=await page.evaluate(async nextCase=>{
    const before=window.faultline.inspect();
    return window.faultline.loadCase({expectedRevision:before.revision,case:nextCase});
  },nestedCase);

  const initialUnits=await page.evaluate(()=>window.faultline.units({targetAxis:'html'}));
  const button=initialUnits.units.find(unit=>unit.text.startsWith('<button id="target"'));
  const section=initialUnits.units.find(unit=>unit.text.startsWith('<section id="required-section"'));
  const main=initialUnits.units.find(unit=>unit.text.startsWith('<main id="required"'));
  assert.ok(button&&section&&main,'nested target and ancestor units must be discoverable');
  assert.equal(button.depth,2,'canonical unit API must expose structural depth');
  assert.equal(button.parentId,section.id,'canonical unit API must expose parent linkage');

  const originalPinId=button.id;
  state=await page.evaluate(({revision,unitId})=>window.faultline.pin({expectedRevision:revision,targetAxis:'html',unitId,pinned:true}),{revision:state.revision,unitId:button.id});
  const protectedUnits=await page.evaluate(()=>window.faultline.units({targetAxis:'html'}));
  const protectedButton=protectedUnits.units.find(unit=>unit.id===originalPinId);
  const protectedSection=protectedUnits.units.find(unit=>unit.text.startsWith('<section id="required-section"'));
  const protectedMain=protectedUnits.units.find(unit=>unit.text.startsWith('<main id="required"'));
  assert.equal(protectedButton.pinned,true);
  assert.equal(protectedSection.protectedByPin,true,'pinned descendant must protect its section ancestor');
  assert.equal(protectedMain.protectedByPin,true,'pinned descendant must protect its root ancestor');

  const webmcpUnits=await page.evaluate(async()=>{
    const tool=window.__webmcpTools.find(item=>item.name==='faultline_units');
    return JSON.parse(await tool.execute({targetAxis:'html'}));
  });
  const webmcpButton=webmcpUnits.units.find(unit=>unit.text.startsWith('<button id="target"'));
  assert.equal(webmcpButton.depth,2,'WebMCP must receive the same hierarchy metadata as the browser API');
  assert.equal(typeof webmcpButton.protectedByPin,'boolean');

  const htmlReduction=await page.evaluate(async revision=>window.faultline.reduce({expectedRevision:revision,targetAxis:'html',maxTrials:120}),state.revision);
  assert.equal(htmlReduction.status,'FAIL');
  assert.equal(htmlReduction.hierarchical,true,'HTML must use hierarchy-aware reduction');
  assert.ok(Array.isArray(htmlReduction.frontiers)&&htmlReduction.frontiers.length>=2,'HTML reduction must report tested structural frontiers');

  state=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(state.case.html.includes('noise-branch'),false,'irrelevant parent branch should be removed wholesale');
  assert.equal(state.case.html.includes('child noise'),false,'reducer should descend and remove noise inside surviving ancestry');
  assert.equal(state.case.html.includes('id="target"'),true,'pinned failing target must survive');
  assert.equal(state.case.html.includes('id="required-section"'),true,'ancestor protected by pin must survive');
  assert.equal(state.case.html.includes('id="required"'),true,'root ancestor protected by pin must survive');

  const remappedUnits=await page.evaluate(()=>window.faultline.units({targetAxis:'html'}));
  const remappedButton=remappedUnits.units.find(unit=>unit.text.startsWith('<button id="target"'));
  assert.ok(remappedButton);
  assert.notEqual(remappedButton.id,originalPinId,'removing earlier source must shift the canonical target unit id');
  assert.equal(remappedButton.pinned,true,'explicit pin must follow the same surviving unit after source offsets change');
  assert.ok(state.pins.includes(`html|${remappedButton.id}`),'persisted canonical pins must contain the remapped id');
  assert.equal(state.pins.includes(`html|${originalPinId}`),false,'stale pre-reduction pin id must be removed');

  state=await page.evaluate(({revision})=>window.faultline.defineOracle({expectedRevision:revision,oracle:{kind:'computed_style',selector:'#target',property:'display',equals:'block',action:{kind:'none'},delayMs:0}}),{revision:state.revision});
  const cssReduction=await page.evaluate(async revision=>window.faultline.reduce({expectedRevision:revision,targetAxis:'css',maxTrials:120}),state.revision);
  assert.equal(cssReduction.status,'FAIL');
  assert.equal(cssReduction.hierarchical,true,'CSS must use hierarchy-aware rule/declaration reduction');
  assert.ok(cssReduction.frontiers.some(frontier=>frontier.depth===1),'CSS must descend from required rule to declaration frontier');

  state=await page.evaluate(()=>window.faultline.inspect());
  assert.match(state.case.css,/display:block/,'failure-relevant declaration must survive');
  assert.equal(state.case.css.includes('color:red'),false,'irrelevant declaration in required rule should be removed');
  assert.equal(state.case.css.includes('padding:12px'),false,'second irrelevant declaration in required rule should be removed');
  assert.equal(state.case.css.includes('#noise-branch'),false,'irrelevant CSS rule should be removed at coarse frontier');

  const finalRun=await page.evaluate(async revision=>window.faultline.run({expectedRevision:revision}),state.revision);
  assert.equal(finalRun.status,'FAIL','reduced canonical case must independently preserve the locked failure');
  const exported=await page.evaluate(()=>window.faultline.exportBundle());
  assert.equal(exported.case.html,state.case.html);
  assert.equal(exported.case.css,state.case.css);
  assert.ok(exported.standaloneHtml.includes(state.case.html),'export must contain the exact reduced canonical HTML');

  console.log('Hierarchical reduction PASS: canonical HTML/CSS reduction removes coarse parent noise, descends into required survivors, protects/remaps pins, exposes hierarchy through WebMCP, and exports a reverified FAIL.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
