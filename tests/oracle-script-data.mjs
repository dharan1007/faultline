import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4175;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(r=>setTimeout(r,700));

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.faultline);

  let state=await page.evaluate(()=>window.faultline.inspect());
  state=await page.evaluate(({revision})=>window.faultline.applySource({expectedRevision:revision,targetAxis:'html',source:'<div id="payload"></div>'}),{revision:state.revision});
  state=await page.evaluate(({revision})=>window.faultline.applySource({expectedRevision:revision,targetAxis:'js',source:"document.querySelector('#payload').textContent='</script>';"}),{revision:state.revision});
  state=await page.evaluate(({revision})=>window.faultline.defineOracle({expectedRevision:revision,oracle:{kind:'dom_property',selector:'#payload',property:'textContent',equals:'</script>',action:{kind:'none'},delayMs:0}}),{revision:state.revision});

  const result=await page.evaluate(({revision})=>window.faultline.run({expectedRevision:revision}),{revision:state.revision});
  assert.equal(result.status,'FAIL','oracle data containing </script> must remain data and must not terminate the sandbox script');
  assert.equal(result.evidence.actual,'</script>');
  assert.equal(result.evidence.expected,'</script>');
  console.log('Oracle script-data gate PASS: literal </script> in oracle data is serialized safely and evaluated deterministically.');
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
