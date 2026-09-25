import { createHash } from 'node:crypto';

export const PLAYWRIGHT_ENVIRONMENT_SCHEMA='faultline.playwright-environment.v1';
export const NETWORK_FIXTURE_SCHEMA='faultline.network-fixture.v1';

const fail=code=>{throw new Error(code)};
const clone=value=>structuredClone(value);
const SENSITIVE_HEADERS=new Set([
  'authorization','proxy-authorization','cookie','set-cookie','x-api-key',
  'x-auth-token','x-csrf-token','x-xsrf-token'
]);

function boundedString(value,max=4096){
  const text=String(value??'');
  return text.length>max?text.slice(0,max):text;
}
function sha256(value){return createHash('sha256').update(value).digest('hex');}
function validatePage(page){
  if(!page||typeof page.evaluate!=='function'||typeof page.context!=='function')fail('FAULTLINE_ENV_INVALID_PLAYWRIGHT_PAGE');
  return page;
}
function normalizeOrigins(values,baseUrl){
  const origins=new Set();
  if(baseUrl){try{origins.add(new URL(baseUrl).origin);}catch{}}
  for(const value of values??[]){
    let parsed;try{parsed=new URL(value);}catch{fail('FAULTLINE_ENV_INVALID_ALLOWED_ORIGIN');}
    if(!['http:','https:'].includes(parsed.protocol))fail('FAULTLINE_ENV_INVALID_ALLOWED_ORIGIN');
    origins.add(parsed.origin);
  }
  return origins;
}
function safeUrl(value,{includeQuery=false}={}){
  let parsed;try{parsed=new URL(String(value));}catch{fail('FAULTLINE_ENV_INVALID_URL');}
  if(!['http:','https:'].includes(parsed.protocol))fail('FAULTLINE_ENV_INVALID_URL');
  parsed.username='';parsed.password='';parsed.hash='';
  if(!includeQuery)parsed.search='';
  return parsed.toString();
}
function headerEntries(headers){
  const output={};
  for(const [rawName,rawValue] of Object.entries(headers??{})){
    const name=String(rawName).toLowerCase();
    if(SENSITIVE_HEADERS.has(name))continue;
    const value=boundedString(rawValue,8192);
    output[name]=value;
  }
  return output;
}
function bodyDigest(request){
  let bytes=Buffer.alloc(0);
  try{
    const data=request.postDataBuffer?.();
    if(data)bytes=Buffer.from(data);
    else{
      const text=request.postData?.();
      if(text!=null)bytes=Buffer.from(String(text));
    }
  }catch{}
  return {sha256:sha256(bytes),bytes:bytes.length};
}
function encodeBody(bytes,maxBodyBytes){
  const body=Buffer.from(bytes??[]);
  if(body.length>maxBodyBytes)return {captured:false,reason:'BODY_LIMIT_EXCEEDED',bytes:body.length,sha256:sha256(body)};
  return {captured:true,encoding:'base64',data:body.toString('base64'),bytes:body.length,sha256:sha256(body)};
}
function storageShape(entries,includeValues){
  return entries.map(([key,value])=>includeValues
    ? {key:boundedString(key,2048),value:boundedString(value,256*1024),redacted:false}
    : {key:boundedString(key,2048),value:null,redacted:true});
}

export async function captureBrowserState({
  page,
  includeCookieValues=false,
  includeStorageValues=false,
  includeUrlQuery=false,
  maxStorageEntries=256
}={}){
  validatePage(page);
  const currentUrl=page.url();
  const url=safeUrl(currentUrl,{includeQuery:includeUrlQuery});
  const origin=new URL(url).origin;
  const rawCookies=await page.context().cookies([currentUrl]);
  const cookies=rawCookies.slice(0,256).map(cookie=>({
    name:boundedString(cookie.name,512),
    value:includeCookieValues?boundedString(cookie.value,8192):null,
    redacted:!includeCookieValues,
    domain:boundedString(cookie.domain,1024),
    path:boundedString(cookie.path,2048),
    expires:Number(cookie.expires),
    httpOnly:Boolean(cookie.httpOnly),
    secure:Boolean(cookie.secure),
    sameSite:cookie.sameSite??'Lax'
  }));
  const storage=await page.evaluate(limit=>{
    const read=store=>{
      const out=[];
      for(let index=0;index<store.length&&out.length<limit;index++){
        const key=store.key(index);
        if(key!=null)out.push([key,store.getItem(key)??'']);
      }
      return out;
    };
    return {localStorage:read(localStorage),sessionStorage:read(sessionStorage)};
  },maxStorageEntries);
  return Object.freeze({
    schema:PLAYWRIGHT_ENVIRONMENT_SCHEMA,
    url,
    origin,
    cookies,
    localStorage:storageShape(storage.localStorage,includeStorageValues),
    sessionStorage:storageShape(storage.sessionStorage,includeStorageValues),
    confidentiality:{
      cookieValuesIncluded:Boolean(includeCookieValues),
      storageValuesIncluded:Boolean(includeStorageValues),
      urlQueryIncluded:Boolean(includeUrlQuery)
    }
  });
}

function validateStateSnapshot(snapshot){
  if(!snapshot||snapshot.schema!==PLAYWRIGHT_ENVIRONMENT_SCHEMA)fail('FAULTLINE_ENV_INVALID_STATE_SNAPSHOT');
  let origin;try{origin=new URL(snapshot.origin).origin;}catch{fail('FAULTLINE_ENV_INVALID_STATE_SNAPSHOT');}
  if(origin!==snapshot.origin)fail('FAULTLINE_ENV_INVALID_STATE_SNAPSHOT');
  if(!Array.isArray(snapshot.cookies)||!Array.isArray(snapshot.localStorage)||!Array.isArray(snapshot.sessionStorage))fail('FAULTLINE_ENV_INVALID_STATE_SNAPSHOT');
  return snapshot;
}

export async function restoreBrowserState({page,snapshot,navigate=true}={}){
  validatePage(page);validateStateSnapshot(snapshot);
  const cookies=snapshot.cookies
    .filter(cookie=>!cookie.redacted&&typeof cookie.value==='string')
    .map(cookie=>({
      name:cookie.name,value:cookie.value,domain:cookie.domain,path:cookie.path,
      expires:cookie.expires,httpOnly:cookie.httpOnly,secure:cookie.secure,sameSite:cookie.sameSite
    }));
  if(cookies.length)await page.context().addCookies(cookies);
  if(navigate){
    const target=safeUrl(snapshot.url,{includeQuery:true});
    if(new URL(target).origin!==snapshot.origin)fail('FAULTLINE_ENV_ORIGIN_DRIFT');
    await page.goto(target,{waitUntil:'domcontentloaded'});
  }else{
    let current;try{current=new URL(page.url()).origin;}catch{fail('FAULTLINE_ENV_INVALID_URL');}
    if(current!==snapshot.origin)fail('FAULTLINE_ENV_ORIGIN_DRIFT');
  }
  const local=snapshot.localStorage.filter(item=>!item.redacted&&typeof item.value==='string');
  const session=snapshot.sessionStorage.filter(item=>!item.redacted&&typeof item.value==='string');
  await page.evaluate(({local,session})=>{
    for(const item of local)localStorage.setItem(item.key,item.value);
    for(const item of session)sessionStorage.setItem(item.key,item.value);
  },{local,session});
  return {
    restoredCookies:cookies.length,
    restoredLocalStorage:local.length,
    restoredSessionStorage:session.length,
    redactedValuesSkipped:
      snapshot.cookies.length-cookies.length+
      snapshot.localStorage.length-local.length+
      snapshot.sessionStorage.length-session.length
  };
}

export function armNetworkRecorder(page,{
  allowedOrigins=[],
  includeResponseBodies=false,
  includeRequestBodies=false,
  maxEntries=128,
  maxBodyBytes=256*1024,
  totalBodyBytes=4*1024*1024
}={}){
  validatePage(page);
  if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>2000)fail('FAULTLINE_ENV_INVALID_NETWORK_LIMIT');
  if(!Number.isSafeInteger(maxBodyBytes)||maxBodyBytes<0||maxBodyBytes>4*1024*1024)fail('FAULTLINE_ENV_INVALID_BODY_LIMIT');
  const origins=normalizeOrigins(allowedOrigins,page.url());
  const fixtures=[];
  const pending=new Set();
  let capturedBodyBytes=0;
  let stopped=false;

  const onResponse=response=>{
    if(stopped||fixtures.length>=maxEntries)return;
    const task=(async()=>{
      const request=response.request();
      let parsed;try{parsed=new URL(request.url());}catch{return;}
      if(!origins.has(parsed.origin))return;
      const requestDigest=bodyDigest(request);
      const fixture={
        schema:NETWORK_FIXTURE_SCHEMA,
        id:`net-${fixtures.length+1}`,
        method:String(request.method?.()??'GET').toUpperCase(),
        url:safeUrl(request.url(),{includeQuery:true}),
        requestHeaders:headerEntries(await request.allHeaders?.()??request.headers?.()??{}),
        requestBody:{
          ...requestDigest,
          captured:Boolean(includeRequestBodies&&requestDigest.bytes<=maxBodyBytes)
        },
        response:{
          status:Number(response.status()),
          headers:headerEntries(await response.allHeaders?.()??response.headers?.()??{}),
          body:null
        }
      };
      if(includeRequestBodies&&requestDigest.bytes<=maxBodyBytes){
        const data=request.postDataBuffer?.()??Buffer.from(request.postData?.()??'');
        fixture.requestBody.encoding='base64';
        fixture.requestBody.data=Buffer.from(data).toString('base64');
      }
      if(includeResponseBodies&&capturedBodyBytes<totalBodyBytes){
        try{
          const bytes=await response.body();
          const encoded=encodeBody(bytes,Math.min(maxBodyBytes,totalBodyBytes-capturedBodyBytes));
          fixture.response.body=encoded;
          if(encoded.captured)capturedBodyBytes+=encoded.bytes;
        }catch{
          fixture.response.body={captured:false,reason:'BODY_UNAVAILABLE'};
        }
      }
      if(fixtures.length<maxEntries)fixtures.push(fixture);
    })();
    pending.add(task);
    task.finally(()=>pending.delete(task));
  };
  page.on('response',onResponse);

  return Object.freeze({
    async stop(){
      if(stopped)return clone(fixtures);
      stopped=true;
      page.off('response',onResponse);
      await Promise.allSettled([...pending]);
      return clone(fixtures);
    },
    snapshot(){return clone(fixtures);}
  });
}

function validateFixture(fixture){
  if(!fixture||fixture.schema!==NETWORK_FIXTURE_SCHEMA)fail('FAULTLINE_ENV_INVALID_NETWORK_FIXTURE');
  if(typeof fixture.method!=='string'||typeof fixture.url!=='string'||!fixture.response||!Number.isInteger(fixture.response.status))fail('FAULTLINE_ENV_INVALID_NETWORK_FIXTURE');
  safeUrl(fixture.url,{includeQuery:true});
  return fixture;
}
function fixtureRequestKey(method,url,bodySha){
  return `${String(method).toUpperCase()}\u001f${safeUrl(url,{includeQuery:true})}\u001f${bodySha||sha256(Buffer.alloc(0))}`;
}

export async function installNetworkReplay(page,fixtures,{
  allowedOrigins=[],
  strict=true
}={}){
  validatePage(page);
  if(!Array.isArray(fixtures)||fixtures.length>2000)fail('FAULTLINE_ENV_INVALID_NETWORK_FIXTURES');
  const origins=normalizeOrigins(allowedOrigins,page.url());
  const byKey=new Map();
  for(const raw of fixtures){
    const fixture=validateFixture(raw);
    const parsed=new URL(fixture.url);
    if(!origins.has(parsed.origin))fail('FAULTLINE_ENV_FIXTURE_ORIGIN_NOT_ALLOWED');
    const key=fixtureRequestKey(fixture.method,fixture.url,fixture.requestBody?.sha256);
    const list=byKey.get(key)||[];
    list.push(fixture);
    byKey.set(key,list);
  }
  const cursors=new Map();
  const handler=async route=>{
    const request=route.request();
    let parsed;try{parsed=new URL(request.url());}catch{return strict?route.abort('blockedbyclient'):route.continue();}
    if(!origins.has(parsed.origin))return strict?route.abort('blockedbyclient'):route.continue();
    const digest=bodyDigest(request);
    const key=fixtureRequestKey(request.method(),request.url(),digest.sha256);
    const matches=byKey.get(key)||[];
    const index=cursors.get(key)||0;
    const fixture=matches[index];
    if(!fixture)return strict?route.abort('failed'):route.continue();
    cursors.set(key,index+1);
    const body=fixture.response.body?.captured&&fixture.response.body.encoding==='base64'
      ? Buffer.from(fixture.response.body.data,'base64')
      : undefined;
    await route.fulfill({
      status:fixture.response.status,
      headers:headerEntries(fixture.response.headers),
      ...(body?{body}: {})
    });
  };
  await page.route('**/*',handler);
  return Object.freeze({
    async dispose(){await page.unroute('**/*',handler);},
    usage(){return Object.fromEntries([...cursors.entries()]);}
  });
}
