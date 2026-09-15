import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {chromium} from 'playwright';

const port=4187;
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');const root=process.cwd();http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);if(!f.startsWith(root)){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`],{stdio:'inherit'});
await new Promise(resolve=>setTimeout(resolve,700));

const cases=[
  {
    id:'dom-exists-html',
    axis:'html',
    maxTrials:100,
    case:{
      html:'<main><section id="noise-a"><p>alpha</p><p>beta</p></section><div id="fault">locked</div><aside id="noise-b"><span>gamma</span></aside><footer id="noise-c">delta</footer></main>',
      css:'#noise-a{color:blue}#noise-b{margin:2px}#noise-c{padding:3px}',
      js:'',
      oracle:{kind:'dom_exists',selector:'#fault',equals:true,action:{kind:'none'},delayMs:0}
    }
  },
  {
    id:'computed-style-css',
    axis:'css',
    maxTrials:100,
    case:{
      html:'<main><div id="fault">locked</div><div class="noise">noise</div></main>',
      css:'.noise{padding:13px}.noise{margin:9px}body{background:white}.unused{border:1px solid black}#fault{display:none}.another-unused{color:green}',
      js:'',
      oracle:{kind:'computed_style',selector:'#fault',property:'display',equals:'none',action:{kind:'none'},delayMs:0}
    }
  },
  {
    id:'click-attribute-js',
    axis:'js',
    maxTrials:120,
    case:{
      html:'<button id="trigger">Trigger</button><div id="state"></div><p id="noise">noise</p>',
      css:'#noise{color:gray}',
      js:"const unusedA=1;\nconst unusedB=2;\nfunction unusedFn(){return 3;}\ndocument.querySelector('#trigger').addEventListener('click',()=>{document.querySelector('#state').setAttribute('data-bad','1');});\nconst unusedC=4;",
      oracle:{kind:'dom_attribute',selector:'#state',property:'data-bad',equals:'1',action:{kind:'click',selector:'#trigger'},delayMs:0}
    }
  },
  {
    id:'async-property-js',
    axis:'js',
    maxTrials:120,
    case:{
      html:'<button id="trigger">Trigger</button><div id="state">ok</div>',
      css:'body{font-family:sans-serif}.unused{opacity:.5}',
      js:"const beforeNoise='a';\nconst moreNoise='b';\ndocument.querySelector('#trigger').addEventListener('click',()=>{setTimeout(()=>{document.querySelector('#state').textContent='bad';},10);});\nconst afterNoise='c';",
      oracle:{kind:'dom_property',selector:'#state',property:'textContent',equals:'bad',action:{kind:'click',selector:'#trigger'},delayMs:35}
    }
  }
];

const bytes=value=>Buffer.byteLength(String(value),'utf8');
let browser;
const metrics=[];
try{
  browser=await chromium.launch({headless:true});
  for(const fixture of cases){
    const context=await browser.newContext();
    const page=await context.newPage();
    const pageErrors=[];
    page.on('pageerror',error=>pageErrors.push(String(error)));
    const response=await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
    assert.equal(response.status(),200,`${fixture.id}: workbench failed to load`);
    await page.waitForFunction(()=>Boolean(window.faultline));

    const loaded=await page.evaluate(async candidate=>{
      const current=window.faultline.inspect();
      return window.faultline.loadCase({expectedRevision:current.revision,case:candidate});
    },fixture.case);
    const baseline=await page.evaluate(rev=>window.faultline.run({expectedRevision:rev}),loaded.revision);
    assert.equal(baseline.status,'FAIL',`${fixture.id}: baseline must independently reproduce FAIL`);

    const originalSource=loaded.case[fixture.axis];
    const originalUnits=await page.evaluate(axis=>window.faultline.units({targetAxis:axis}).units.length,fixture.axis);
    assert.ok(originalUnits>=1,`${fixture.id}: expected at least one semantic unit`);

    const started=performance.now();
    const reduction=await page.evaluate(({revision,axis,maxTrials})=>window.faultline.reduce({expectedRevision:revision,targetAxis:axis,maxTrials}),{revision:loaded.revision,axis:fixture.axis,maxTrials:fixture.maxTrials});
    const elapsedMs=performance.now()-started;
    assert.equal(reduction.status,'FAIL',`${fixture.id}: reduction must preserve the failure`);

    const after=await page.evaluate(()=>window.faultline.inspect());
    const verified=await page.evaluate(rev=>window.faultline.run({expectedRevision:rev}),after.revision);
    assert.equal(verified.status,'FAIL',`${fixture.id}: final candidate must re-verify FAIL`);
    const reducedSource=after.case[fixture.axis];
    const reducedUnits=await page.evaluate(axis=>window.faultline.units({targetAxis:axis}).units.length,fixture.axis);
    const originalBytes=bytes(originalSource);
    const reducedBytes=bytes(reducedSource);
    assert.ok(reducedBytes<originalBytes,`${fixture.id}: reducer made no byte progress (${originalBytes} -> ${reducedBytes})`);
    assert.ok(elapsedMs<15000,`${fixture.id}: browser reduction exceeded 15s (${elapsedMs.toFixed(1)}ms)`);
    assert.equal(pageErrors.length,0,`${fixture.id}: workbench page errors: ${pageErrors.join('; ')}`);

    const item={
      benchmark:fixture.id,
      axis:fixture.axis,
      originalBytes,
      reducedBytes,
      reductionPercent:Number(((1-reducedBytes/originalBytes)*100).toFixed(2)),
      originalUnits,
      reducedUnits,
      wallClockMs:Number(elapsedMs.toFixed(2)),
      preservationStatus:verified.status
    };
    metrics.push(item);
    console.log(JSON.stringify(item));
    await context.close();
  }

  const totalOriginal=metrics.reduce((sum,item)=>sum+item.originalBytes,0);
  const totalReduced=metrics.reduce((sum,item)=>sum+item.reducedBytes,0);
  const aggregateReduction=(1-totalReduced/totalOriginal)*100;
  assert.ok(aggregateReduction>=30,`expected >=30% aggregate corpus reduction, got ${aggregateReduction.toFixed(2)}%`);
  assert.ok(metrics.every(item=>item.preservationStatus==='FAIL'),'every benchmark must preserve the exact failure classification');
  console.log(JSON.stringify({benchmark:'faultline-browser-corpus-v1',cases:metrics.length,totalOriginalBytes:totalOriginal,totalReducedBytes:totalReduced,aggregateReductionPercent:Number(aggregateReduction.toFixed(2)),preservationStatus:'FAIL'}));
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
