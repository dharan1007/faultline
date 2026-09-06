import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4202;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try {
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>tools.push(tool)}});
    window.__webmcpTools=tools;
  });
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.some(tool=>tool.name==='faultline_reduce'));

  const before=await page.evaluate(()=>window.faultline.inspect());
  const outcome=await page.evaluate(async expectedRevision=>{
    const tool=window.__webmcpTools.find(t=>t.name==='faultline_reduce');
    try {
      const value=await tool.execute({expectedRevision,requestId:'budget-integrity',targetAxis:'html',maxTrials:1});
      return {error:null,value:JSON.parse(value)};
    } catch (error) {
      return {error:String(error?.message||error),value:null};
    }
  },before.revision);
  const after=await page.evaluate(()=>window.faultline.inspect());

  assert.match(outcome.error||'',/TRIAL_BUDGET_EXHAUSTED/,'an exhausted ddmin budget must be explicit instead of reporting an incomplete reduction as complete');
  assert.equal(after.revision,before.revision,'budget exhaustion must not commit a partial canonical reduction');
  assert.deepEqual(after.case,before.case,'budget exhaustion must preserve the exact canonical case');

  console.log('Reduction budget integrity PASS: exhausted trial budgets reject explicitly and cannot commit an incomplete canonical reduction.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
