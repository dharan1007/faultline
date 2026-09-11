import {chromium,firefox,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const port=4187;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');const root=process.cwd();http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.resolve(root,'.'+p);if(!f.startsWith(root)){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(resolve=>setTimeout(resolve,700));

const families=[['chromium',chromium],['firefox',firefox],['webkit',webkit]];
const results=[];
try{
  for(const [name,type] of families){
    const browser=await type.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1280,height:900}});
      const pageErrors=[];
      const requests=[];
      page.on('pageerror',error=>pageErrors.push(String(error)));
      page.on('request',request=>requests.push(request.url()));
      await page.addInitScript(()=>{
        const tools=[];
        Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>{if(!tool?.name||typeof tool.execute!=='function')throw new TypeError('invalid WebMCP tool');tools.push(tool);}}});
        window.__crossBrowserTools=tools;
      });
      const response=await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
      assert.equal(response.status(),200,`${name} failed to load FAULTLINE`);
      await page.waitForFunction(()=>window.faultline&&window.__crossBrowserTools?.length===17);
      const initial=await page.evaluate(()=>window.faultline.inspect());
      const baseline=await page.evaluate(expectedRevision=>window.faultline.run({expectedRevision}),initial.revision);
      assert.equal(baseline.status,'FAIL',`${name} did not preserve baseline failure`);

      const beforeContainment=await page.evaluate(()=>window.faultline.inspect());
      const changed=await page.evaluate(({expectedRevision,source})=>window.faultline.applySource({expectedRevision,targetAxis:'js',source}),{expectedRevision:beforeContainment.revision,source:"fetch('/__faultline_cross_browser_escape__').catch(()=>{});"});
      const contained=await page.evaluate(expectedRevision=>window.faultline.run({expectedRevision}),changed.revision);
      assert.equal(contained.status,'UNRESOLVED',`${name} network attempt should not execute`);
      assert.equal(contained.evidence?.reason,'UNSAFE_NETWORK',`${name} did not classify network containment`);
      await page.waitForTimeout(100);
      assert.equal(requests.some(url=>url.includes('__faultline_cross_browser_escape__')),false,`${name} candidate escaped network containment`);
      assert.equal(pageErrors.length,0,`${name} page errors:\n${pageErrors.join('\n')}`);
      results.push({browser:name,webmcpTools:17,baseline:'FAIL',networkContainment:'UNSAFE_NETWORK'});
    }finally{await browser.close();}
  }
  console.log(`Cross-browser production gate PASS: ${JSON.stringify(results)}`);
}finally{
  server.kill('SIGTERM');
}
