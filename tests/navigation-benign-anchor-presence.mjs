import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4201;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  let state=await page.evaluate(()=>window.faultline.inspect());
  const html='<a id="docs" href="https://example.invalid/docs">Docs</a><button id="work">Work</button><p id="status">before</p>';
  state=await page.evaluate(({revision,html})=>window.faultline.applySource({expectedRevision:revision,targetAxis:'html',source:html}),{revision:state.revision,html});
  state=await page.evaluate(({revision})=>window.faultline.applySource({expectedRevision:revision,targetAxis:'js',source:"document.querySelector('#work').addEventListener('click',()=>{document.querySelector('#status').textContent='after'})"}),{revision:state.revision});
  state=await page.evaluate(({revision})=>window.faultline.defineOracle({expectedRevision:revision,oracle:{kind:'dom_property',selector:'#status',property:'textContent',equals:'after',action:{kind:'click',selector:'#work'},delayMs:0}}),{revision:state.revision});

  const result=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:state.revision});
  assert.equal(result.status,'FAIL','an inert external anchor must not make an otherwise executable case unresolved');
  assert.equal(result.evidence?.actual,'after','the real oracle action must still execute when unrelated navigation links are present');
  console.log('Benign-anchor presence PASS: ordinary unactivated links do not block deterministic case execution.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
