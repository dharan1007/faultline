import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import { captureFaultlineCase } from '../integrations/playwright-capture/index.js';

const root=process.cwd();
const fixture='<!doctype html><html><head><title>Profile failure</title><style>.noise{color:red} #save{display:block}</style></head><body><p class="noise">irrelevant</p><label>Name <input id="name"></label><button id="save" aria-disabled="true">Save</button></body></html>';
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(pathname==='/fixture'){res.setHeader('content-type','text/html; charset=utf-8');return res.end(fixture);}
  try{
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
const js="const input=document.querySelector('#name'),save=document.querySelector('#save');input.addEventListener('input',()=>save.dataset.name=input.value);save.addEventListener('click',()=>save.setAttribute('aria-disabled',save.dataset.name==='alice'?'true':'false'));";
const oracle={kind:'dom_attribute',selector:'#save',property:'aria-disabled',equals:'true',action:{kind:'sequence',steps:[{kind:'set_value',selector:'#name',value:'alice'},{kind:'click',selector:'#save'}]},delayMs:0};

let browser;
try{
  browser=await chromium.launch({headless:true});
  const capturePage=await browser.newPage({viewport:{width:1280,height:720}});
  await capturePage.goto(`${origin}/fixture`,{waitUntil:'networkidle'});
  const capture=await captureFaultlineCase({page:capturePage,oracle,js,provenance:{testTitle:'save remains disabled after valid name',testFile:'profile.spec.mjs'}});
  assert.equal(capture.schema,'faultline.capture.v1');
  assert.match(capture.source.html,/irrelevant/);

  const page=await browser.newPage();
  await page.goto(origin,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);
  const imported=await page.evaluate(async capture=>{
    const before=window.faultline.inspect();
    return window.faultline.importCapture({expectedRevision:before.revision,capture});
  },capture);
  assert.equal(imported.baseline.status,'FAIL');

  const beforeReduce=await page.evaluate(()=>window.faultline.inspect());
  const reduction=await page.evaluate(async expectedRevision=>window.faultline.autopilot({expectedRevision,axes:['html','css','js'],maxTrialsPerAxis:80}),beforeReduce.revision);
  assert.equal(reduction.status,'COMPLETE');
  const rerun=await page.evaluate(async()=>window.faultline.run({expectedRevision:window.faultline.inspect().revision}));
  assert.equal(rerun.status,'FAIL','reduced imported capture must preserve the original failure');

  const bundle=await page.evaluate(()=>window.faultline.exportBundle());
  assert.equal(bundle.schema,'faultline.export.v1');
  assert.equal(bundle.captureProvenance.provenance.testTitle,'save remains disabled after valid name');
  assert.ok(bundle.case.html.length<=beforeReduce.case.html.length);
  assert.ok(bundle.case.css.length<=beforeReduce.case.css.length);
  assert.ok(bundle.case.js.length<=beforeReduce.case.js.length);
  assert.match(bundle.standaloneHtml,/<!doctype html>/i);

  const negativeBefore=await page.evaluate(()=>window.faultline.inspect());
  const nonReproducing={...capture,oracle:{...capture.oracle,equals:'false'}};
  const rejected=await page.evaluate(async({revision,capture})=>{
    try{await window.faultline.importCapture({expectedRevision:revision,capture});return null;}catch(error){return error.message;}
  },{revision:negativeBefore.revision,capture:nonReproducing});
  assert.equal(rejected,'CAPTURE_NOT_REPRODUCED');
  const negativeAfter=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(negativeAfter.revision,negativeBefore.revision,'non-reproducing capture must not mutate revision');
  assert.deepEqual(negativeAfter.case,negativeBefore.case,'non-reproducing capture must not mutate case');

  console.log('Playwright capture ingestion PASS: real page capture reproduces, reduces, re-verifies, exports provenance, and rejects non-reproducing imports transactionally.');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
