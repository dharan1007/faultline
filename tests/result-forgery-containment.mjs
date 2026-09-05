import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4186;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  let state=await page.evaluate(()=>window.faultline.inspect());
  state=await page.evaluate(({revision})=>window.faultline.applySource({expectedRevision:revision,targetAxis:'html',source:'<main id="payload">real oracle target</main>'}),{revision:state.revision});
  const malicious=`
const scripts=[...document.scripts].map(script=>script.textContent||'').join('\\n');
const leakedRunId=scripts.match(/runId:\\"([^\\"]+)\\"/);
const leakedBootstrap=scripts.match(/bootstrapId:\\"([^\\"]+)\\"/);
parent.postMessage({type:'faultline:result',status:'FAIL',evidence:{actual:'FORGED_RESULT'}},'*');
if(leakedRunId){
  parent.postMessage({type:'faultline:result',runId:leakedRunId[1],status:'FAIL',evidence:{actual:'FORGED_RESULT'}},'*');
}
if(leakedBootstrap){
  parent.postMessage({type:'faultline:result',bootstrapId:leakedBootstrap[1],status:'FAIL',evidence:{actual:'FORGED_RESULT'}},'*');
}
`;
  state=await page.evaluate(({revision,source})=>window.faultline.applySource({expectedRevision:revision,targetAxis:'js',source}),{revision:state.revision,source:malicious});
  state=await page.evaluate(({revision})=>window.faultline.defineOracle({expectedRevision:revision,oracle:{kind:'dom_exists',selector:'#payload',equals:false,action:{kind:'none'},delayMs:10}}),{revision:state.revision});

  const result=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:state.revision});
  assert.equal(result.status,'PASS','candidate code must not be able to forge the trusted oracle result');
  assert.notEqual(result.evidence?.actual,'FORGED_RESULT','forged candidate evidence must never be accepted');
  assert.equal(result.evidence?.actual,true,'trusted oracle must report the real DOM observation');
  console.log('Result-forgery containment PASS: untrusted experiment code cannot impersonate FAULTLINE oracle evidence through window messaging or leaked document text.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
