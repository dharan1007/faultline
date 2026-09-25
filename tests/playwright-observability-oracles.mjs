import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {runLiveTrial} from '../integrations/playwright-live/index.js';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:800,height:600}});

await page.route('https://app.test/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/status')return route.fulfill({status:503,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:'{"error":"LOCKED_STATUS"}'});
  if(url.pathname==='/body')return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:'{"state":"LOCKED_BODY"}'});
  if(url.pathname==='/first')return route.fulfill({status:201,headers:{'access-control-allow-origin':'*'},body:'first'});
  if(url.pathname==='/second')return route.fulfill({status:409,headers:{'access-control-allow-origin':'*'},body:'second'});
  return route.fulfill({status:404,headers:{'access-control-allow-origin':'*'},body:'missing'});
});

try{
  const consoleFailure=await runLiveTrial({
    page,
    reset:async()=>page.setContent('<button id="go">Go</button><script>go.onclick=()=>console.error("LOCKED_CONSOLE")</script>'),
    recipe:[{kind:'click',selector:'#go'}],
    oracle:{kind:'console_event',level:'error',pattern:'LOCKED_CONSOLE'},
    provenance:{resetId:'console-fixture'}
  });
  assert.equal(consoleFailure.status,'FAIL');
  assert.match(consoleFailure.evidence.console,/LOCKED_CONSOLE/);

  const statusFailure=await runLiveTrial({
    page,
    reset:async()=>page.setContent('<button id="go">Go</button><script>go.onclick=()=>fetch("https://app.test/status")</script>'),
    recipe:[{kind:'click',selector:'#go'},{kind:'sequence',steps:[{kind:'wait',durationMs:30}]}],
    oracle:{kind:'network_status',url:'https://app.test/status',method:'GET',status:503},
    provenance:{resetId:'network-status-fixture'}
  });
  assert.equal(statusFailure.status,'FAIL');
  assert.equal(statusFailure.evidence.networkSequence[0].status,503);

  const bodyFailure=await runLiveTrial({
    page,
    reset:async()=>page.setContent('<button id="go">Go</button><script>go.onclick=()=>fetch("https://app.test/body")</script>'),
    recipe:[{kind:'click',selector:'#go'},{kind:'sequence',steps:[{kind:'wait',durationMs:30}]}],
    oracle:{kind:'network_body',url:'https://app.test/body',method:'GET',bodyPattern:'LOCKED_BODY'},
    provenance:{resetId:'network-body-fixture'}
  });
  assert.equal(bodyFailure.status,'FAIL');
  assert.match(bodyFailure.evidence.requestResponse.body,/LOCKED_BODY/);

  const sequenceFailure=await runLiveTrial({
    page,
    reset:async()=>page.setContent('<button id="go">Go</button><script>go.onclick=async()=>{await fetch("https://app.test/first");await fetch("https://app.test/second")}</script>'),
    recipe:[{kind:'click',selector:'#go'},{kind:'sequence',steps:[{kind:'wait',durationMs:50}]}],
    oracle:{kind:'network_sequence',sequence:[
      {url:'https://app.test/first',method:'GET',status:201},
      {url:'https://app.test/second',method:'GET',status:409}
    ]},
    provenance:{resetId:'network-sequence-fixture'}
  });
  assert.equal(sequenceFailure.status,'FAIL');
  assert.deepEqual(sequenceFailure.evidence.networkSequence.map(item=>item.status),[201,409]);

  const raceFailure=await runLiveTrial({
    page,
    reset:async()=>page.setContent('<button id="go">Go</button><script>go.onclick=()=>{performance.clearMarks();performance.mark("request");setTimeout(()=>performance.mark("commit"),5)}</script>'),
    recipe:[{kind:'click',selector:'#go'}],
    oracle:{kind:'race_timing',relation:{firstMark:'request',secondMark:'commit',operator:'before',maxDeltaMs:100},delayMs:25},
    provenance:{resetId:'race-fixture'}
  });
  assert.equal(raceFailure.status,'FAIL');
  assert.match(raceFailure.evidence.timingRelation,/request:before:commit/);

  const perfFailure=await runLiveTrial({
    page,
    reset:async()=>page.setContent('<button id="go">Go</button>'),
    recipe:[{kind:'click',selector:'#go'}],
    oracle:{kind:'performance_threshold',metric:'trial_duration',budgetMs:0,comparator:'gt'},
    provenance:{resetId:'performance-fixture'}
  });
  assert.equal(perfFailure.status,'FAIL');
  assert.equal(perfFailure.evidence.statePredicate.failed,true);

  console.log(JSON.stringify({
    console:consoleFailure.status,
    networkStatus:statusFailure.status,
    networkBody:bodyFailure.status,
    networkSequence:sequenceFailure.status,
    raceTiming:raceFailure.status,
    performance:perfFailure.status
  }));
}finally{
  await page.unroute('https://app.test/**');
  await browser.close();
}
