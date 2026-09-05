import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4189;
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
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length===11);

  const initial=await page.evaluate(()=>window.faultline.inspect());
  const htmlEdit=await page.evaluate(({revision})=>window.faultline.applySource({expectedRevision:revision,targetAxis:'html',source:'<div id="target">target</div>'}),{revision:initial.revision});
  const cssEdit=await page.evaluate(({revision})=>window.faultline.applySource({expectedRevision:revision,targetAxis:'css',source:'#target{opacity:0}'}),{revision:htmlEdit.revision});
  const oracleState=await page.evaluate(({revision})=>window.faultline.defineOracle({expectedRevision:revision,oracle:{kind:'computed_style',selector:'#target',property:'opacity',equals:0,action:{kind:'none'},delayMs:0}}),{revision:cssEdit.revision});

  const result=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:oracleState.revision});
  assert.equal(result.status,'FAIL','computed-style oracle must compare CSSOM string values deterministically even when the supplied expectation is numeric');
  assert.equal(result.evidence.actual,'0','CSSOM should expose opacity as a string');
  assert.equal(result.evidence.expected,'0','evidence should report the normalized CSSOM comparison value');

  console.log('Computed-style normalization PASS: numeric-looking expectations are normalized to CSSOM strings before deterministic comparison.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
