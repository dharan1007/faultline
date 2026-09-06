import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4194;
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
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.some(tool=>tool.name==='faultline_units'));

  const result=await page.evaluate(async()=>{
    const before=window.faultline.inspect();
    const listed=window.faultline.units({targetAxis:'html'});
    const unitsTool=window.__webmcpTools.find(tool=>tool.name==='faultline_units');
    const toolListed=JSON.parse(await unitsTool.execute({targetAxis:'html'}));
    const probeTool=window.__webmcpTools.find(tool=>tool.name==='faultline_probe');
    const candidate=toolListed.units.find(unit=>!unit.pinned);
    const probe=JSON.parse(await probeTool.execute({expectedRevision:before.revision,targetAxis:'html',unitId:candidate.id}));
    const after=window.faultline.inspect();
    return {before,listed,toolListed,probe,after,manifest:window.faultline.manifest()};
  });

  assert.equal(result.listed.revision,result.before.revision,'unit discovery must be tied to the canonical revision it describes');
  assert.equal(result.listed.targetAxis,'html');
  assert.ok(result.listed.units.length>0,'unit discovery must return actionable semantic units');
  for(const unit of result.listed.units){
    assert.equal(typeof unit.id,'string');
    assert.ok(unit.id.length>0,'unit id must be non-empty');
    assert.equal(typeof unit.kind,'string');
    assert.equal(typeof unit.text,'string');
    assert.equal(typeof unit.pinned,'boolean');
  }
  assert.deepEqual(result.toolListed,result.listed,'browser API and WebMCP unit discovery must describe the same canonical units');
  assert.ok(['PASS','FAIL','UNRESOLVED'].includes(result.probe.status),'a discovered unit id must be immediately usable by faultline_probe');
  assert.equal(result.probe.mutated,false,'probe from a discovered unit must stay non-mutating');
  assert.equal(result.after.revision,result.before.revision,'unit discovery and probe must not advance canonical revision');
  assert.deepEqual(result.after.case,result.before.case,'unit discovery and probe must not change canonical source');

  const manifestEntry=result.manifest.find(entry=>entry.name==='faultline_units');
  assert.ok(manifestEntry,'manifest must advertise faultline_units');
  assert.equal(manifestEntry.readOnly,true,'unit discovery must be declared read-only');
  assert.equal(manifestEntry.annotations.untrustedContentHint,true,'unit text can contain candidate-controlled content');
  assert.deepEqual(manifestEntry.inputSchema.required,['targetAxis']);

  console.log('WebMCP unit discovery PASS: agents can enumerate canonical semantic unit IDs and use them directly with probe without mutating state.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
