import { chromium } from 'playwright';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { captureFaultlineFailure } from '../capture/playwright.mjs';

const port=4198;
const server=createServer((req,res)=>{
  if(req.url==='/app.js'){
    res.setHeader('content-type','application/javascript');
    return res.end("document.querySelector('#go').addEventListener('click',()=>{document.querySelector('#status').textContent=document.querySelector('#name').value==='alice'?'broken':'ok';});");
  }
  if(req.url==='/app.css'){
    res.setHeader('content-type','text/css');
    return res.end('#status{font-weight:700}.noise{color:gray}');
  }
  res.setHeader('content-type','text/html; charset=utf-8');
  res.end(`<!doctype html><html><head><title>Capture fixture</title><link rel="stylesheet" href="/app.css"></head><body><main><input id="name"><button id="go">Go</button><p id="status">idle</p><p class="noise">noise</p></main><script src="/app.js"></script></body></html>`);
});
await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});

  const capture=await captureFaultlineFailure(page,{
    label:'external dependency fixture',
    actions:[{kind:'set_value',selector:'#name',value:'alice'},{kind:'click',selector:'#go'}],
    oracle:{kind:'dom_property',selector:'#status',property:'textContent',equals:'broken',delayMs:0}
  });
  assert.equal(capture.schema,'faultline.capture.v1');
  assert.match(capture.source.css,/#status\{font-weight:700\}/);
  assert.match(capture.source.js,/addEventListener\('click'/);
  assert.doesNotMatch(capture.source.html,/<(?:script|style|link)\b/i);
  assert.equal(capture.provenance.title,'Capture fixture');
  assert.equal(capture.oracle.action.kind,'sequence');

  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await assert.rejects(()=>captureFaultlineFailure(page,{
    actions:[{kind:'click',selector:'#go'}],
    oracle:{kind:'dom_property',selector:'#status',property:'textContent',equals:'broken',delayMs:0}
  }),/CAPTURE_SOURCE_NOT_FAILING/);

  await page.setContent('<main id="x"></main><script src="https://example.com/external.js"></script>',{waitUntil:'domcontentloaded'});
  await assert.rejects(()=>captureFaultlineFailure(page,{
    actions:[],
    oracle:{kind:'dom_exists',selector:'#x',equals:true,delayMs:0}
  }),/CAPTURE_UNSUPPORTED_DEPENDENCY/);

  await page.setContent('<main id="x"></main>');
  await assert.rejects(()=>captureFaultlineFailure(page,{
    actions:[],
    oracle:{kind:'runtime_error',equals:'boom',delayMs:0}
  }),/CAPTURE_UNSUPPORTED_ORACLE/);

  console.log('Playwright capture adapter PASS: same-origin source and bounded actions become a portable capture while unsupported dependencies fail explicitly.');
} finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
