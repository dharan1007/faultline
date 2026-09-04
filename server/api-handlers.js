import { detectProject } from '../src/project-detector.js';
import { ok, fail, readJson, requestId, publicError } from './http.js';

const PROD_ORIGIN='https://faultline-webmcp.vercel.app';
function corsOrigin(request){
  const origin=request.headers.get('origin');
  if(!origin) return null;
  if(origin===PROD_ORIGIN||/^https:\/\/faultline-webmcp-[a-z0-9-]+\.vercel\.app$/i.test(origin)||/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)) return origin;
  return null;
}
function response(request,status,payload){
  const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
  const origin=corsOrigin(request);if(origin){headers['access-control-allow-origin']=origin;headers.vary='Origin';}
  return new Response(JSON.stringify(payload),{status,headers});
}
function codeFor(error){
  if(error?.message==='INVALID_JSON')return ['INVALID_JSON',400];
  if(error?.message==='REQUEST_TOO_LARGE')return ['REQUEST_TOO_LARGE',413];
  return ['INVALID_REQUEST',400];
}

export async function handleHealth(request){
  const id=requestId(request.headers);
  return response(request,200,ok({status:'healthy',apiVersion:'v1',remoteExecution:'gated',mcp:'/mcp'},id));
}

export async function handleProjectInspect(request){
  const id=requestId(request.headers);
  if(request.method==='OPTIONS')return response(request,204,{});
  if(request.method!=='POST')return response(request,405,fail('METHOD_NOT_ALLOWED','Use POST for project inspection',{retryable:false},id));
  try{
    const input=await readJson(request,{maxBytes:262144});
    if(input.packageJson!==null&&input.packageJson!==undefined&&typeof input.packageJson!=='object') throw new Error('PACKAGE_JSON_INVALID');
    if(input.files!==undefined&&!Array.isArray(input.files)) throw new Error('FILES_INVALID');
    const detected=detectProject({packageJson:input.packageJson??null,files:(input.files||[]).slice(0,2000)});
    return response(request,200,ok(detected,id));
  }catch(error){const [code,status]=codeFor(error);const pub=publicError(error,code);return response(request,status,fail(code,pub.message,{retryable:false,details:pub.details},id));}
}

export async function handleFailureEvaluate(request){
  const id=requestId(request.headers);
  if(request.method!=='POST')return response(request,405,fail('METHOD_NOT_ALLOWED','Use POST for failure evaluation',{retryable:false},id));
  try{
    const input=await readJson(request,{maxBytes:65536});
    const oracle=input.oracle,observation=input.observation;
    if(!oracle||typeof oracle!=='object'||!observation||typeof observation!=='object')throw new Error('ORACLE_OR_OBSERVATION_REQUIRED');
    const supported=new Set(['dom_property','computed_style','dom_exists','runtime_error','text','url']);
    if(!supported.has(oracle.kind))throw new Error('ORACLE_KIND_UNSUPPORTED');
    const actual=observation.actual;
    const failed=oracle.kind==='runtime_error'?Boolean(actual):Object.is(actual,oracle.equals);
    return response(request,200,ok({status:failed?'FAIL':'PASS',executed:false,evidence:{actual,expected:oracle.equals,kind:oracle.kind}},id));
  }catch(error){const [code,status]=codeFor(error);const pub=publicError(error,code);return response(request,status,fail(code,pub.message,{retryable:false,details:pub.details},id));}
}
