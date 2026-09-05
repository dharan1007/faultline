import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4190;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>tools.push(tool)}});
    window.__webmcpTools=tools;
  });
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length===12);

  const tabs=page.locator('[role="tab"]');
  assert.equal(await tabs.count(),3,'source axis must expose exactly three tabs');
  assert.equal(await tabs.nth(0).getAttribute('tabindex'),'0','active HTML tab must be the sole tab stop');
  assert.equal(await tabs.nth(1).getAttribute('tabindex'),'-1','inactive CSS tab must be removed from sequential tab order');
  assert.equal(await tabs.nth(2).getAttribute('tabindex'),'-1','inactive JS tab must be removed from sequential tab order');

  await tabs.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.axis),'css','ArrowRight must move focus to the next source tab');
  assert.equal(await tabs.nth(1).getAttribute('aria-selected'),'true','ArrowRight must activate the focused CSS tab');
  assert.equal(await tabs.nth(1).getAttribute('tabindex'),'0','newly active CSS tab must become the sole tab stop');
  assert.match(await page.locator('#reduce').textContent(),/CSS/,'keyboard tab activation must update the active source axis');

  await page.keyboard.press('End');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.axis),'js','End must move focus to the last source tab');
  assert.equal(await tabs.nth(2).getAttribute('aria-selected'),'true','End must activate the JS tab');

  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.axis),'html','Home must move focus to the first source tab');
  assert.equal(await tabs.nth(0).getAttribute('aria-selected'),'true','Home must reactivate the HTML tab');

  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.axis),'js','ArrowLeft from the first tab must wrap to the last tab');

  console.log('Source-axis tab accessibility PASS: tabs use roving focus and keyboard navigation with deterministic axis activation.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
