import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4203;
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
  assert.deepEqual(actionSchema.properties.kind.enum,['none','click','set_value','set_checked','sequence'],'WebMCP must advertise deterministic set_checked actions');
  assert.equal(actionSchema.properties.checked?.type,'boolean','WebMCP set_checked actions must advertise a boolean checked state');
  assert.deepEqual(actionSchema.properties.steps.items.properties.kind.enum,['click','set_value','set_checked','wait'],'action sequences must support deterministic set_checked steps');
  assert.equal(actionSchema.properties.steps.items.properties.checked?.type,'boolean','sequence set_checked steps must advertise a boolean checked state');

  const start=await page.evaluate(()=>window.faultline.inspect());
  const loaded=await page.evaluate(async expectedRevision=>window.faultline.loadCase({
    expectedRevision,
    case:{
      html:'<label><input id="agree" type="checkbox"> Agree</label><div id="status">declined</div><div id="not-checkable">plain</div>',
      css:'',
      js:"document.querySelector('#agree').addEventListener('change',event=>{document.querySelector('#status').textContent=event.currentTarget.checked?'accepted':'declined'});",
      oracle:{kind:'dom_property',selector:'#status',property:'textContent',equals:'accepted',action:{kind:'none'},delayMs:0}
    }
  }),start.revision);

  await page.selectOption('#action-kind','set_checked');
  await page.fill('#action-selector','#agree');
  await page.selectOption('#action-checked','true');
  await page.click('#lock');
  await page.waitForFunction(revision=>window.faultline.inspect().revision!==revision,loaded.revision);

  const locked=await page.evaluate(()=>window.faultline.inspect());
  assert.deepEqual(locked.case.oracle.action,{kind:'set_checked',selector:'#agree',checked:true},'human oracle UI must persist the complete set_checked action');

  await page.click('#run');
  await page.waitForFunction(()=>document.querySelector('#health')?.textContent==='FAIL');
  const latest=await page.evaluate(()=>window.faultline.history({limit:1})[0]);
  assert.equal(latest.status,'FAIL','setting checked=true must reproduce the configured failure');
  assert.equal(latest.evidence.actual,'accepted','change listeners must observe the assigned checked state before measurement');

  const negativeRevision=(await page.evaluate(()=>window.faultline.inspect())).revision;
  await page.evaluate(async expectedRevision=>window.faultline.defineOracle({
    expectedRevision,
    oracle:{kind:'dom_property',selector:'#status',property:'textContent',equals:'accepted',action:{kind:'set_checked',selector:'#not-checkable',checked:true},delayMs:0}
  }),negativeRevision);
  const negative=await page.evaluate(()=>window.faultline.run());
  assert.equal(negative.status,'UNRESOLVED','set_checked on a non-checkable target must not produce ordinary PASS/FAIL evidence');
  assert.equal(negative.evidence.reason,'ACTION_TARGET_NOT_CHECKABLE','unsupported set_checked targets must fail with stable machine-readable evidence');

  const radioRevision=(await page.evaluate(()=>window.faultline.inspect())).revision;
  await page.evaluate(async expectedRevision=>window.faultline.loadCase({
    expectedRevision,
    case:{
      html:'<input id="r1" type="radio" name="choice"><input id="r2" type="radio" name="choice" checked><div id="status">r2</div>',
      css:'',
      js:"document.querySelector('#r1').addEventListener('change',event=>{if(event.currentTarget.checked)document.querySelector('#status').textContent='r1'});",
      oracle:{kind:'dom_property',selector:'#status',property:'textContent',equals:'r1',action:{kind:'set_checked',selector:'#r1',checked:true},delayMs:0}
    }
  }),radioRevision);
  const radio=await page.evaluate(()=>window.faultline.run());
  assert.equal(radio.status,'FAIL','set_checked must support radio controls using native checked semantics');
  assert.equal(radio.evidence.actual,'r1','radio change listeners must observe deterministic checked state');

  console.log('Oracle set_checked action PASS: human and WebMCP surfaces deterministically drive checkbox/radio state and reject unsupported targets.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
