import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import healthRoute from '../api/v1/health.js';
import inspectRoute from '../api/v1/projects/inspect.js';
import evaluateRoute from '../api/v1/failures/evaluate.js';

function request({method='GET',url='/',headers={},body=''}={}){
  const req=Readable.from(body?[Buffer.from(body)]:[]);
  req.method=method;req.url=url;req.headers={host:'faultline-webmcp.vercel.app',...headers};
  return req;
}
function response(){
  const headers=new Map();let body='';
  return {statusCode:200,setHeader:(k,v)=>headers.set(k.toLowerCase(),String(v)),end:value=>{body+=value??'';},get headers(){return headers;},get body(){return body;}};
}

async function call(handler,options){const req=request(options),res=response();await handler(req,res);return {res,json:JSON.parse(res.body||'{}')};}

test('Vercel health route adapts IncomingMessage/ServerResponse to the web handler',async()=>{
  const {res,json}=await call(healthRoute,{url:'/api/v1/health'});
  assert.equal(res.statusCode,200);assert.equal(json.ok,true);assert.equal(json.data.status,'healthy');
  assert.equal(res.headers.get('cache-control'),'no-store');
});

test('Vercel project inspect route preserves request body and origin',async()=>{
  const {res,json}=await call(inspectRoute,{method:'POST',url:'/api/v1/projects/inspect',headers:{origin:'https://faultline-webmcp.vercel.app','content-type':'application/json'},body:JSON.stringify({packageJson:{dependencies:{astro:'6.0.0'},scripts:{dev:'astro dev'}},files:['package.json','package-lock.json']})});
  assert.equal(res.statusCode,200);assert.equal(json.data.framework,'astro');assert.equal(res.headers.get('access-control-allow-origin'),'https://faultline-webmcp.vercel.app');
});

test('Vercel failure evaluator route executes no user source and returns normalized status',async()=>{
  const {res,json}=await call(evaluateRoute,{method:'POST',url:'/api/v1/failures/evaluate',headers:{'content-type':'application/json'},body:JSON.stringify({oracle:{kind:'url',equals:'https://example.com/ok'},observation:{actual:'https://example.com/ok'}})});
  assert.equal(res.statusCode,200);assert.equal(json.data.status,'FAIL');assert.equal(json.data.executed,false);
});
