import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4193;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>tools.push(tool)}});
    window.__webmcpTools=tools;
  });
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length===13);

  const workflow=page.locator('nav[aria-label="FAULTLINE workflow"]');
  assert.equal(await workflow.count(),1,'workbench must expose one explicit workflow navigator');
  const steps=workflow.locator('[data-workflow-step]');
  assert.equal(await steps.count(),4,'workflow navigator must expose exactly four steps');
  assert.deepEqual(await steps.allTextContents().then(xs=>xs.map(x=>x.replace(/\s+/g,' ').trim())),[
    '1 Load / Edit Case','2 Define Oracle','3 Run / Reduce','4 Evidence / Export'
  ],'workflow labels must make the debugging sequence explicit');

  for(const id of ['case-workspace','reduction-workspace','oracle-workspace','evidence-workspace','integration-workspace']){
    assert.equal(await page.locator(`#${id}`).count(),1,`${id} must exist as a distinct product region`);
  }
  assert.equal(await page.locator('details#integration-workspace > summary').count(),1,'integration surface must be expandable instead of permanently consuming the primary workspace');

  const caseBox=await page.locator('#case-workspace').boundingBox();
  const oracleBox=await page.locator('#oracle-workspace').boundingBox();
  const evidenceBox=await page.locator('#evidence-workspace').boundingBox();
  assert(caseBox&&oracleBox&&evidenceBox,'primary workbench regions must be visible');
  assert(caseBox.x < oracleBox.x,'desktop case workspace must lead the oracle rail');
  assert(evidenceBox.y > Math.min(caseBox.y,oracleBox.y),'evidence must read after the active debugging workspace rather than compete as a third column');
  assert(evidenceBox.width > caseBox.width*.9,'evidence must have enough horizontal space for readable causal history');

  await page.locator('#apply').focus();
  const focusStyle=await page.locator('#apply').evaluate(el=>{const s=getComputedStyle(el);return {outline:s.outlineStyle,outlineWidth:s.outlineWidth,boxShadow:s.boxShadow}});
  assert(focusStyle.outline!=='none'||focusStyle.outlineWidth!=='0px'||focusStyle.boxShadow!=='none','keyboard focus must have a visible treatment');

  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(100);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert(overflow<=1,`mobile workbench must not overflow horizontally (overflow=${overflow})`);
  const mobileOrder=await page.evaluate(()=>['case-workspace','oracle-workspace','reduction-workspace','evidence-workspace','integration-workspace'].map(id=>({id,top:document.getElementById(id).getBoundingClientRect().top+scrollY})));
  assert(mobileOrder[0].top < mobileOrder[1].top && mobileOrder[1].top < mobileOrder[2].top && mobileOrder[2].top < mobileOrder[3].top,'mobile layout must follow case → oracle → reduction → evidence');

  console.log('Workbench UI structure PASS: FAULTLINE exposes a guided four-step workflow, readable desktop hierarchy, visible focus, and overflow-safe mobile order.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
