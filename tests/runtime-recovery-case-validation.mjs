import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4212;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

const fixture={
  html:'<dialog id="modal" open><button id="save">Save</button></dialog><p id="noise">Irrelevant debug noise</p>',
  css:'#modal{display:block;position:fixed;z-index:10} #noise{color:gray} button{padding:8px}',
  js:"document.querySelector('#save').addEventListener('click',()=>{ document.querySelector('#modal').open = true; });\nconsole.debug('noise');",
  oracle:{kind:'dom_property',selector:'#modal',property:'open',equals:true,action:{kind:'click',selector:'#save'},delayMs:0}
};
const current={...fixture,html:'<main id="canonical-r2">canonical r2</main>'};
const malformed={html:'<main>malformed recovery</main>'};

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.addInitScript(({fixture,current,malformed})=>{
    const payload={
      version:3,
      store:{version:1,revision:2,value:current,snapshots:[['r1',fixture],['r2',current]],ledger:[{kind:'source',axis:'html',revision:'r2',at:new Date().toISOString()}]},
      axis:'html',
      pins:[],
      experimentLedger:[],
      revisions:[
        ['r1',{value:malformed,pins:[]}],
        ['r2',{value:current,pins:[]}]
      ]
    };
    localStorage.setItem('faultline-prod-v3',JSON.stringify(payload));
  },{fixture,current,malformed});
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  const discovered=await page.evaluate(()=>window.faultline.revisions());
  assert.equal(discovered.currentRevision,'r2');
  assert.equal(discovered.revisions.some(item=>item.revision==='r1'),false,'malformed recovery cases must not be advertised as recoverable revisions');

  const restoreError=await page.evaluate(async()=>{
    try{
      await window.faultline.restore({expectedRevision:'r2',targetRevision:'r1'});
      return null;
    }catch(error){
      return String(error?.message||error);
    }
  });
  assert.equal(restoreError,'REVISION_NOT_FOUND','malformed recovery cases must not be restorable into canonical state');

  const canonical=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(canonical.revision,'r2','rejecting malformed recovery metadata must not advance canonical revision');
  assert.equal(canonical.case.html,current.html,'rejecting malformed recovery metadata must preserve the valid canonical case');

  console.log('Runtime recovery case validation PASS: malformed persisted recovery cases are discarded before discovery or restore.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
