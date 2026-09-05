import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4178;
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
  state=await page.evaluate(({revision})=>window.faultline.applySource({expectedRevision:revision,targetAxis:'js',source:''}),{revision:state.revision});
  state=await page.evaluate(({revision})=>window.faultline.applySource({expectedRevision:revision,targetAxis:'css',source:"body{display:block}</style><script id='css-breakout'>document.body.dataset.cssBreakout='executed'</script><style>main{display:block}"}),{revision:state.revision});
  state=await page.evaluate(({revision})=>window.faultline.defineOracle({expectedRevision:revision,oracle:{kind:'dom_exists',selector:'#css-breakout',equals:false,action:{kind:'none'},delayMs:0}}),{revision:state.revision});

  const result=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:state.revision});
  assert.equal(result.status,'FAIL','CSS source containing </style> must remain CSS data and must not create executable DOM');
  assert.equal(result.evidence.actual,false,'CSS boundary escape must not create the injected script element');
  console.log('CSS sandbox-boundary gate PASS: literal </style> remains inside the style element and cannot become executable HTML.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
