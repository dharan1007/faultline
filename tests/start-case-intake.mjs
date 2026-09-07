import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4195;
const server=spawn(process.execPath,['-e',`
const http=require('http'),fs=require('fs'),path=require('path');const root=process.cwd();
http.createServer((req,res)=>{let pathname=new URL(req.url,'http://127.0.0.1').pathname;if(pathname==='/')pathname='/index.html';const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)&&file!==path.join(root,'index.html')){res.statusCode=403;return res.end('forbidden')}fs.readFile(file,(error,body)=>{if(error){res.statusCode=404;return res.end('not found')}if(file.endsWith('.js'))res.setHeader('content-type','application/javascript');if(file.endsWith('.css'))res.setHeader('content-type','text/css');if(file.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(body)})}).listen(${port},'127.0.0.1');
`],{stdio:'inherit'});
await new Promise(resolve=>setTimeout(resolve,700));

const validCase={
  html:'<main id="case-root"><button id="trigger">Trigger</button></main>',
  css:'#case-root{display:block} .noise{color:gray}',
  js:"document.querySelector('#trigger')?.addEventListener('click',()=>{});",
  oracle:{kind:'dom_exists',selector:'#case-root',equals:true,action:{kind:'none'},delayMs:0}
};

let browser;
try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext();
  const page=await context.newPage();
  await page.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>tools.push(tool)}});
    window.__webmcpTools=tools;
  });
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));

  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline && document.querySelector('#import-json'));

  assert.equal(await page.locator('#case-file').getAttribute('accept'),'.json,.faultline.json,application/json','file picker must advertise portable FAULTLINE JSON input');
  for(const id of ['continue-session','choose-case-file','case-file','case-drop','case-json','import-json','load-example']){
    assert.equal(await page.locator(`#${id}`).count(),1,`${id} must exist on Start`);
  }

  await page.locator('details:has(#case-json) > summary').click();
  const beforeInvalid=await page.evaluate(()=>window.faultline.inspect().revision);
  await page.locator('#case-json').fill('{"html":"only-one-field"}');
  await page.locator('#import-json').click();
  await page.waitForFunction(()=>{const node=document.querySelector('[data-ui-error]');return node&&!node.hidden&&node.textContent.length>0;});
  assert.equal(await page.evaluate(()=>window.faultline.inspect().revision),beforeInvalid,'invalid case import must not mutate canonical revision');
  assert.match(await page.locator('[data-ui-error]').textContent(),/INVALID_CASE|INVALID/i,'invalid import must expose an accessible validation error');
  assert.equal(new URL(page.url()).pathname,'/','invalid import must stay on Start');

  const beforePaste=await page.evaluate(()=>window.faultline.inspect().revision);
  await page.locator('#case-json').fill(JSON.stringify(validCase));
  await Promise.all([
    page.waitForURL(url=>url.pathname.endsWith('/workbench.html')),
    page.locator('#import-json').click()
  ]);
  await page.waitForFunction(()=>window.faultline?.inspect().case?.html?.includes('case-root'));
  const pasted=await page.evaluate(()=>window.faultline.inspect());
  assert.notEqual(pasted.revision,beforePaste,'valid pasted case must advance revision exactly through canonical loadCase');
  assert.equal(pasted.case.html,validCase.html,'valid pasted case must survive same-origin navigation');

  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  const persisted=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(persisted.revision,pasted.revision,'Start must rehydrate the same canonical revision after returning from Workbench');
  assert.equal(await page.locator('[data-session-revision]').textContent(),persisted.revision,'session card must show the live canonical revision');

  const chooserPromise=page.waitForEvent('filechooser');
  await page.locator('#case-drop').focus();
  await page.keyboard.press('Enter');
  const chooser=await chooserPromise;
  assert(chooser,'keyboard activation of drop zone must open the same file picker');

  const fileCase={...validCase,html:'<section id="file-case">File case</section>',oracle:{kind:'dom_exists',selector:'#file-case',equals:true,action:{kind:'none'},delayMs:0}};
  await chooser.setFiles({name:'sample.faultline.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fileCase))});
  await page.waitForURL(url=>url.pathname.endsWith('/workbench.html'));
  const fileLoaded=await page.evaluate(()=>window.faultline.inspect());
  assert.equal(fileLoaded.case.html,fileCase.html,'keyboard file picker must load through atomic canonical intake');

  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  const beforeDrop=await page.evaluate(()=>window.faultline.inspect().revision);
  const droppedCase={...validCase,html:'<article id="dropped-case">Dropped</article>',oracle:{kind:'dom_exists',selector:'#dropped-case',equals:true,action:{kind:'none'},delayMs:0}};
  await page.evaluate(caseValue=>{
    const transfer=new DataTransfer();
    transfer.items.add(new File([JSON.stringify(caseValue)],'drop.faultline.json',{type:'application/json'}));
    document.querySelector('#case-drop').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
  },droppedCase);
  await page.waitForURL(url=>url.pathname.endsWith('/workbench.html'));
  const dropLoaded=await page.evaluate(()=>window.faultline.inspect());
  assert.notEqual(dropLoaded.revision,beforeDrop,'drop intake must advance canonical revision');
  assert.equal(dropLoaded.case.html,droppedCase.html,'drop intake must use the same canonical case contract');

  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  const beforeExample=await page.evaluate(()=>window.faultline.inspect().revision);
  await Promise.all([
    page.waitForURL(url=>url.pathname.endsWith('/workbench.html')),
    page.locator('#load-example').click()
  ]);
  const example=await page.evaluate(()=>window.faultline.inspect());
  assert.notEqual(example.revision,beforeExample,'verified example must be loaded as a recoverable canonical revision');
  assert.match(example.case.html,/modal|save/i,'verified example must use the built-in reproducible fixture');

  assert.deepEqual(errors,[],'Start intake and navigation must not emit page errors');
  console.log('Start intake PASS: paste, file picker, keyboard/drop intake, validation atomicity, persistence, and verified example are canonical and recoverable.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
