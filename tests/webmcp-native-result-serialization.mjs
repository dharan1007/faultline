import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4227;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.addInitScript(()=>{
    const tools=[];
    const modelContext={
      registerTool:async tool=>{tools.push(tool);},
      getTools:async()=>tools,
      executeTool:async(tool,inputObject={})=>{
        const controller=new AbortController();
        const value=await tool.execute(inputObject,{signal:controller.signal});
        return JSON.stringify(value);
      }
    };
    Object.defineProperty(document,'modelContext',{configurable:true,value:modelContext});
    window.__webmcpTools=tools;
  });
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline && window.__webmcpTools?.length>=16);

  const result=await page.evaluate(async()=>{
    const tools=await document.modelContext.getTools();
    const inspect=tools.find(tool=>tool.name==='faultline_inspect');
    const serialized=await document.modelContext.executeTool(inspect,{});
    return {serialized,parsed:JSON.parse(serialized)};
  });

  assert.equal(typeof result.parsed,'object','WebMCP executeTool must deserialize once to the tool result object, not to an inner JSON string');
  assert.equal(result.parsed.revision,'r1');
  assert.ok(result.parsed.case && typeof result.parsed.case.html==='string','native WebMCP result must preserve structured FAULTLINE output after the user agent performs its mandated serialization');

  console.log('WebMCP native result serialization PASS: registered callbacks return JavaScript values and rely on the user agent for the specification-mandated JSON serialization exactly once.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
