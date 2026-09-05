import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4180;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  let state=await page.evaluate(()=>window.faultline.inspect());
  state=await page.evaluate(({revision})=>window.faultline.applySource({expectedRevision:revision,targetAxis:'html',source:'<main id="payload">safe</main>'}),{revision:state.revision});
  state=await page.evaluate(({revision})=>window.faultline.applySource({expectedRevision:revision,targetAxis:'js',source:"document.body.dataset.canonicalJs='executed';"}),{revision:state.revision});
  state=await page.evaluate(({revision})=>window.faultline.applySource({expectedRevision:revision,targetAxis:'css',source:"body{display:block}</style><script id='css-export-breakout'>document.body.dataset.cssExportBreakout='executed'</script><style>main{display:block}"}),{revision:state.revision});

  const exported=await page.evaluate(()=>window.faultline.exportCase());
  const reproducer=await browser.newPage();
  await reproducer.setContent(exported,{waitUntil:'load'});

  assert.equal(await reproducer.locator('#payload').count(),1,'export must preserve canonical HTML');
  assert.equal(await reproducer.evaluate(()=>document.body.dataset.canonicalJs),'executed','export must preserve canonical JavaScript execution');
  assert.equal(await reproducer.locator('#css-export-breakout').count(),0,'CSS source containing </style> must remain stylesheet text in the exported reproducer');
  assert.equal(await reproducer.evaluate(()=>document.body.dataset.cssExportBreakout),undefined,'CSS source must not escape into executable exported HTML');
  console.log('Export CSS-boundary gate PASS: exported reproducers preserve CSS as stylesheet data and cannot reinterpret </style> as executable HTML.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
