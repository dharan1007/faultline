import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4204;
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

  const oracleSchema=await page.evaluate(()=>window.__webmcpTools.find(tool=>tool.name==='faultline_define_oracle').inputSchema.properties.oracle);
  assert.ok(oracleSchema.properties.kind.enum.includes('dom_attribute'),'WebMCP must advertise DOM attribute oracles');
  assert.ok(await page.locator('#oracle-kind option[value="dom_attribute"]').count(),'human oracle UI must expose DOM attribute measurement');

  const start=await page.evaluate(()=>window.faultline.inspect());
  const loaded=await page.evaluate(async expectedRevision=>window.faultline.loadCase({
    expectedRevision,
    case:{
      html:'<button id="toggle" aria-expanded="false" data-state="closed">Toggle</button>',
      css:'',
      js:"document.querySelector('#toggle').addEventListener('click',event=>{event.currentTarget.setAttribute('aria-expanded','true');event.currentTarget.setAttribute('data-state','open')});",
      oracle:{kind:'dom_property',selector:'#toggle',property:'textContent',equals:'Toggle',action:{kind:'none'},delayMs:0}
    }
  }),start.revision);

  await page.selectOption('#oracle-kind','dom_attribute');
  await page.fill('#oracle-selector','#toggle');
  await page.fill('#oracle-property','aria-expanded');
  await page.fill('#oracle-equals','true');
  await page.selectOption('#action-kind','click');
  await page.fill('#action-selector','#toggle');
  await page.click('#lock');
  await page.waitForFunction(revision=>window.faultline.inspect().revision!==revision,loaded.revision);

  const locked=await page.evaluate(()=>window.faultline.inspect());
  assert.deepEqual(locked.case.oracle,{kind:'dom_attribute',selector:'#toggle',property:'aria-expanded',equals:'true',action:{kind:'click',selector:'#toggle'},delayMs:0},'human UI must persist DOM attribute oracle values as attribute strings');

  const result=await page.evaluate(()=>window.faultline.run());
  assert.equal(result.status,'FAIL','DOM attribute oracle must preserve the configured failing state');
  assert.equal(result.evidence.actual,'true','DOM attribute oracle must measure getAttribute() after the action');
  assert.equal(result.evidence.expected,'true','DOM attribute expected values must use string semantics');
  assert.equal(result.evidence.kind,'dom_attribute');
  assert.equal(result.evidence.property,'aria-expanded');

  const missingRevision=(await page.evaluate(()=>window.faultline.inspect())).revision;
  await page.evaluate(async expectedRevision=>window.faultline.defineOracle({
    expectedRevision,
    oracle:{kind:'dom_attribute',selector:'#toggle',property:'aria-label',equals:null,action:{kind:'none'},delayMs:0}
  }),missingRevision);
  const missing=await page.evaluate(()=>window.faultline.run());
  assert.equal(missing.status,'FAIL','missing attributes must be distinguishable from empty-string attributes');
  assert.equal(missing.evidence.actual,null,'getAttribute() null semantics must be preserved');

  const invalidRevision=(await page.evaluate(()=>window.faultline.inspect())).revision;
  await assert.rejects(
    page.evaluate(async expectedRevision=>window.faultline.defineOracle({
      expectedRevision,
      oracle:{kind:'dom_attribute',selector:'#toggle',property:'aria-expanded',equals:true,action:{kind:'none'},delayMs:0}
    }),invalidRevision),
    /INVALID_ORACLE/,
    'DOM attribute oracles must reject non-string, non-null expected values'
  );

  console.log('Oracle dom_attribute PASS: human and WebMCP surfaces measure ARIA/data attributes with exact string-or-null semantics.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
