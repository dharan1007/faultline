import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';

import {startCoordinatorServer} from '../apps/coordinator/server.mjs';

function listen(server,host='127.0.0.1'){
  return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,host,()=>resolve(server.address()));});
}
function close(server){return new Promise(resolve=>server.close(()=>resolve()));}
function requestJson(url,{method='GET',body,headers={}}={}){
  return fetch(url,{method,headers:{...(body?{'content-type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined}).then(async response=>({status:response.status,body:await response.json()}));
}
async function poll(base,operationId){
  const deadline=Date.now()+12000;
  while(Date.now()<deadline){
    const response=await requestJson(`${base}/operations/${operationId}`);
    if(['COMPLETED','FAILED','CANCELLED'].includes(response.body.status))return response.body;
    await new Promise(resolve=>setTimeout(resolve,40));
  }
  throw new Error(`operation ${operationId} did not settle`);
}

let secretHits=0;
const target=http.createServer((req,res)=>{
  if(req.url==='/api/data'){
    res.setHeader('content-type','application/json');
    res.setHeader('set-cookie','session=server-secret; HttpOnly');
    return res.end(JSON.stringify({status:'ready'}));
  }
  if(req.url==='/private-redirect'){
    const port=target.address().port;
    res.statusCode=302;
    res.setHeader('location',`http://blocked.faultline.test:${port}/secret`);
    return res.end('redirecting');
  }
  if(req.url==='/secret'){
    secretHits+=1;
    return res.end('must never be reached');
  }
  if(req.url==='/slow'){
    return setTimeout(()=>{res.setHeader('content-type','text/html');res.end('<!doctype html><title>slow</title><h1>slow</h1>');},5000);
  }
  res.setHeader('content-type','text/html; charset=utf-8');
  res.end(`<!doctype html><html><head><title>Runtime Capture Fixture</title></head><body>
    <main><h1>Operations runtime</h1><div id="hydrated">booting</div><input name="password" type="password" autocomplete="current-password" value="browser-secret"></main>
    <script>
      console.log('capture-boot');
      setTimeout(async()=>{
        const response=await fetch('/api/data',{headers:{Authorization:'Bearer request-secret','X-Trace':'trace-ok'}});
        const data=await response.json();
        document.querySelector('#hydrated').textContent='hydrated:'+data.status;
        history.pushState({},'', '/runtime/captured?token=route-secret#done');
        console.log('capture-ready');
      },60);
    </script>
  </body></html>`);
});

const targetAddress=await listen(target);
const targetPort=targetAddress.port;
const resolver=async hostname=>{
  if(hostname==='capture.faultline.test')return [{address:'93.184.216.34',family:4}];
  if(hostname==='blocked.faultline.test')return [{address:'127.0.0.1',family:4}];
  return [{address:'93.184.216.34',family:4}];
};
const connector=({port})=>net.connect({host:'127.0.0.1',port});
const coordinator=await startCoordinatorServer({port:0,resolver,connector});
const base=`http://127.0.0.1:${coordinator.address.port}`;

try{
  const health=await requestJson(`${base}/health`);
  assert.equal(health.status,200);
  assert.equal(health.body.status,'ok');
  assert.equal(health.body.bind,'127.0.0.1');
  assert.equal(coordinator.address.address,'127.0.0.1','coordinator must bind loopback by default');

  const rebindingProbe=await new Promise((resolve,reject)=>{
    const request=http.request({host:'127.0.0.1',port:coordinator.address.port,path:'/health',headers:{Host:'attacker.example'}},response=>{
      let text='';response.on('data',chunk=>text+=chunk);response.on('end',()=>resolve({status:response.statusCode,text}));
    });
    request.on('error',reject);request.end();
  });
  assert.equal(rebindingProbe.status,421,'host-header DNS rebinding against the local coordinator must be refused');

  const created=await requestJson(`${base}/investigations`,{method:'POST',body:{targetUrl:`http://capture.faultline.test:${targetPort}/`}});
  assert.equal(created.status,201);
  assert.equal(created.body.investigation.target.mode,'public_url');
  assert.equal(created.body.investigation.revision,'r1');

  const capture=await requestJson(`${base}/captures`,{method:'POST',body:{investigationId:created.body.investigation.id}});
  assert.equal(capture.status,202);
  const operation=await poll(base,capture.body.operationId);
  assert.equal(operation.status,'COMPLETED',JSON.stringify(operation.error||{}));
  const investigation=operation.result.investigation;
  assert.equal(investigation.capture.status,'CAPTURED');
  assert.equal(investigation.revision,'r2');
  assert.ok(investigation.capture.documentSnapshots.length>=1);
  assert.equal(investigation.capture.documentSnapshots[0].title,'Runtime Capture Fixture');
  assert.equal(investigation.capture.documentSnapshots[0].hydratedText,'hydrated:ready');
  assert.ok(!JSON.stringify(investigation).includes('browser-secret'),'password/autofill values must never enter capture evidence');
  assert.ok(investigation.capture.consoleEvents.some(event=>event.text.includes('capture-ready')),'hydrated console event must be captured');
  assert.ok(investigation.capture.networkEvents.some(event=>event.phase==='request'&&event.url.includes('/api/data')),'runtime fetch request must be captured');
  const apiRequest=investigation.capture.networkEvents.find(event=>event.phase==='request'&&event.url.includes('/api/data'));
  assert.equal(apiRequest.headers.authorization,'[REDACTED]');
  assert.equal(apiRequest.headers['x-trace'],'trace-ok');
  const apiResponse=investigation.capture.networkEvents.find(event=>event.phase==='response'&&event.url.includes('/api/data'));
  assert.equal(apiResponse.headers['set-cookie'],'[REDACTED]');
  assert.ok(investigation.capture.navigationEvents.some(event=>event.url.includes('/runtime/captured')),'same-document route transition must be captured');
  assert.ok(!JSON.stringify(investigation.capture.navigationEvents).includes('route-secret'),'sensitive route query values must be redacted');
  assert.ok(investigation.capture.resources.some(resource=>resource.url.includes('/api/data')),'resource timing must record hydrated fetches');
  assert.ok(investigation.capture.screenshots[0].bytes>0);
  assert.match(investigation.capture.screenshots[0].sha256,/^[a-f0-9]{64}$/);
  assert.ok(investigation.environment.userAgent);
  assert.equal(investigation.capture.redactionSummary.redacted,true);

  const redirectInvestigation=await requestJson(`${base}/investigations`,{method:'POST',body:{targetUrl:`http://capture.faultline.test:${targetPort}/private-redirect`}});
  const redirectCapture=await requestJson(`${base}/captures`,{method:'POST',body:{investigationId:redirectInvestigation.body.investigation.id}});
  const redirectOperation=await poll(base,redirectCapture.body.operationId);
  assert.equal(redirectOperation.status,'FAILED');
  assert.equal(redirectOperation.error.code,'PRIVATE_ADDRESS_BLOCKED');
  assert.equal(secretHits,0,'browser proxy must refuse the private redirect before the target is connected');

  const limitedInvestigation=await requestJson(`${base}/investigations`,{method:'POST',body:{targetUrl:`http://capture.faultline.test:${targetPort}/`}});
  const limitedCapture=await requestJson(`${base}/captures`,{method:'POST',body:{investigationId:limitedInvestigation.body.investigation.id,limits:{maxEvents:2}}});
  const limitedOperation=await poll(base,limitedCapture.body.operationId);
  assert.equal(limitedOperation.status,'FAILED');
  assert.equal(limitedOperation.error.code,'CAPTURE_LIMIT_REACHED','capture overflow must fail explicitly instead of silently dropping evidence');

  const slowInvestigation=await requestJson(`${base}/investigations`,{method:'POST',body:{targetUrl:`http://capture.faultline.test:${targetPort}/slow`}});
  const slowCapture=await requestJson(`${base}/captures`,{method:'POST',body:{investigationId:slowInvestigation.body.investigation.id}});
  const cancelled=await requestJson(`${base}/operations/${slowCapture.body.operationId}/cancel`,{method:'POST',body:{}});
  assert.equal(cancelled.status,202);
  const cancelledOperation=await poll(base,slowCapture.body.operationId);
  assert.equal(cancelledOperation.status,'CANCELLED');

  console.log('Coordinator capture PASS: real Chromium capture is hydrated, redacted, loopback-bound, proxy-pinned, redirect-safe, bounded, and cancellable.');
} finally {
  await coordinator.close();
  await close(target);
}
