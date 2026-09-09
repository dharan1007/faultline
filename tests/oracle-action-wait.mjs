import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4201;
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
  const stepSchema=actionSchema.properties.steps.items;
  assert.ok(stepSchema.properties.kind.enum.includes('wait'),'WebMCP must advertise deterministic wait steps inside action sequences');
  assert.equal(stepSchema.properties.durationMs?.minimum,0,'wait steps must reject negative delays at the schema boundary');
  assert.equal(stepSchema.properties.durationMs?.maximum,2000,'wait steps must be bounded to two seconds per step');

  const start=await page.evaluate(()=>window.faultline.inspect());
  const loaded=await page.evaluate(async expectedRevision=>window.faultline.loadCase({
    expectedRevision,
    case:{
      html:'<label>Name <input id="name"></label><button id="submit" type="button">Submit</button><div id="status">idle</div>',
      css:'',
      js:"let latest='';document.querySelector('#name').addEventListener('input',event=>{const value=event.currentTarget.value;setTimeout(()=>{latest=value},120)});document.querySelector('#submit').addEventListener('click',()=>{document.querySelector('#status').textContent='submitted:'+latest});",
      oracle:{kind:'dom_property',selector:'#status',property:'textContent',equals:'submitted:alice',action:{kind:'sequence',steps:[{kind:'set_value',selector:'#name',value:'alice'},{kind:'wait',durationMs:160},{kind:'click',selector:'#submit'}]},delayMs:0}
    }
  }),start.revision);
  assert.deepEqual(loaded.case.oracle.action.steps,[{kind:'set_value',selector:'#name',value:'alice'},{kind:'wait',durationMs:160},{kind:'click',selector:'#submit'}],'canonical case must retain bounded wait steps without synthetic selectors');

  const result=await page.evaluate(()=>window.faultline.run());
  assert.equal(result.status,'FAIL','set_value → wait → click must reproduce a timer-dependent locked failure');
  assert.equal(result.evidence.actual,'submitted:alice','wait must occur between declared interactions, not after final measurement');

  await page.selectOption('#action-kind','sequence');
  const help=await page.locator('#action-sequence-help').textContent();
  assert.match(help,/wait/i,'human sequence editor must explain that wait steps are supported');
  await page.locator('#action-sequence').fill('[{"kind":"set_value","selector":"#name","value":"bob"},{"kind":"wait","durationMs":160},{"kind":"click","selector":"#submit"}]');
  await page.click('#lock');
  await page.waitForFunction(revision=>window.faultline.inspect().revision!==revision,loaded.revision);
  const humanLocked=await page.evaluate(()=>window.faultline.inspect());
  assert.deepEqual(humanLocked.case.oracle.action.steps,[{kind:'set_value',selector:'#name',value:'bob'},{kind:'wait',durationMs:160},{kind:'click',selector:'#submit'}],'human oracle UI must persist wait steps in canonical sequence order');

  const invalidRevision=humanLocked.revision;
  const invalid=await page.evaluate(async expectedRevision=>{
    try{
      await window.faultline.defineOracle({expectedRevision,oracle:{kind:'dom_property',selector:'#status',property:'textContent',equals:'submitted:bob',action:{kind:'sequence',steps:[{kind:'wait',durationMs:2001}]},delayMs:0}});
      return null;
    }catch(error){return String(error?.message||error)}
  },invalidRevision);
  assert.equal(invalid,'INVALID_ORACLE','wait steps above the deterministic ceiling must be rejected');

  console.log('Oracle wait action PASS: WebMCP and human sequence surfaces reproduce bounded timer-dependent interactions without unbounded sleeps.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
