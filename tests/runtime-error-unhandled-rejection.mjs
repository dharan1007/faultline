import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4210;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>tools.push(tool)}});
    window.__webmcpTools=tools;
  });
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  const initial=await page.evaluate(()=>window.faultline.inspect());
  const asyncFailureCase={
    html:'<main id="app">Async failure reproducer</main>',
    css:'#app{display:block}',
    js:'Promise.reject(new Error("ASYNC_FAULT"));',
    oracle:{kind:'runtime_error',selector:'',property:'',equals:'ASYNC_FAULT',action:{kind:'none',selector:''},delayMs:20}
  };
  const loaded=await page.evaluate(({revision,nextCase})=>window.faultline.loadCase({expectedRevision:revision,case:nextCase}),{revision:initial.revision,nextCase:asyncFailureCase});
  const result=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:loaded.revision});

  assert.equal(result.status,'FAIL','an unhandled rejected Promise must satisfy a matching runtime_error oracle');
  assert.equal(result.evidence.actual,'ASYNC_FAULT','runtime_error evidence must preserve the rejected error message');
  assert.equal(result.evidence.expected,'ASYNC_FAULT');

  console.log('Unhandled rejection oracle PASS: uncaught Promise rejections are captured as deterministic runtime failures.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
