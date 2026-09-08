import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4178;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try {
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  await page.evaluate(()=>{
    const current=window.faultline.inspect();
    window.faultline.loadCase({
      expectedRevision:current.revision,
      case:{
        html:'<main><p id="preview-js">before</p></main>',
        css:'#preview-js{font-weight:700}',
        js:"document.querySelector('#preview-js').textContent='after';",
        oracle:{kind:'dom_exists',selector:'#preview-js',equals:true,action:{kind:'none'}}
      }
    });
  });

  await page.waitForTimeout(100);
  const previewFrame=page.frames().find(frame=>frame!==page.mainFrame()&&frame.url()==='about:srcdoc');
  assert.ok(previewFrame,'visible preview frame must exist');
  await previewFrame.locator('#preview-js').waitFor();
  assert.equal(await previewFrame.locator('#preview-js').textContent(),'after','visible preview must execute canonical JavaScript inside the existing sandbox');

  console.log('Interactive preview JS gate PASS: the visible isolated preview executes canonical JavaScript.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
