import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4173;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js')||f.endsWith('.mjs'))res.setHeader('content-type','application/javascript');if(f.endsWith('.css'))res.setHeader('content-type','text/css');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>{
      if(!tool?.name||!tool?.description||typeof tool.execute!=='function')throw new TypeError('invalid WebMCP tool');
      if(tool.handler)throw new TypeError('legacy handler is forbidden');
      tools.push(tool);
    }}});
    window.__webmcpTools=tools;
  });
  const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
  const response=await page.goto(`http://127.0.0.1:${port}/#/projects`,{waitUntil:'networkidle'});
  assert.equal(response.status(),200);
  await page.waitForFunction(()=>window.faultlinePlatform?.ready===true);

  assert.equal(await page.locator('[data-view="projects"]').isVisible(),true);
  assert.equal(await page.locator('#source').isVisible().catch(()=>false),false);
  for(const label of ['Projects','Investigations','Runs','Evidence','Integrations']){
    assert.equal(await page.getByRole('link',{name:new RegExp(`${label}$`)}).isVisible(),true,`${label} nav missing`);
  }
  assert.equal(await page.getByRole('button',{name:'New investigation'}).first().isVisible(),true);

  await page.locator('[data-view="projects"]').getByRole('link',{name:'Connect project'}).first().click();
  await page.waitForURL(/#\/connect$/);
  const connect=page.locator('[data-view="connect"]');
  assert.equal(await connect.isVisible(),true);
  await connect.getByLabel('Live or staging URL').fill('https://example.com/checkout');
  await connect.getByLabel('Project name').fill('Checkout');
  await connect.getByRole('button',{name:'Verify project'}).click();
  await page.waitForURL(/#\/project\//);
  const project=page.locator('[data-view="project"]');
  assert.equal(await project.getByText('Live URL',{exact:true}).isVisible(),true);
  assert.equal(await project.getByText('READY',{exact:true}).isVisible(),true);
  assert.equal(await project.getByRole('button',{name:'Start investigation'}).isVisible(),true);

  await project.getByRole('button',{name:'Start investigation'}).click();
  await page.waitForURL(/#\/investigation\//);
  const investigation=page.locator('[data-view="investigation"]');
  assert.equal(await investigation.isVisible(),true);
  for(const stage of ['Reproduce','Observe','Isolate','Verify','Handoff']) assert.equal(await investigation.getByText(stage,{exact:true}).first().isVisible(),true);
  await investigation.getByLabel('What is failing?').fill('Cart total becomes zero after removing the second product');
  await investigation.getByLabel('Route').fill('/checkout');
  await investigation.getByLabel('Expected behavior').fill('Cart total remains correct');
  await investigation.getByLabel('Observed behavior').fill('Cart total becomes zero');
  await investigation.getByRole('button',{name:'Save reproduction'}).click();
  assert.equal(await investigation.getByText('Reproduction definition saved',{exact:true}).isVisible(),true);
  assert.equal(await investigation.getByRole('button',{name:'Continue to observe'}).isEnabled(),true);
  await investigation.getByRole('button',{name:'Continue to observe'}).click();
  assert.equal(await investigation.getByText('Observation workspace',{exact:true}).isVisible(),true);

  await page.getByRole('link',{name:/Integrations$/}).click();
  await page.waitForURL(/#\/integrations$/);
  const integrations=page.locator('[data-view="integrations"]');
  assert.equal(await integrations.getByText('Remote MCP',{exact:true}).isVisible(),true);
  assert.equal(await integrations.getByText('WebMCP',{exact:true}).isVisible(),true);
  assert.equal(await integrations.getByText('/mcp',{exact:true}).isVisible(),true);
  assert.equal(await integrations.getByText('/api/v1',{exact:true}).isVisible(),true);

  await page.getByRole('link',{name:/Minimal reproducer$/}).click();
  await page.waitForURL(/#\/minimal$/);
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length===10);
  assert.equal(await page.locator('#source').isVisible(),true);
  assert.deepEqual(await page.evaluate(()=>Object.keys(window.faultline).sort()),['applySource','autopilot','defineOracle','exportCase','history','inspect','manifest','pin','probe','reduce','restore','run'].sort());
  assert.equal(await page.locator('#webmcp').textContent(),'WebMCP ready · 10 tools');
  const toolContract=await page.evaluate(()=>window.__webmcpTools.map(t=>({name:t.name,execute:typeof t.execute,handler:'handler' in t})));
  assert.equal(toolContract.length,10); assert.ok(toolContract.every(t=>t.execute==='function'&&!t.handler));
  const baseline=await page.evaluate(()=>window.faultline.run());
  assert.equal(baseline.status,'FAIL');
  const before=await page.evaluate(()=>window.faultline.inspect());
  const noiseId=await page.evaluate(()=>{const u=[...document.querySelectorAll('.unit')].find(x=>x.textContent.includes('Irrelevant debug noise'));return u?.dataset.unitId});
  assert.ok(noiseId);
  const probe=await page.evaluate(id=>window.faultline.probe({targetAxis:'html',unitId:id}),noiseId);
  assert.equal(probe.status,'FAIL'); assert.equal(probe.mutated,false);
  const reduction=await page.evaluate(()=>window.faultline.reduce({targetAxis:'html',maxTrials:40}));
  assert.equal(reduction.status,'FAIL');
  const after=await page.evaluate(()=>window.faultline.inspect());
  assert.ok(after.case.html.includes('modal')); assert.ok(!after.case.html.includes('Irrelevant debug noise')); assert.notEqual(after.revision,before.revision);

  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  assert.equal(await page.locator('#mobile-nav-toggle').isVisible(),true);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('Browser gate PASS: connected multi-view workflow, guided investigation, integrations, strict WebMCP, deterministic reduction, and mobile shell all verified.');
} finally {
  if(browser) await browser.close();
  server.kill('SIGTERM');
}
