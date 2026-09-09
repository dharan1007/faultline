import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const adapterUrl=new URL('../integrations/playwright-capture/index.js',import.meta.url);
assert.equal(existsSync(adapterUrl),true,'local Playwright capture adapter must exist');
const {captureFaultlineCase}=await import(adapterUrl.href);

const app=`<!doctype html><html><head><title>Captured profile</title><style>#save{display:block}</style></head><body><label>Name <input id="name"></label><label><input id="notify" type="checkbox"> Notify</label><textarea id="bio"></textarea><select id="role"><option value="user">User</option><option value="admin">Admin</option></select><button id="save" aria-disabled="true">Save</button></body></html>`;
const server=createServer((req,res)=>{res.setHeader('content-type','text/html; charset=utf-8');res.end(app)});
await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  await page.goto(origin,{waitUntil:'networkidle'});

  // Prepare browser state through normal Playwright interactions. These values live in DOM
  // properties and are not reliably represented by the page's original HTML attributes.
  await page.locator('#name').fill('prepared-alice');
  await page.locator('#notify').check();
  await page.locator('#bio').fill('prepared biography');
  await page.locator('#role').selectOption('admin');

  const oracle={kind:'dom_attribute',selector:'#save',property:'aria-disabled',equals:'false',action:{kind:'sequence',steps:[{kind:'set_value',selector:'#name',value:'alice'},{kind:'click',selector:'#save'}]},delayMs:0};
  const js="const name=document.querySelector('#name'),save=document.querySelector('#save');name.addEventListener('input',()=>save.dataset.name=name.value);save.addEventListener('click',()=>save.setAttribute('aria-disabled',save.dataset.name==='alice'?'true':'false'));";
  const capture=await captureFaultlineCase({page,oracle,js,provenance:{testTitle:'profile save regression',testFile:'profile.spec.mjs'}});
  assert.equal(capture.schema,'faultline.capture.v1');
  assert.equal(capture.source.url,origin+'/');
  assert.equal(capture.source.title,'Captured profile');
  assert.match(capture.source.html,/id="save"/);
  assert.match(capture.source.css,/#save\s*\{\s*display:\s*block/);
  assert.equal(capture.source.js,js);
  assert.deepEqual(capture.oracle,oracle);
  assert.equal(capture.provenance.adapter,'@faultline/playwright-capture');
  assert.equal(capture.environment.browser,'chromium');
  assert.equal(capture.environment.viewport.width,1280);
  assert.deepEqual(capture.diagnostics.externalDependencies,[]);

  // Capturing a prepared page must serialize its current browser state, not stale source markup.
  assert.match(capture.source.html,/id="name"[^>]*value="prepared-alice"/,'live input.value must survive capture');
  assert.match(capture.source.html,/id="notify"[^>]*checked/,'live checkbox state must survive capture');
  assert.match(capture.source.html,/<textarea id="bio">prepared biography<\/textarea>/,'live textarea value must survive capture');
  assert.match(capture.source.html,/<option value="admin"[^>]*selected[^>]*>Admin<\/option>/,'live selected option must survive capture');

  console.log('Playwright capture adapter PASS: a caller-owned prepared page becomes a bounded portable FAULTLINE capture with live form state preserved.');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
