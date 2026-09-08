import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';

const appPort=4199;
const sinkPort=4200;
let sinkHits=0;
const sink=http.createServer((req,res)=>{sinkHits++;res.writeHead(204);res.end();});
await new Promise((resolve,reject)=>sink.once('error',reject).listen(sinkPort,'127.0.0.1',resolve));

const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${appPort},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try {
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${appPort}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  await page.evaluate(({sinkPort})=>{
    const current=window.faultline.inspect();
    window.faultline.loadCase({
      expectedRevision:current.revision,
      case:{
        html:`<main id="payload">contained</main><a id="escape" href="http://127.0.0.1:${sinkPort}/preview-escape">escape</a>`,
        css:'',
        js:"document.querySelector('#escape').click()",
        oracle:{kind:'dom_exists',selector:'#payload',equals:true,action:{kind:'none'}}
      }
    });
  },{sinkPort});

  await page.waitForTimeout(100);
  assert.equal(sinkHits,0,'inert preview render must not perform navigation');

  const runPreview=page.locator('#preview-run');
  await runPreview.waitFor();
  await runPreview.click();
  await page.waitForTimeout(250);

  assert.equal(sinkHits,0,'explicit preview execution must apply the same navigation containment policy as deterministic experiments');
  const summary=await page.locator('#summary').textContent();
  assert.match(summary||'',/UNSAFE_NAVIGATION/,'blocked preview execution must surface a machine-readable navigation reason to the user');
  console.log('Interactive preview navigation containment PASS: explicit preview execution cannot bypass experiment navigation policy.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
  await new Promise(resolve=>sink.close(resolve));
}
