import { sanitizePlatformValue } from './platform-domain.js';

const VERSION=1;
const clone=value=>JSON.parse(JSON.stringify(value));

function blank(){ return {version:VERSION,projects:[],investigations:[],runs:[],evidence:[],settings:{}}; }
function clean(value){ return sanitizePlatformValue(value); }

export function createWorkspaceStore(adapter){
  if(!adapter||typeof adapter.read!=='function'||typeof adapter.write!=='function') throw new Error('INVALID_STORAGE_ADAPTER');
  let state=blank();

  async function persist(){
    state=clean(state);
    state.version=VERSION;
    await adapter.write(clone(state));
  }

  async function load(){
    let raw;
    try { raw=await adapter.read(); } catch { state=blank(); return {status:'reset'}; }
    if(raw==null){ state=blank(); return {status:'empty'}; }
    if(!raw||raw.version!==VERSION||!Array.isArray(raw.projects)||!Array.isArray(raw.investigations)){
      state=blank();
      try { if(typeof adapter.clear==='function') await adapter.clear(); } catch {}
      return {status:'reset'};
    }
    state={...blank(),...clean(raw),version:VERSION};
    return {status:'loaded'};
  }

  function listProjects(){ return clone(state.projects); }
  function listInvestigations(){ return clone(state.investigations); }
  function listRuns(){ return clone(state.runs||[]); }
  function listEvidence(){ return clone(state.evidence||[]); }
  function getProject(id){ const item=state.projects.find(value=>value.id===id); return item?clone(item):null; }
  function getInvestigation(id){ const item=state.investigations.find(value=>value.id===id); return item?clone(item):null; }

  async function upsert(key,value){
    const safe=clean(value);
    const items=state[key];
    const index=items.findIndex(item=>item.id===safe.id);
    if(index>=0) items[index]=safe; else items.push(safe);
    await persist();
    return clone(safe);
  }

  async function putProject(value){ return upsert('projects',value); }
  async function putInvestigation(value){ return upsert('investigations',value); }
  async function putRun(value){ return upsert('runs',value); }
  async function putEvidence(value){ return upsert('evidence',value); }
  async function removeAll(){ state=blank(); if(typeof adapter.clear==='function') await adapter.clear(); else await persist(); }
  function snapshot(){ return clone(state); }

  return {load,listProjects,listInvestigations,listRuns,listEvidence,getProject,getInvestigation,putProject,putInvestigation,putRun,putEvidence,removeAll,snapshot};
}

export function createIndexedDbAdapter({dbName='faultline-platform',storeName='workspace',key='canonical'}={}){
  function open(){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(dbName,1);
      request.onupgradeneeded=()=>{ if(!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName); };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('INDEXEDDB_OPEN_FAILED'));
    });
  }
  async function transaction(mode,operation){
    const db=await open();
    try{
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction(storeName,mode), store=tx.objectStore(storeName), request=operation(store);
        request.onsuccess=()=>resolve(request.result ?? null);
        request.onerror=()=>reject(request.error||new Error('INDEXEDDB_REQUEST_FAILED'));
        tx.onerror=()=>reject(tx.error||new Error('INDEXEDDB_TRANSACTION_FAILED'));
      });
    } finally { db.close(); }
  }
  return {
    read:()=>transaction('readonly',store=>store.get(key)),
    write:value=>transaction('readwrite',store=>store.put(clone(value),key)),
    clear:()=>transaction('readwrite',store=>store.delete(key))
  };
}

export function createMemoryAdapter(initial=null){
  let value=initial==null?null:clone(initial);
  return {read:async()=>value==null?null:clone(value),write:async next=>{value=clone(next);},clear:async()=>{value=null;}};
}
