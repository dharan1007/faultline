import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const appPort=4215;
let pixelHits=0;
const root=process.cwd();
const server=http.createServer((req,res)=>{
  const requestPath=req.url.split('?')[0];
  if(requestPath==='/pixel'){
    pixelHits++;
    res.writeHead(204);
    res.end();
    return;
  }
  const relative=requestPath==='/'?'/index.html':requestPath;
  const file=path.join(root,relative);
  if(!file.startsWith(root)){res.statusCode=403;res.end();return;}
  fs.readFile(file,(error,body)=>{
    if(error){res.statusCode=404;res.end('not found');return;}
    if(file.endsWith('.js'))res.setHeader('content-type','application/javascript');
    if(file.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');
    res.end(body);
  });
});
await new Promise((resolve,reject)=>server.once('error',reject).listen(appPort,'127.0.0.1',resolve));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${appPort}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  let state=await page.evaluate(()=>window.faultline.inspect());
  state=await page.evaluate(({revision,appPort})=>window.faultline.loadCase({
    expectedRevision:revision,
    case:{
      html:`<main id="payload">contained<img src="http://127.0.0.1:${appPort}/pixel?secret=faultline" alt=""></main>`,
      css:'',
      js:'',
      oracle:{kind:'dom_exists',selector:'#payload',equals:true,action:{kind:'none'},delayMs:120}
    }
  }),{revision:state.revision,appPort});

  const result=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:state.revision});
  assert.equal(result.status,'FAIL','benign DOM oracle should still execute under a network-deny sandbox');
  await page.waitForTimeout(250);
  assert.equal(pixelHits,0,'candidate HTML resources must never leave the isolated experiment sandbox');

  console.log('Sandbox network egress PASS: candidate resource loads are blocked while deterministic DOM execution still completes.');
} finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
