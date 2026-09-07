import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';

const port=4291;
const root=path.join(process.cwd(),'public');
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');const root=${JSON.stringify(root)};http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/'||p==='/demo'||p==='/demo/')p=p.startsWith('/demo')?'/demo/index.html':'/index.html';const f=path.resolve(root,'.'+p);if(!f.startsWith(root)){res.statusCode=403;return res.end('forbidden')}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}const ext=path.extname(f);if(ext==='.js')res.setHeader('content-type','application/javascript');if(ext==='.css')res.setHeader('content-type','text/css');if(ext==='.html')res.setHeader('content-type','text/html; charset=utf-8');if(ext==='.svg')res.setHeader('content-type','image/svg+xml');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

async function reproduce(page){
  await page.getByRole('button',{name:'Open edge-api deployment'}).click();
  await page.getByRole('button',{name:'Configure deployment'}).click();
  await page.getByLabel('Environment').selectOption('staging');
  await page.locator('label.toggle').click();
  assert.equal(await page.getByLabel('Enable advanced delivery').isChecked(),true,'visible toggle must update the underlying checkbox');
  await page.getByRole('button',{name:'Save configuration'}).click();
  await page.getByText('Configuration saved',{exact:true}).waitFor({state:'visible'});
  await page.waitForFunction(()=>window.__FAULTLINE_DEMO__?.bugState().blocked===true);
  const state=await page.evaluate(()=>window.__FAULTLINE_DEMO__.bugState());
  assert.equal(state.saveSucceeded,true,'mocked async save must actually resolve');
  assert.equal(state.drawerVisible,false,'drawer must visually leave after successful save');
  assert.equal(state.blocked,true,'stale exiting backdrop must keep the dashboard blocked');
  assert.equal(state.backdropPointerEvents,'auto','canonical bug must be caused by pointer interception, not a fake status flag');
  return state;
}

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const response=await page.goto(`http://127.0.0.1:${port}/demo/`,{waitUntil:'networkidle'});
  assert.equal(response?.status(),200,'complex demo must be shipped at /demo/');
  await page.waitForFunction(()=>window.__FAULTLINE_DEMO__?.version);

  assert.equal(await page.locator('[data-demo="modern-ops"]').count(),1,'demo must identify its real application root');
  for(const selector of ['[data-surface="sidebar"]','[data-surface="command-search"]','[data-surface="health-cards"]','svg[data-surface="usage-chart"]','[data-surface="deployments-table"]','[data-surface="activity-feed"]']){
    assert.equal(await page.locator(selector).count(),1,`${selector} must exist in the modern demo`);
  }
  assert.ok((await page.locator('[data-deployment-row]').count())>=5,'demo must contain a meaningful deployment table rather than a toy row');
  assert.ok((await page.locator('[data-health-card]').count())>=4,'demo must contain multiple operational status cards');
  const contract=await page.evaluate(()=>({version:window.__FAULTLINE_DEMO__.version,journey:window.__FAULTLINE_DEMO__.canonicalJourney,hints:window.__FAULTLINE_DEMO__.candidateHints()}));
  assert.ok(contract.journey.length>=5,'demo must publish a non-trivial canonical journey for deterministic capture tests');
  assert.ok(new Set(contract.hints.map(x=>x.axis)).size>=4,'demo must expose observable hints across at least four causal axes');

  const first=await reproduce(page);
  assert.equal(first.blocked,true);
  await page.getByRole('button',{name:'Reset scenario'}).click({force:true});
  await page.waitForFunction(()=>window.__FAULTLINE_DEMO__.bugState().blocked===false);
  const dashboardButton=page.getByRole('button',{name:'Create deployment'});
  await dashboardButton.click();
  await page.getByText('New deployment draft opened',{exact:true}).waitFor({state:'visible'});

  await page.getByRole('button',{name:'Reset scenario'}).click({force:true});
  const second=await reproduce(page);
  assert.equal(second.blocked,true,'canonical failure must reproduce a second consecutive time');

  await page.setViewportSize({width:390,height:844});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert(overflow<=1,`modern demo must remain usable at 390px without horizontal overflow (overflow=${overflow})`);
  assert.equal(await page.locator('[data-mobile-nav]').count(),1,'demo must expose a deliberate mobile navigation surface');

  console.log('Complex modern demo PASS: React operations dashboard reproduces the async stale-backdrop pointer failure twice with multi-axis runtime structure.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
