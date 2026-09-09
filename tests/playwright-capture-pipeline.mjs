import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4237;
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
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length>0);

  assert.equal(await page.evaluate(()=>typeof window.faultline.importCapture),'function','browser API must expose transactional capture ingestion');
  assert.equal(await page.evaluate(()=>typeof window.faultline.exportCapture),'function','browser API must expose capture export with provenance');

  const toolNames=await page.evaluate(()=>window.__webmcpTools.map(tool=>tool.name));
  assert.ok(toolNames.includes('faultline_import_capture'),'WebMCP must expose capture ingestion');
  assert.ok(toolNames.includes('faultline_export_capture'),'WebMCP must expose capture export');

  console.log('Playwright capture pipeline surface PASS: browser API and WebMCP expose transactional capture import/export.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
