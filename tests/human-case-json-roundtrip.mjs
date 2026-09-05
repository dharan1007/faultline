import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4191;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900},acceptDownloads:true});
  await page.addInitScript(()=>{
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async()=>{}}});
  });
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  assert.equal(await page.locator('#export-case-json').count(),1,'human evidence workflow must expose one canonical case JSON export action');

  const before=await page.evaluate(()=>window.faultline.inspect());
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#export-case-json').click();
  const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),`faultline-case-${before.revision}.json`,'case export filename must identify the canonical revision');
  const stream=await download.createReadStream();
  const chunks=[];
  for await (const chunk of stream)chunks.push(chunk);
  const exported=JSON.parse(Buffer.concat(chunks).toString('utf8'));

  assert.deepEqual(exported,before.case,'downloaded case JSON must be exactly the canonical import-compatible case object');
  const afterExport=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(afterExport.revision,before.revision,'exporting case JSON must not mutate canonical revision');
  assert.deepEqual(afterExport.case,before.case,'exporting case JSON must not mutate canonical case state');

  const edited=await page.evaluate(()=>window.faultline.applySource({targetAxis:'html',source:'<main id="changed">changed</main>'}));
  assert.notEqual(edited.case.html,before.case.html,'fixture must diverge before roundtrip restore');

  await page.locator('#case-import > summary').click();
  await page.locator('#case-import-json').fill(JSON.stringify(exported,null,2));
  const revisionBeforeImport=(await page.evaluate(()=>window.faultline.inspect())).revision;
  await page.locator('#import-case').click();
  await page.waitForFunction(expected=>JSON.stringify(window.faultline.inspect().case)===expected,JSON.stringify(exported));
  const restored=await page.evaluate(()=>window.faultline.inspect());
  assert.deepEqual(restored.case,before.case,'downloaded case JSON must roundtrip through the human importer without loss');
  assert.equal(Number(restored.revision.slice(1)),Number(revisionBeforeImport.slice(1))+1,'roundtrip import must restore the complete case in one canonical revision');
  assert.equal(pageErrors.length,0,pageErrors.join('\n'));

  console.log('Human case JSON roundtrip PASS: canonical case exports without mutation and re-imports losslessly in one guarded revision.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
