import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4200;
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
  assert.ok(actionSchema.properties.kind.enum.includes('sequence'),'WebMCP must advertise bounded multi-step oracle actions');
  assert.equal(actionSchema.properties.steps?.type,'array','sequence actions must expose a structured steps array');
  assert.equal(actionSchema.properties.steps?.maxItems,8,'sequence actions must be bounded to a deterministic maximum');

  const start=await page.evaluate(()=>window.faultline.inspect());
  const loaded=await page.evaluate(async expectedRevision=>window.faultline.loadCase({
    expectedRevision,
    case:{
      html:'<label>Name <input id="name"></label><button id="submit" type="button">Submit</button><div id="status">idle</div>',
      css:'',
      js:"let latest='';document.querySelector('#name').addEventListener('input',event=>{latest=event.currentTarget.value});document.querySelector('#submit').addEventListener('click',()=>{document.querySelector('#status').textContent='submitted:'+latest});",
      oracle:{kind:'dom_property',selector:'#status',property:'textContent',equals:'submitted:alice',action:{kind:'sequence',steps:[{kind:'set_value',selector:'#name',value:'alice'},{kind:'click',selector:'#submit'}]},delayMs:0}
    }
  }),start.revision);
  assert.equal(loaded.case.oracle.action.steps.length,2,'canonical case must retain every sequence step');

  const result=await page.evaluate(()=>window.faultline.run());
  assert.equal(result.status,'FAIL','set_value followed by click must reproduce the locked failure');
  assert.equal(result.evidence.actual,'submitted:alice','sequence steps must execute in declared order before measurement');

  await page.selectOption('#action-kind','sequence');
  const sequenceEditor=page.locator('#action-sequence');
  await sequenceEditor.fill('[{"kind":"set_value","selector":"#name","value":"bob"},{"kind":"click","selector":"#submit"}]');
  await page.click('#lock');
  await page.waitForFunction(revision=>window.faultline.inspect().revision!==revision,loaded.revision);
  const humanLocked=await page.evaluate(()=>window.faultline.inspect());
  assert.deepEqual(humanLocked.case.oracle.action,{kind:'sequence',steps:[{kind:'set_value',selector:'#name',value:'bob'},{kind:'click',selector:'#submit'}]},'human oracle UI must persist a structured action sequence');

  const invalidRevision=humanLocked.revision;
  const invalid=await page.evaluate(async expectedRevision=>{
    try{
      await window.faultline.defineOracle({expectedRevision,oracle:{kind:'dom_property',selector:'#status',property:'textContent',equals:'submitted:bob',action:{kind:'sequence',steps:[]},delayMs:0}});
      return null;
    }catch(error){return String(error?.message||error)}
  },invalidRevision);
  assert.equal(invalid,'INVALID_ORACLE','empty action sequences must be rejected deterministically');

  console.log('Oracle action sequence PASS: WebMCP and human surfaces execute bounded multi-step interactions in declared order.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
