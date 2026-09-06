import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4197;
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
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.some(tool=>tool.name==='faultline_reduce'));

  const contracts=await page.evaluate(()=>{
    const names=['faultline_probe','faultline_pin','faultline_reduce'];
    const registered=Object.fromEntries(names.map(name=>{
      const tool=window.__webmcpTools.find(entry=>entry.name===name);
      return [name,tool?.inputSchema?.required||[]];
    }));
    const manifest=Object.fromEntries(window.faultline.manifest().filter(entry=>names.includes(entry.name)).map(entry=>[entry.name,entry.inputSchema.required||[]]));
    return {registered,manifest};
  });

  const expected={
    faultline_probe:['expectedRevision','requestId','targetAxis','unitId'],
    faultline_pin:['expectedRevision','targetAxis','unitId'],
    faultline_reduce:['expectedRevision','requestId','targetAxis']
  };

  assert.deepEqual(contracts.registered,expected,'registered WebMCP schemas must require every input needed to choose a deterministic semantic axis/unit and cancellation owner');
  assert.deepEqual(contracts.manifest,expected,'manifest must exactly match the registered deterministic input contract');

  console.log('WebMCP explicit-axis contract PASS: probe, pin, and reduce cannot inherit hidden human tab state, while cancellable operations require caller-owned request IDs.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
