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
  await page.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>tools.push({...tool,execute:async(input,options)=>JSON.stringify(await tool.execute(input,options))})}});
    window.__webmcpTools=tools;
  });
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.some(tool=>tool.name==='faultline_revisions'));

  const annotations=await page.evaluate(()=>Object.fromEntries(window.__webmcpTools.map(tool=>[tool.name,tool.annotations])));
  const candidateContentTools=[
    'faultline_inspect',
    'faultline_units',
    'faultline_load_case',
    'faultline_run',
    'faultline_define_oracle',
    'faultline_apply_source',
    'faultline_probe',
    'faultline_pin',
    'faultline_history',
    'faultline_restore',
    'faultline_export'
  ];
  for(const name of candidateContentTools){
    assert.equal(annotations[name]?.untrustedContentHint,true,`${name} returns candidate-controlled content and must advertise untrustedContentHint=true`);
  }
  assert.equal(annotations.faultline_reset_case?.untrustedContentHint,false,'faultline_reset_case returns only the trusted built-in fixture and bounded canonical metadata');
  assert.equal(annotations.faultline_reduce?.untrustedContentHint,false,'faultline_reduce returns bounded structural reduction metrics only');
  assert.equal(annotations.faultline_autopilot?.untrustedContentHint,false,'faultline_autopilot returns bounded structural reduction metrics only');
  assert.equal(annotations.faultline_revisions?.untrustedContentHint,false,'faultline_revisions returns bounded structural recovery metadata without historical candidate source text');
  assert.equal(annotations.faultline_revisions?.readOnlyHint,true,'faultline_revisions must remain a read-only discovery operation');

  const manifest=await page.evaluate(()=>window.faultline.manifest());
  for(const entry of manifest){
    assert.deepEqual(entry.annotations,annotations[entry.name],`${entry.name} manifest annotations must match the registered WebMCP contract`);
  }
  console.log('WebMCP trust annotation PASS: candidate-controlled outputs are marked untrusted while bounded structural outputs, including recoverable revision discovery, remain trusted.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}