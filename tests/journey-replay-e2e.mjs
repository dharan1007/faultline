import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';

import {createJourneyStep} from '../src/journey.js';
import {replayJourney} from '../apps/coordinator/replay.mjs';

const port=4292;
const root=path.join(process.cwd(),'public');
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');const root=${JSON.stringify(root)};http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/demo'||p==='/demo/')p='/demo/index.html';const f=path.resolve(root,'.'+p);if(!f.startsWith(root)){res.statusCode=403;return res.end('forbidden')}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}const ext=path.extname(f);if(ext==='.js')res.setHeader('content-type','application/javascript');if(ext==='.css')res.setHeader('content-type','text/css');if(ext==='.html')res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(resolve=>setTimeout(resolve,700));

const journey=[
  createJourneyStep({id:'open-edge',kind:'click',target:{role:'button',accessibleName:'Open edge-api deployment'}}),
  createJourneyStep({id:'configure',kind:'click',target:{role:'button',accessibleName:'Configure deployment'}}),
  createJourneyStep({id:'environment',kind:'select',target:{role:'combobox',accessibleName:'Environment'},value:'staging'}),
  createJourneyStep({id:'advanced',kind:'check',target:{role:'checkbox',accessibleName:'Enable advanced delivery'}}),
  createJourneyStep({id:'save',kind:'click',target:{role:'button',accessibleName:'Save configuration'}}),
  createJourneyStep({id:'settle',kind:'wait',value:750,timeoutMs:1500})
];
const oracle={type:'clickability',selector:{role:'button',accessibleName:'Open auth-gateway deployment'},expected:true};

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto(`http://127.0.0.1:${port}/demo/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__FAULTLINE_DEMO__?.version);

  const first=await replayJourney(page,journey,{oracle});
  assert.equal(first.operationStatus,'COMPLETED');
  assert.equal(first.oracleOutcome,'FAIL');
  assert.equal(first.oracle.type,'clickability');
  assert.equal(first.oracle.observed,false,'stale backdrop must make a deployment-table action physically unclickable');
  assert.ok(first.steps.every(step=>step.status==='COMPLETED'));
  assert.match(page.url(),/deployment=edge-api/,'replay must preserve the route transition produced by the canonical journey');

  await page.goto(`http://127.0.0.1:${port}/demo/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__FAULTLINE_DEMO__?.version);
  const second=await replayJourney(page,journey,{oracle});
  assert.equal(second.operationStatus,'COMPLETED');
  assert.equal(second.oracleOutcome,'FAIL','reproducibility gate requires the same failure on the second consecutive replay');

  await page.goto(`http://127.0.0.1:${port}/demo/`,{waitUntil:'networkidle'});
  const stale=await replayJourney(page,[createJourneyStep({id:'missing',kind:'click',target:{role:'button',accessibleName:'Removed control'},timeoutMs:250})],{oracle});
  assert.equal(stale.operationStatus,'COMPLETED');
  assert.equal(stale.oracleOutcome,'UNRESOLVED','a stale selector must not be mislabeled PASS or FAIL');
  assert.equal(stale.steps[0].status,'UNRESOLVED');

  const controller=new AbortController();
  controller.abort();
  const cancelled=await replayJourney(page,journey,{oracle,signal:controller.signal});
  assert.equal(cancelled.operationStatus,'CANCELLED');
  assert.equal(cancelled.oracleOutcome,'UNRESOLVED','operation cancellation and oracle outcome must remain separate concepts');

  console.log('Journey replay PASS: semantic replay reproduces the modern failure twice, preserves route state, resolves stale selectors honestly, and separates cancellation from oracle outcome.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
