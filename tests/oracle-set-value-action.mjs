import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4199;
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
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.some(tool=>tool.name==='faultline_define_oracle'));

  const actionSchema=await page.evaluate(()=>window.__webmcpTools.find(tool=>tool.name==='faultline_define_oracle').inputSchema.properties.oracle.properties.action);
  assert.deepEqual(actionSchema.properties.kind.enum,['none','click','set_value','sequence'],'WebMCP must preserve set_value while advertising bounded sequences');
  assert.equal(actionSchema.properties.value?.type,'string','WebMCP set_value actions must advertise a string value');

  const start=await page.evaluate(()=>window.faultline.inspect());
  const loaded=await page.evaluate(async expectedRevision=>window.faultline.loadCase({
    expectedRevision,
    case:{
      html:'<label>Name <input id="name"></label><div id="status">empty</div><div id="not-control">plain</div>',
      css:'',
      js:"document.querySelector('#name').addEventListener('input',event=>{document.querySelector('#status').textContent=event.currentTarget.value});",
      oracle:{kind:'dom_property',selector:'#status',property:'textContent',equals:'alice',action:{kind:'none'},delayMs:0}
    }
  }),start.revision);

  await page.selectOption('#action-kind','set_value');
  await page.fill('#action-selector','#name');
  await page.fill('#action-value','alice');
  await page.click('#lock');
  await page.waitForFunction(revision=>window.faultline.inspect().revision!==revision,loaded.revision);

  const locked=await page.evaluate(()=>window.faultline.inspect());
  assert.deepEqual(locked.case.oracle.action,{kind:'set_value',selector:'#name',value:'alice'},'human oracle UI must persist the complete set_value action');

  await page.click('#run');
  await page.waitForFunction(()=>document.querySelector('#health')?.textContent==='FAIL');
  const latest=await page.evaluate(()=>window.faultline.history({limit:1})[0]);
  assert.equal(latest.status,'FAIL','setting the input value must reproduce the configured failure');
  assert.equal(latest.evidence.actual,'alice','input listeners must observe the assigned value before measurement');

  const negativeRevision=(await page.evaluate(()=>window.faultline.inspect())).revision;
  await page.evaluate(async expectedRevision=>window.faultline.defineOracle({
    expectedRevision,
    oracle:{kind:'dom_property',selector:'#status',property:'textContent',equals:'alice',action:{kind:'set_value',selector:'#not-control',value:'alice'},delayMs:0}
  }),negativeRevision);
  const negative=await page.evaluate(()=>window.faultline.run());
  assert.equal(negative.status,'UNRESOLVED','set_value on a non-value target must not produce ordinary PASS/FAIL evidence');
  assert.equal(negative.evidence.reason,'ACTION_TARGET_NOT_VALUE_CONTROL','unsupported set_value targets must fail with stable machine-readable evidence');

  console.log('Oracle set_value action PASS: human and WebMCP surfaces deterministically drive form input events and reject unsupported targets.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
