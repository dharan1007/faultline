import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port = 4194;
const server = spawn(process.execPath, ['-e', `
const http=require('http'),fs=require('fs'),path=require('path');
const root=process.cwd();
http.createServer((req,res)=>{
  let pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(pathname==='/') pathname='/index.html';
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep) && file!==path.join(root,'index.html')) {res.statusCode=403;return res.end('forbidden')}
  fs.readFile(file,(error,body)=>{
    if(error){res.statusCode=404;return res.end('not found')}
    if(file.endsWith('.js'))res.setHeader('content-type','application/javascript');
    if(file.endsWith('.css'))res.setHeader('content-type','text/css');
    if(file.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');
    res.end(body);
  });
}).listen(${port},'127.0.0.1');
`], { stdio: 'inherit' });

await new Promise(resolve=>setTimeout(resolve,700));
let browser;
try {
  browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  await page.addInitScript(()=>{
    const tools=[];
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>tools.push(tool)}});
    window.__webmcpTools=tools;
  });

  for (const route of ['/', '/workbench.html', '/evidence.html', '/connect.html']) {
    const response = await page.goto(`http://127.0.0.1:${port}${route}`, {waitUntil:'networkidle'});
    assert.equal(response?.status(),200,`${route} must return HTTP 200`);
    assert.equal(await page.locator('main').count(),1,`${route} must expose exactly one main landmark`);
    assert.equal(await page.locator('h1').count(),1,`${route} must expose exactly one h1`);
    assert.equal(await page.locator('a[href="#main"]').count(),1,`${route} must expose a skip link`);
    const nav=page.locator('nav[aria-label="Product navigation"]');
    assert.equal(await nav.count(),1,`${route} must expose shared product navigation`);
    const hrefs=await nav.locator('a').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')));
    for(const required of ['index.html','workbench.html','evidence.html','connect.html']){
      assert(hrefs.some(href=>href?.endsWith(required)),`${route} navigation must link ${required}`);
    }
    assert.equal(await page.locator('link[href="./src/ui.css"]').count(),1,`${route} must load shared UI stylesheet`);
  }

  const shellResponse=await page.request.get(`http://127.0.0.1:${port}/src/ui-shell.js`);
  assert.equal(shellResponse.status(),200,'shared UI shell module must ship');
  const cssResponse=await page.request.get(`http://127.0.0.1:${port}/src/ui.css`);
  assert.equal(cssResponse.status(),200,'shared UI stylesheet must ship');

  console.log('Product surfaces PASS: Start, Workbench, Evidence, and Connect share one accessible product shell.');
} finally {
  if(browser) await browser.close();
  server.kill('SIGTERM');
}
