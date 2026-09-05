import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';

const appPort=4183;
const sinkPort=4184;
let sinkHits=0;
const sink=http.createServer((req,res)=>{sinkHits++;res.writeHead(204);res.end();});
await new Promise((resolve,reject)=>sink.once('error',reject).listen(sinkPort,'127.0.0.1',resolve));

const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${appPort},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${appPort}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  let state=await page.evaluate(()=>window.faultline.inspect());
  state=await page.evaluate(({revision})=>window.faultline.applySource({expectedRevision:revision,targetAxis:'html',source:'<main id="payload">contained</main>'}),{revision:state.revision});
  const navigationSource=`window['loc'+'ation'].href='http://127.0.0.1:${sinkPort}/computed-escape'`;
  state=await page.evaluate(({revision,source})=>window.faultline.applySource({expectedRevision:revision,targetAxis:'js',source}),{revision:state.revision,source:navigationSource});
  state=await page.evaluate(({revision})=>window.faultline.defineOracle({expectedRevision:revision,oracle:{kind:'dom_exists',selector:'#payload',equals:true,action:{kind:'none'},delayMs:0}}),{revision:state.revision});

  const result=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:state.revision});
  await page.waitForTimeout(150);
  assert.equal(sinkHits,0,'computed global location access must not escape the sandbox onto the network');
  assert.equal(result.status,'UNRESOLVED','computed navigation must be rejected rather than executed');
  assert.equal(result.evidence?.reason,'UNSAFE_NAVIGATION','computed navigation rejection must be explicit and machine-readable');
  console.log('Computed-navigation containment PASS: dynamically assembled location access cannot bypass FAULTLINE network containment.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
  await new Promise(resolve=>sink.close(resolve));
}
