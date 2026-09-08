import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';

const appPort=4215;
const sinkPort=4216;
let upgradeHits=0;
const sink=http.createServer((req,res)=>{res.writeHead(204);res.end();});
sink.on('upgrade',(req,socket)=>{upgradeHits++;socket.destroy();});
await new Promise((resolve,reject)=>sink.once('error',reject).listen(sinkPort,'127.0.0.1',resolve));

const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${appPort},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try {
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${appPort}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  const state=await page.evaluate(({sinkPort})=>{
    const current=window.faultline.inspect();
    return window.faultline.loadCase({expectedRevision:current.revision,case:{
      html:'<main id="payload">contained</main>',
      css:'',
      js:`try{const socket=new WebSocket('ws://127.0.0.1:${sinkPort}/socket-escape');socket.onerror=()=>{}}catch{};document.querySelector('#payload').dataset.afterSocket='yes'`,
      oracle:{kind:'dom_exists',selector:'#payload',equals:true,action:{kind:'none'},delayMs:0}
    }});
  },{sinkPort});

  const result=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:state.revision});
  await page.waitForTimeout(180);
  assert.equal(upgradeHits,0,'WebSocket handshakes must never leave the experiment sandbox');
  assert.equal(result.status,'UNRESOLVED','a blocked WebSocket attempt must not be reported as ordinary oracle evidence');
  assert.equal(result.evidence?.reason,'UNSAFE_NETWORK','WebSocket rejection must be explicit and machine-readable');
  assert.equal(result.evidence?.capability,'websocket','network evidence must identify the blocked API');

  await page.locator('#preview-run').click();
  await page.waitForTimeout(220);
  assert.equal(upgradeHits,0,'explicit preview execution must not issue WebSocket handshakes');
  const summary=await page.locator('#summary').textContent();
  assert.match(summary||'',/UNSAFE_NETWORK · js · websocket/,'blocked preview WebSocket must be visible to the user');

  console.log('WebSocket-network containment PASS: blocked WebSocket attempts become deterministic unsafe-network evidence in runner and preview.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
  await new Promise(resolve=>sink.close(resolve));
}
