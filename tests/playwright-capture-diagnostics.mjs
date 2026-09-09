import { chromium } from 'playwright';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { armFaultlineDiagnostics, captureFaultlineCase } from '../integrations/playwright-capture/index.js';

const app='<!doctype html><html><body><button id="boom">Boom</button><script>document.querySelector("#boom").addEventListener("click",()=>{console.error("FAULTLINE_CONSOLE_"+"x".repeat(2200));setTimeout(()=>{throw new Error("FAULTLINE_PAGE_ERROR")},0)})</script></body></html>';
const server=createServer((req,res)=>{res.setHeader('content-type','text/html; charset=utf-8');res.end(app)});
await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));
let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  const beforeConsole=page.listenerCount('console');
  const beforePageError=page.listenerCount('pageerror');
  const diagnostics=armFaultlineDiagnostics(page);
  assert.equal(page.listenerCount('console'),beforeConsole+1,'arming must add exactly one console listener');
  assert.equal(page.listenerCount('pageerror'),beforePageError+1,'arming must add exactly one pageerror listener');
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.click('#boom');
  await page.waitForTimeout(30);
  const capture=await captureFaultlineCase({page,oracle:{kind:'dom_exists',selector:'#missing',equals:true,action:{kind:'none'},delayMs:0},diagnostics});
  assert.equal(capture.diagnostics.consoleErrors.length,1,'console.error must survive capture');
  assert.equal(capture.diagnostics.pageErrors.length,1,'pageerror must survive capture');
  assert.match(capture.diagnostics.consoleErrors[0],/^FAULTLINE_CONSOLE_/);
  assert.equal(capture.diagnostics.consoleErrors[0].length,2048,'console diagnostic must be bounded');
  assert.match(capture.diagnostics.pageErrors[0],/FAULTLINE_PAGE_ERROR/);
  for(let i=0;i<250;i+=1)console.error('host-noise-'+i);
  assert.ok(capture.diagnostics.consoleErrors.length<=200,'capture diagnostics must remain schema bounded');
  diagnostics.dispose();
  assert.equal(page.listenerCount('console'),beforeConsole,'dispose must remove console listener');
  assert.equal(page.listenerCount('pageerror'),beforePageError,'dispose must remove pageerror listener');
  assert.throws(()=>diagnostics.snapshot(),/DIAGNOSTICS_DISPOSED/,'disposed sessions must not be reused');
  console.log('Playwright capture diagnostics PASS: armed sessions preserve bounded browser errors and clean up listeners deterministically.');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
