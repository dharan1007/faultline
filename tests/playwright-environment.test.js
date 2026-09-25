import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureBrowserState,
  restoreBrowserState,
  armNetworkRecorder,
  PLAYWRIGHT_ENVIRONMENT_SCHEMA
} from '../integrations/playwright-environment/index.js';

function fakePage(){
  const listeners=new Map();
  const local=new Map([['token','secret-local'],['theme','dark']]);
  const session=new Map([['flow','checkout']]);
  const context={
    async cookies(){return [{name:'sid',value:'secret-cookie',domain:'app.test',path:'/',expires:-1,httpOnly:true,secure:true,sameSite:'Lax'}];},
    async addCookies(values){context.added=values;}
  };
  return {
    _url:'https://app.test/path?secret=1',
    url(){return this._url;},
    context(){return context;},
    async evaluate(fn,arg){
      if(typeof arg==='number')return {
        localStorage:[...local.entries()].slice(0,arg),
        sessionStorage:[...session.entries()].slice(0,arg)
      };
      if(arg?.local||arg?.session){
        for(const item of arg.local||[])local.set(item.key,item.value);
        for(const item of arg.session||[])session.set(item.key,item.value);
        return;
      }
      return fn(arg);
    },
    async goto(url){this._url=url;return {status:()=>200};},
    on(name,fn){listeners.set(name,fn);},
    off(name,fn){if(listeners.get(name)===fn)listeners.delete(name);},
    emit(name,value){listeners.get(name)?.(value);},
    _context:context,
    _local:local,
    _session:session
  };
}

test('browser-state capture redacts secret-bearing values by default',async()=>{
  const page=fakePage();
  const snapshot=await captureBrowserState({page});
  assert.equal(snapshot.schema,PLAYWRIGHT_ENVIRONMENT_SCHEMA);
  assert.equal(snapshot.url,'https://app.test/path');
  assert.equal(snapshot.cookies[0].value,null);
  assert.equal(snapshot.cookies[0].redacted,true);
  assert.ok(snapshot.localStorage.every(item=>item.redacted));
});

test('explicit replay-state capture can restore local caller-owned values',async()=>{
  const page=fakePage();
  const snapshot=await captureBrowserState({page,includeCookieValues:true,includeStorageValues:true,includeUrlQuery:true});
  page._local.clear();page._session.clear();
  const restored=await restoreBrowserState({page,snapshot});
  assert.equal(restored.restoredCookies,1);
  assert.equal(page._context.added[0].value,'secret-cookie');
  assert.equal(page._local.get('theme'),'dark');
  assert.equal(page._session.get('flow'),'checkout');
});

test('network recorder ignores disallowed origins and strips sensitive headers',async()=>{
  const page=fakePage();
  const recorder=armNetworkRecorder(page,{allowedOrigins:['https://app.test'],maxEntries:4});
  const request={
    method:()=> 'POST',
    url:()=> 'https://app.test/api/save',
    postDataBuffer:()=>Buffer.from('{"x":1}'),
    async allHeaders(){return {authorization:'Bearer secret','content-type':'application/json'};}
  };
  const response={
    request:()=>request,
    status:()=>500,
    async allHeaders(){return {'set-cookie':'sid=secret','content-type':'application/json'};}
  };
  page.emit('response',response);
  const fixtures=await recorder.stop();
  assert.equal(fixtures.length,1);
  assert.equal(fixtures[0].requestHeaders.authorization,undefined);
  assert.equal(fixtures[0].response.headers['set-cookie'],undefined);
  assert.match(fixtures[0].requestBody.sha256,/^[0-9a-f]{64}$/);
  assert.equal(fixtures[0].requestBody.captured,false);
});
