import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4203;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

const fixture={
  html:'<dialog id="modal" open><button id="save">Save</button></dialog><p id="noise">Irrelevant debug noise</p>',
  css:'#modal{display:block;position:fixed;z-index:10} #noise{color:gray} button{padding:8px}',
  js:"document.querySelector('#save').addEventListener('click',()=>{ document.querySelector('#modal').open = true; });\nconsole.debug('noise');",
  oracle:{kind:'dom_property',selector:'#modal',property:'open',equals:true,action:{kind:'click',selector:'#save'},delayMs:0}
};
const forged={...fixture,html:'<main id="forged-future">this revision never existed</main>'};

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.addInitScript(({fixture,forged})=>{
    const payload={
      version:3,
      store:{version:1,revision:1,value:fixture,snapshots:[['r1',fixture]],ledger:[]},
      axis:'html',
      pins:[],
      experimentLedger:[],
      revisions:[
        ['r1',{value:fixture,pins:[]}],
        ['r99',{value:forged,pins:[]}]
      ]
    };
    localStorage.setItem('faultline-prod-v3',JSON.stringify(payload));
  },{fixture,forged});
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  const discovered=await page.evaluate(()=>window.faultline.revisions());
  assert.equal(discovered.currentRevision,'r1');
  assert.equal(discovered.revisions.some(item=>item.revision==='r99'),false,'recovery discovery must never advertise a revision newer than canonical history');

  const restoreError=await page.evaluate(async()=>{
    try{
      await window.faultline.restore({expectedRevision:'r1',targetRevision:'r99'});
      return null;
    }catch(error){
      return String(error?.message||error);
    }
  });
  assert.equal(restoreError,'REVISION_NOT_FOUND','a forged future recovery revision must not be restorable into canonical state');

  const canonical=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(canonical.revision,'r1','rejecting impossible recovery history must not advance canonical revision');
  assert.equal(canonical.case.html,fixture.html,'rejecting impossible recovery history must preserve the valid canonical case');

  console.log('Runtime recovery revision integrity PASS: persisted recovery metadata cannot advertise or restore revisions beyond canonical history.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
