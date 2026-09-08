import http from 'node:http';
import {randomUUID} from 'node:crypto';

import {createInvestigation} from '../../src/investigation-protocol.js';
import {createInvestigationStore} from '../../src/investigation-store.js';
import {validateCaptureTarget} from './url-policy.mjs';
import {capturePublicTarget} from './capture-session.mjs';

const clone=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));

function isLoopbackHost(value){
  const host=String(value||'').replace(/^\[|\]$/g,'').toLowerCase();
  return host==='127.0.0.1'||host==='localhost'||host==='::1';
}
function requestHostAllowed(req){
  const raw=req.headers.host;
  if(!raw)return false;
  try{return isLoopbackHost(new URL(`http://${raw}`).hostname);}catch{return false;}
}
function sendJson(res,status,value){
  const body=JSON.stringify(value);
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','content-length':Buffer.byteLength(body)});
  res.end(body);
}
function serializeError(error){
  const result={code:error?.code||'CAPTURE_FAILED',message:error?.message||'CAPTURE_FAILED'};
  for(const key of ['limit','observed','maximum','details'])if(error?.[key]!==undefined)result[key]=clone(error[key]);
  return result;
}
async function readJson(req,{maxBytes=262144}={}){
  if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw Object.assign(new Error('JSON_CONTENT_TYPE_REQUIRED'),{code:'JSON_CONTENT_TYPE_REQUIRED',httpStatus:415});
  const chunks=[];let bytes=0;
  for await(const chunk of req){
    bytes+=chunk.length;
    if(bytes>maxBytes)throw Object.assign(new Error('REQUEST_BODY_TOO_LARGE'),{code:'REQUEST_BODY_TOO_LARGE',httpStatus:413});
    chunks.push(chunk);
  }
  if(!chunks.length)return {};
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(new Error('INVALID_JSON'),{code:'INVALID_JSON',httpStatus:400});}
}
function operationView(operation){
  return clone({operationId:operation.operationId,type:operation.type,status:operation.status,createdAt:operation.createdAt,startedAt:operation.startedAt,finishedAt:operation.finishedAt,result:operation.result,error:operation.error});
}

export async function startCoordinatorServer({port=0,host='127.0.0.1',resolver,connector}={}){
  if(!isLoopbackHost(host))throw Object.assign(new Error('COORDINATOR_BIND_BLOCKED'),{code:'COORDINATOR_BIND_BLOCKED'});
  const investigations=new Map();
  const operations=new Map();

  const runCapture=operation=>{
    operation.promise=(async()=>{
      operation.status='RUNNING';operation.startedAt=new Date().toISOString();
      try{
        if(operation.controller.signal.aborted)throw Object.assign(new Error('OPERATION_CANCELLED'),{code:'OPERATION_CANCELLED'});
        const record=investigations.get(operation.investigationId);
        if(!record)throw Object.assign(new Error('INVESTIGATION_NOT_FOUND'),{code:'INVESTIGATION_NOT_FOUND'});
        const before=record.store.inspect();
        const captured=await capturePublicTarget({targetUrl:before.target.url,captureId:before.capture.id,resolver,connector,limits:operation.limits,signal:operation.controller.signal});
        const updated=record.store.commit(before.revision,draft=>{
          draft.target={...draft.target,url:captured.target.url,origin:captured.target.origin};
          draft.environment={...draft.environment,...captured.environment};
          draft.capture=captured.capture;
          draft.observations=[...draft.observations,...captured.observations];
          return draft;
        },{kind:'capture_complete',captureId:before.capture.id});
        operation.status='COMPLETED';operation.result={investigation:updated};
      }catch(error){
        if(operation.controller.signal.aborted||error?.code==='OPERATION_CANCELLED')operation.status='CANCELLED';
        else{operation.status='FAILED';operation.error=serializeError(error);}
      }finally{operation.finishedAt=new Date().toISOString();}
    })();
  };

  const server=http.createServer(async(req,res)=>{
    if(!requestHostAllowed(req))return sendJson(res,421,{error:{code:'COORDINATOR_HOST_BLOCKED'}});
    const requestUrl=new URL(req.url,'http://coordinator.local');
    try{
      if(req.method==='GET'&&requestUrl.pathname==='/health')return sendJson(res,200,{status:'ok',service:'faultline-coordinator',version:1,bind:host});

      if(req.method==='POST'&&requestUrl.pathname==='/investigations'){
        const body=await readJson(req);
        const validated=await validateCaptureTarget(body.targetUrl,resolver);
        const id=`inv_${randomUUID()}`;
        const investigation=createInvestigation({
          id,
          target:{mode:'public_url',url:validated.url,origin:validated.origin},
          environment:{coordinator:'local-playwright',capturePolicy:'public-only-pinned-proxy'}
        });
        const store=createInvestigationStore(investigation);
        investigations.set(id,{store,validated});
        return sendJson(res,201,{investigation:store.inspect()});
      }

      if(req.method==='POST'&&requestUrl.pathname==='/captures'){
        const body=await readJson(req);
        const record=investigations.get(body.investigationId);
        if(!record)return sendJson(res,404,{error:{code:'INVESTIGATION_NOT_FOUND'}});
        const operation={
          operationId:`op_${randomUUID()}`,type:'capture',investigationId:body.investigationId,limits:body.limits||{},status:'PENDING',createdAt:new Date().toISOString(),startedAt:null,finishedAt:null,result:null,error:null,controller:new AbortController(),promise:null
        };
        operations.set(operation.operationId,operation);
        queueMicrotask(()=>runCapture(operation));
        return sendJson(res,202,{operationId:operation.operationId,status:operation.status});
      }

      const operationMatch=requestUrl.pathname.match(/^\/operations\/([^/]+)$/);
      if(req.method==='GET'&&operationMatch){
        const operation=operations.get(operationMatch[1]);
        if(!operation)return sendJson(res,404,{error:{code:'OPERATION_NOT_FOUND'}});
        return sendJson(res,200,operationView(operation));
      }

      const cancelMatch=requestUrl.pathname.match(/^\/operations\/([^/]+)\/cancel$/);
      if(req.method==='POST'&&cancelMatch){
        await readJson(req);
        const operation=operations.get(cancelMatch[1]);
        if(!operation)return sendJson(res,404,{error:{code:'OPERATION_NOT_FOUND'}});
        if(operation.status==='PENDING'||operation.status==='RUNNING'){
          operation.controller.abort(Object.assign(new Error('OPERATION_CANCELLED'),{code:'OPERATION_CANCELLED'}));
          return sendJson(res,202,{operationId:operation.operationId,status:'CANCELLING'});
        }
        return sendJson(res,200,operationView(operation));
      }

      return sendJson(res,404,{error:{code:'NOT_FOUND'}});
    }catch(error){return sendJson(res,error?.httpStatus||422,{error:serializeError(error)});}
  });

  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  const address=server.address();
  return {
    server,
    address,
    async close(){
      for(const operation of operations.values())if(operation.status==='PENDING'||operation.status==='RUNNING')operation.controller.abort(Object.assign(new Error('OPERATION_CANCELLED'),{code:'OPERATION_CANCELLED'}));
      await Promise.allSettled([...operations.values()].map(operation=>operation.promise).filter(Boolean));
      await new Promise(resolve=>server.close(()=>resolve()));
    }
  };
}

if(import.meta.url===`file://${process.argv[1]}`){
  const instance=await startCoordinatorServer({port:Number(process.env.FAULTLINE_COORDINATOR_PORT||4317)});
  console.log(`FAULTLINE coordinator listening on http://127.0.0.1:${instance.address.port}`);
}
