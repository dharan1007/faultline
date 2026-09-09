import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://127.0.0.1').pathname;
    const relative=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');
    const file=resolve(root,relative);
    if(!file.startsWith(root)){res.statusCode=403;return res.end('forbidden');}
    const body=await readFile(file);
    const ext=extname(file);
    if(ext==='.js'||ext==='.mjs')res.setHeader('content-type','application/javascript');
    if(ext==='.html')res.setHeader('content-type','text/html; charset=utf-8');
    res.end(body);
  }catch{res.statusCode=404;res.end('not found');}
});
await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));
const origin=`http://127.0.0.1:${server.address().port}`;
const capture={schema:'faultline.capture.v1',capturedAt:'2026-09-09T00:00:00.000Z',source:{url:'http://localhost:4173/profile',title:'<img src=x onerror="window.__captureXss=1">',html:'<input id="name"><button id="save" aria-disabled="true">Save</button>',css:'',js:"const input=document.querySelector('#name'),save=document.querySelector('#save');input.addEventListener('input',()=>save.dataset.name=input.value);save.addEventListener('click',()=>save.setAttribute('aria-disabled',save.dataset.name==='alice'?'true':'false'));"},oracle:{kind:'dom_attribute',selector:'#save',property:'aria-disabled',equals:'true',action:{kind:'sequence',steps:[{kind:'set_value',selector:'#name',value:'alice'},{kind:'click',selector:'#save'}]},delayMs:0},environment:{browser:'chromium',playwrightVersion:'1.55.0',viewport:{width:1280,height:720}},provenance:{adapter:'@faultline/playwright-capture',testTitle:'save remains disabled',testFile:'profile.spec.mjs'},diagnostics:{externalDependencies:[],consoleErrors:['<img src=x onerror="window.__diagnosticXss=1"> console failure'],pageErrors:['Error: captured page boom']}};

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(origin,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);
  const before=await page.evaluate(()=>window.faultline.inspect().revision);

  const disclosure=page.locator('#capture-import > summary');
  assert.ok(await disclosure.count(),'capture import disclosure must exist');
  await disclosure.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#capture-import').getAttribute('open'),'','capture import must open from keyboard activation');

  const file=page.locator('#capture-file');
  assert.equal(await file.getAttribute('accept'),'.json,.faultline.json');
  const verify=page.locator('#verify-capture');
  assert.equal(await verify.isDisabled(),true,'verification is explicit and disabled before a valid selection');
  assert.equal(await page.locator('#capture-status').getAttribute('aria-live'),'polite');

  await file.setInputFiles({name:'failure.faultline.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(capture))});
  assert.equal(await page.evaluate(()=>window.faultline.inspect().revision),before,'selecting a capture must never mutate canonical state');
  assert.equal(await verify.isEnabled(),true);
  assert.match(await page.locator('#capture-summary').innerText(),/save remains disabled/);
  assert.match(await page.locator('#capture-summary').innerText(),/<img src=x onerror=/,'untrusted metadata must render as text');
  const diagnostics=page.locator('#capture-diagnostics');
  assert.equal(await diagnostics.getAttribute('role'),'note','captured failure evidence must have a readable semantic surface');
  assert.match(await diagnostics.innerText(),/Console errors \(1\)/);
  assert.match(await diagnostics.innerText(),/Page errors \(1\)/);
  assert.match(await diagnostics.innerText(),/console failure/);
  assert.match(await diagnostics.innerText(),/captured page boom/);
  assert.equal(await page.evaluate(()=>window.__captureXss??0),0,'capture metadata must never execute');
  assert.equal(await page.evaluate(()=>window.__diagnosticXss??0),0,'captured diagnostic evidence must render as inert text');

  await verify.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(previous=>window.faultline.inspect().revision!==previous,before);
  const after=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(after.captureProvenance.provenance.testTitle,'save remains disabled');
  assert.deepEqual(after.captureProvenance.diagnostics.consoleErrors,capture.diagnostics.consoleErrors,'human import must retain diagnostic evidence in canonical provenance');
  assert.deepEqual(after.captureProvenance.diagnostics.pageErrors,capture.diagnostics.pageErrors,'human import must retain page-error evidence in canonical provenance');
  assert.match(await page.locator('#capture-status').innerText(),/Imported.*FAIL/i);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'capture workflow must not introduce mobile horizontal overflow');
  console.log('Human capture import PASS: selection is non-mutating, diagnostic evidence is inert and accessible, and verification commits only a reproduced failure with provenance preserved.');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
