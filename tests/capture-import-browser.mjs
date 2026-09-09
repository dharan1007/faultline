import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4197;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.addInitScript(()=>{
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async()=>{}}});
  });
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  assert.equal(await page.locator('label[for="capture-import-file"]').count(),1,'workbench must expose a visible capture-file label');
  assert.equal(await page.locator('#capture-import-file').count(),1,'workbench must expose one capture file input');
  assert.equal(await page.locator('#import-capture').count(),1,'workbench must expose one explicit capture import action');
  assert.equal(await page.locator('#capture-provenance').count(),1,'workbench must expose a provenance summary region');
  assert.equal(await page.evaluate(()=>typeof window.faultlineCapture?.validate),'function','browser integration must expose capture validation');
  assert.equal(await page.evaluate(()=>typeof window.faultlineCapture?.import),'function','browser integration must expose atomic capture import');

  await page.locator('#case-import > summary').click();
  const before=await page.evaluate(()=>window.faultline.inspect());
  const imported={
    html:'<main id="from-playwright"><button id="go">Go</button></main>',
    css:'#from-playwright{display:grid}',
    js:"document.querySelector('#go').dataset.ready='yes';",
    oracle:{kind:'dom_exists',selector:'#from-playwright',equals:true,action:{kind:'none'},delayMs:0}
  };
  const artifact={
    format:'faultline.capture',
    version:1,
    capturedAt:'2026-09-09T00:00:00.000Z',
    case:imported,
    provenance:{
      adapter:'faultline-playwright',adapterVersion:1,
      url:'http://127.0.0.1:3000/repro',title:'Captured checkout failure',
      userAgent:'Chromium test agent',viewport:{width:1280,height:720},browser:'chromium'
    },
    baseline:{captured:true,note:'Source and oracle captured from the Playwright test boundary; FAULTLINE re-verifies baseline after import.'}
  };

  await page.locator('#capture-import-file').setInputFiles({name:'checkout.faultline.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(artifact))});
  await page.locator('#import-capture').click();
  await page.waitForFunction(html=>window.faultline.inspect().case.html===html,imported.html);
  const after=await page.evaluate(()=>window.faultline.inspect());
  assert.deepEqual(after.case,imported,'capture import must replace source/oracle through the canonical case boundary');
  assert.equal(Number(after.revision.slice(1)),Number(before.revision.slice(1))+1,'capture import must advance exactly one canonical revision');
  assert.equal(await page.locator('#source').inputValue(),imported.html,'visible source editor must synchronize after capture import');
  const provenance=await page.locator('#capture-provenance').textContent();
  assert.match(provenance,/Captured checkout failure/);
  assert.match(provenance,/chromium/i);
  assert.match(provenance,/127\.0\.0\.1:3000\/repro/);

  const invalid={...artifact,version:2,case:{...imported,html:'<main id="must-not-load"></main>'}};
  await page.locator('#capture-import-file').setInputFiles({name:'invalid.faultline.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
  await page.locator('#import-capture').click();
  await page.waitForTimeout(50);
  const afterInvalid=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(afterInvalid.revision,after.revision,'invalid capture must not advance canonical revision');
  assert.deepEqual(afterInvalid.case,after.case,'invalid capture must not mutate canonical case');
  assert.equal(await page.locator('#health').textContent(),'ERROR');
  assert.match(await page.locator('#summary').textContent(),/FAULTLINE_CAPTURE_INVALID:VERSION/);
  assert.equal(pageErrors.length,0,pageErrors.join('\n'));

  console.log('Playwright capture import PASS: artifact ingestion is accessible, provenance-visible, revision-guarded, and invalid captures are non-mutating.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
