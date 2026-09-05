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
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error?.message||error)));
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  const before=await page.evaluate(()=>window.faultline.inspect());
  await page.fill('#source','<main id="ui-durable">must persist</main>');
  await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    window.__restoreStorageSetItem=()=>{Storage.prototype.setItem=original};
    Storage.prototype.setItem=function(){throw new DOMException('quota exceeded','QuotaExceededError')};
  });
  await page.click('#apply');
  await page.waitForTimeout(50);
  await page.evaluate(()=>window.__restoreStorageSetItem?.());

  const after=await page.evaluate(()=>({state:window.faultline.inspect(),health:document.querySelector('#health')?.textContent,summary:document.querySelector('#summary')?.textContent}));
  assert.equal(pageErrors.length,0,'UI action failures must be handled instead of escaping as page errors');
  assert.equal(after.health,'ERROR','UI must expose failed canonical actions through runtime health');
  assert.match(after.summary||'',/PERSISTENCE_FAILED/,'UI must explain the persistence failure to the user');
  assert.equal(after.state.revision,before.revision,'failed UI persistence must leave canonical revision unchanged');
  assert.equal(after.state.case.html,before.case.html,'failed UI persistence must leave canonical source unchanged');
  console.log('UI action-error handling PASS: persistence failures remain transactional and are surfaced without uncaught page errors.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
