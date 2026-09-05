import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4189;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.addInitScript(()=>{
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async()=>{}}});
  });
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  assert.equal(await page.locator('#case-import').count(),1,'human workflow must expose one case import surface');
  assert.equal(await page.locator('#case-import-json').count(),1,'case import must expose a JSON editor');
  assert.equal(await page.locator('#import-case').count(),1,'case import must expose one explicit atomic import action');

  const before=await page.evaluate(()=>window.faultline.inspect());
  const imported={
    html:'<main id="imported"><button id="go">Go</button></main>',
    css:'#imported{display:grid}',
    js:"document.querySelector('#go').dataset.ready='yes';",
    oracle:{kind:'dom_exists',selector:'#imported',equals:true,action:{kind:'none'},delayMs:0}
  };

  await page.locator('#case-import-json').fill(JSON.stringify(imported,null,2));
  await page.locator('#import-case').click();
  await page.waitForFunction(html=>window.faultline.inspect().case.html===html,imported.html);

  const after=await page.evaluate(()=>window.faultline.inspect());
  assert.deepEqual(after.case,imported,'human import must replace HTML/CSS/JS/oracle as one canonical case');
  assert.equal(Number(after.revision.slice(1)),Number(before.revision.slice(1))+1,'human import must advance exactly one canonical revision');
  assert.equal(await page.locator('#source').inputValue(),imported.html,'visible source editor must synchronize to the imported case');

  await page.locator('#case-import-json').fill('{not valid json');
  await page.locator('#import-case').click();
  await page.waitForTimeout(50);
  const afterInvalid=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(afterInvalid.revision,after.revision,'invalid JSON must not mutate canonical state');
  assert.deepEqual(afterInvalid.case,after.case,'invalid JSON must leave the imported case intact');
  assert.equal(pageErrors.length,0,pageErrors.join('\n'));

  console.log('Human atomic case import PASS: complete case JSON loads through one canonical revision and invalid JSON is non-mutating.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
