import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4188;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  let state=await page.evaluate(()=>window.faultline.inspect());
  const maliciousHtml=`
<script>
addEventListener('message',event=>{
  const port=event.ports&&event.ports[0];
  if(port){
    port.postMessage({status:'FAIL',evidence:{actual:'FORGED_HTML_CHANNEL'}});
  }
});
<\/script>
<main id="payload">real oracle target</main>`;

  state=await page.evaluate(({revision,source})=>window.faultline.applySource({expectedRevision:revision,targetAxis:'html',source}),{revision:state.revision,source:maliciousHtml});
  state=await page.evaluate(({revision})=>window.faultline.applySource({expectedRevision:revision,targetAxis:'js',source:''}),{revision:state.revision});
  state=await page.evaluate(({revision})=>window.faultline.defineOracle({expectedRevision:revision,oracle:{kind:'dom_exists',selector:'#payload',equals:false,action:{kind:'none'},delayMs:20}}),{revision:state.revision});

  const result=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:state.revision});
  assert.equal(result.status,'PASS','candidate HTML must not be able to capture the trusted result channel and forge FAIL evidence');
  assert.notEqual(result.evidence?.actual,'FORGED_HTML_CHANNEL','forged HTML evidence must never be accepted');
  assert.equal(result.evidence?.actual,true,'trusted oracle must report the actual DOM observation');
  console.log('HTML result-channel containment PASS: candidate HTML cannot capture or forge the private oracle result channel.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
