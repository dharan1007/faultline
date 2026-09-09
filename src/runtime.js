import { semanticUnits, removeUnits, ddminReduce, createRevisionStore } from './reducer-engine.js';
import { navigationRisk } from './sandbox-policy.js';
import { CAPTURE_SCHEMA, CAPTURE_LIMITS, normalizeCaptureArtifact } from './capture-contract.js';

const $ = id => document.getElementById(id);
const clone = v => JSON.parse(JSON.stringify(v));
const STORAGE_KEY = 'faultline-prod-v3';
const LEGACY_STORAGE_KEY = 'faultline-prod-v2';
const MAX_RUNTIME_REVISIONS = 16;
const MAX_EXPERIMENT_LEDGER = 200;
const PERSISTENCE_PROFILES=[
  {storeSnapshots:32,storeLedger:64,runtimeRevisions:16,experiments:200},
  {storeSnapshots:16,storeLedger:32,runtimeRevisions:8,experiments:100},
  {storeSnapshots:8,storeLedger:16,runtimeRevisions:4,experiments:50},
  {storeSnapshots:4,storeLedger:8,runtimeRevisions:2,experiments:25},
  {storeSnapshots:2,storeLedger:4,runtimeRevisions:1,experiments:10},
  {storeSnapshots:1,storeLedger:1,runtimeRevisions:1,experiments:1}
];
const ORACLE_KINDS=['dom_property','dom_attribute','computed_style','dom_exists','runtime_error'];
const ACTION_KINDS=['none','click','set_value','set_checked','sequence'];
const ACTION_STEP_KINDS=['click','set_value','set_checked','wait'];
const MAX_SEQUENCE_WAIT_MS=2000;
const HOST_TIMEOUT_MS=5000;
const REQUEST_ID_PATTERN=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const fixture = {
  html:'<dialog id="modal" open><button id="save">Save</button></dialog><p id="noise">Irrelevant debug noise</p>',
  css:'#modal{display:block;position:fixed;z-index:10} #noise{color:gray} button{padding:8px}',
  js:"document.querySelector('#save').addEventListener('click',()=>{ document.querySelector('#modal').open = true; });\nconsole.debug('noise');",
  oracle:{kind:'dom_property',selector:'#modal',property:'open',equals:true,action:{kind:'click',selector:'#save'},delayMs:0}
};

let store = createRevisionStore(fixture);
let axis = 'html';
let pins = new Set();
let selectedUnitId = null;
let experimentLedger = [];
let captureProvenance = null;
let experimentQueue = Promise.resolve();
let previewBootstrapId = null;
const activeWebMCPOperations = new Map();
const CANCELLABLE_WEBMCP_TOOLS = new Set(['faultline_run','faultline_probe','faultline_reduce','faultline_autopilot','faultline_import_capture']);
const revisions = new Map([['r1',{value:clone(fixture),pins:[],captureProvenance:null}]]);

function value(){ return store.inspect().value; }
function revision(){ return store.inspect().revision; }
function normalizeExpected(v){ const s=String(v); if(s==='true')return true;if(s==='false')return false;if(s==='null')return null;if(s==='undefined')return undefined;if(s!==''&&!Number.isNaN(Number(s)))return Number(s);return v; }
function unitsFor(targetAxis=axis, source=value()[targetAxis]){ return semanticUnits(targetAxis,source); }
function pinKey(targetAxis,unitId){ return `${targetAxis}|${unitId}`; }
function directPinnedUnitIds(targetAxis){
  const prefix=`${targetAxis}|`;
  return [...pins].filter(key=>key.startsWith(prefix)).map(key=>key.slice(prefix.length));
}
function normalizedUnitSignature(unit){
  const text=String(unit?.text??'').trim();
  if(unit?.axis==='html'){
    const open=/^<\s*[A-Za-z][^>]*>/.exec(text)?.[0];
    return (open||text).replace(/\s+/g,' ').trim();
  }
  if(unit?.axis==='css'&&unit?.kind==='rule'){
    const brace=text.indexOf('{');
    return (brace>=0?text.slice(0,brace):text).replace(/\s+/g,' ').trim();
  }
  return text.replace(/\s+/g,' ').trim();
}
function unitDescriptor(unit,byId){
  const ancestors=[];
  let parent=unit?.parentId?byId.get(unit.parentId):null;
  while(parent){ancestors.unshift(`${parent.kind}:${normalizedUnitSignature(parent)}`);parent=parent.parentId?byId.get(parent.parentId):null;}
  return {kind:unit.kind,signature:normalizedUnitSignature(unit),ancestors};
}
function descriptorKey(descriptor){return JSON.stringify([descriptor.kind,descriptor.signature,descriptor.ancestors]);}
function capturePinDescriptors(targetAxis,source){
  const units=unitsFor(targetAxis,source),byId=new Map(units.map(unit=>[unit.id,unit]));
  return directPinnedUnitIds(targetAxis).map(id=>{
    const unit=byId.get(id);
    if(!unit)throw new Error('PIN_REMAP_FAILED');
    return unitDescriptor(unit,byId);
  });
}
function resolvePinDescriptors(targetAxis,source,descriptors){
  if(!descriptors.length)return [];
  const units=unitsFor(targetAxis,source),byId=new Map(units.map(unit=>[unit.id,unit]));
  const buckets=new Map();
  for(const unit of units){const key=descriptorKey(unitDescriptor(unit,byId));const bucket=buckets.get(key)||[];bucket.push(unit.id);buckets.set(key,bucket);}
  return descriptors.map(descriptor=>{
    const matches=buckets.get(descriptorKey(descriptor))||[];
    if(matches.length!==1)throw new Error('PIN_REMAP_FAILED');
    return matches[0];
  });
}
function annotatedUnits(targetAxis=axis,source=value()[targetAxis],directIds=directPinnedUnitIds(targetAxis)){
  const raw=unitsFor(targetAxis,source),byId=new Map(raw.map(unit=>[unit.id,unit])),direct=new Set(directIds),protectedAncestors=new Set();
  for(const id of direct){
    let cursor=byId.get(id);
    while(cursor?.parentId){protectedAncestors.add(cursor.parentId);cursor=byId.get(cursor.parentId);}
  }
  return raw.map(unit=>({...unit,pinned:direct.has(unit.id),protectedByDescendant:protectedAncestors.has(unit.id)}));
}
async function hierarchicalReduceSource(targetAxis,source,evaluate,{maxTrials=80}={}){
  const descriptors=capturePinDescriptors(targetAxis,source);
  let trialCount=0,removedCount=0,currentSource=source,passes=[];
  const run=async candidate=>{
    if(trialCount>=maxTrials)throw new Error('TRIAL_BUDGET_EXHAUSTED');
    trialCount++;
    return evaluate(candidate);
  };
  if(await run(currentSource)!=='FAIL')throw new Error('BASELINE_NOT_FAILING');
  for(let depth=0;;depth++){
    const currentDirectIds=resolvePinDescriptors(targetAxis,currentSource,descriptors);
    const all=annotatedUnits(targetAxis,currentSource,currentDirectIds);
    const maxDepth=all.reduce((max,unit)=>Math.max(max,unit.depth||0),-1);
    if(depth>maxDepth)break;
    const frontier=all.filter(unit=>(unit.depth||0)===depth);
    if(!frontier.length)continue;
    const protectedIds=new Set(frontier.filter(unit=>unit.pinned||unit.protectedByDescendant).map(unit=>unit.id));
    const originalSource=currentSource;
    let removable=frontier.filter(unit=>!protectedIds.has(unit.id));
    let n=2;
    while(removable.length>=1){
      const size=Math.ceil(removable.length/n);
      let changed=false;
      for(let i=0;i<removable.length;i+=size){
        const chunk=removable.slice(i,i+size),chunkIds=new Set(chunk.map(unit=>unit.id));
        const candidateRemovable=removable.filter(unit=>!chunkIds.has(unit.id));
        const candidateIds=new Set(candidateRemovable.map(unit=>unit.id));
        const removed=frontier.filter(unit=>!protectedIds.has(unit.id)&&!candidateIds.has(unit.id));
        const candidateSource=removeUnits(originalSource,removed);
        if(await run(candidateSource)==='FAIL'){
          removable=candidateRemovable;
          n=Math.max(2,n-1);
          changed=true;
          break;
        }
      }
      if(changed)continue;
      if(n>=removable.length)break;
      n=Math.min(removable.length,n*2);
    }
    const keptIds=new Set(removable.map(unit=>unit.id));
    const removed=frontier.filter(unit=>!protectedIds.has(unit.id)&&!keptIds.has(unit.id));
    if(removed.length){
      currentSource=removeUnits(originalSource,removed);
      removedCount+=removed.length;
      passes.push({depth,removed:removed.length,before:originalSource.length,after:currentSource.length});
      resolvePinDescriptors(targetAxis,currentSource,descriptors);
    }else passes.push({depth,removed:0,before:originalSource.length,after:originalSource.length});
  }
  return {source:currentSource,trialCount,removedCount,passes,pinIds:resolvePinDescriptors(targetAxis,currentSource,descriptors)};
}
function validRevisionEntry(entry,maxRevision=Infinity){ const match=Array.isArray(entry)&&entry.length===2&&/^r([1-9]\d*)$/.exec(String(entry[0]));if(!match||Number(match[1])>maxRevision||!entry[1]?.value)return false;try{validateCase(entry[1].value);return true}catch{return false} }
function trimRuntimeHistory(){
  while(revisions.size>MAX_RUNTIME_REVISIONS){
    const oldest=revisions.keys().next().value;
    if(oldest===revision())break;
    revisions.delete(oldest);
  }
  if(experimentLedger.length>MAX_EXPERIMENT_LEDGER) experimentLedger.splice(0,experimentLedger.length-MAX_EXPERIMENT_LEDGER);
}
function rememberRevision(rev,snapshot){ const next=clone(snapshot);if(!Object.hasOwn(next,'captureProvenance'))next.captureProvenance=clone(captureProvenance);revisions.set(rev,next);trimRuntimeHistory(); }
function rememberExperiment(entry){ experimentLedger.push(entry);trimRuntimeHistory();return entry; }
function abortError(){ return new DOMException('WebMCP execution aborted','AbortError'); }
function throwIfAborted(signal){ if(signal?.aborted)throw abortError(); }
function requireRequestId(input){ const requestId=String(input?.requestId??'');if(!REQUEST_ID_PATTERN.test(requestId))throw new Error('INVALID_REQUEST_ID');return requestId; }
function optionalRequestId(input){ const raw=input?.requestId;if(raw===undefined||raw===null||raw==='')return null;return requireRequestId(input); }
function combineAbortSignals(...signals){
  const active=signals.filter(Boolean);
  if(!active.length)return {signal:undefined,cleanup:()=>{}};
  if(active.length===1)return {signal:active[0],cleanup:()=>{}};
  if(typeof AbortSignal.any==='function')return {signal:AbortSignal.any(active),cleanup:()=>{}};
  const controller=new AbortController();
  const abort=()=>controller.abort();
  const listening=[];
  for(const signal of active){if(signal.aborted){controller.abort();break;}signal.addEventListener('abort',abort,{once:true});listening.push(signal);}
  return {signal:controller.signal,cleanup:()=>{for(const signal of listening)signal.removeEventListener('abort',abort);}};
}
async function executeWebMCPOperation(tool,execute,input,options={}){
  const requestId=optionalRequestId(input);
  if(requestId&&activeWebMCPOperations.has(requestId))throw new Error('REQUEST_ID_IN_USE');
  const controller=requestId?new AbortController():null;
  const combinedSignal=combineAbortSignals(options?.signal,controller?.signal);
  const signal=combinedSignal.signal;
  if(requestId)activeWebMCPOperations.set(requestId,{requestId,tool,startedAt:new Date().toISOString(),controller});
  let abortListener=null;
  try{
    throwIfAborted(signal);
    const abortPromise=signal?new Promise((_,reject)=>{abortListener=()=>reject(abortError());signal.addEventListener('abort',abortListener,{once:true});}):null;
    const task=Promise.resolve().then(()=>execute(input,{signal}));
    return await (abortPromise?Promise.race([task,abortPromise]):task);
  }finally{
    if(signal&&abortListener)signal.removeEventListener('abort',abortListener);
    combinedSignal.cleanup();
    if(requestId)activeWebMCPOperations.delete(requestId);
  }
}
function cancelActiveWebMCP({requestId}={}){
  const id=requireRequestId({requestId});
  const operation=activeWebMCPOperations.get(id);
  if(!operation)return {status:'NOT_FOUND',operations:[]};
  const summary={requestId:operation.requestId,tool:operation.tool,startedAt:operation.startedAt};
  operation.controller.abort();
  return {status:'CANCEL_REQUESTED',operations:[summary]};
}
function abortAllWebMCP(){ for(const operation of activeWebMCPOperations.values())operation.controller.abort(); }
function validateAction(action,{allowSequence=true,allowWait=false}={}){
  if(!action||typeof action!=='object'||Array.isArray(action))throw new Error('INVALID_ORACLE');
  const supported=allowWait?[...ACTION_KINDS,'wait']:ACTION_KINDS;
  if(!supported.includes(action.kind)||Object.keys(action).some(key=>!['kind','selector','value','checked','steps','durationMs'].includes(key)))throw new Error('INVALID_ORACLE');
  if(action.kind==='wait'){
    if(!allowWait||Object.keys(action).some(key=>!['kind','durationMs'].includes(key))||!Number.isFinite(action.durationMs)||action.durationMs<0||action.durationMs>MAX_SEQUENCE_WAIT_MS)throw new Error('INVALID_ORACLE');
    return action;
  }
  if(action.kind==='sequence'){
    if(!allowSequence||Object.hasOwn(action,'selector')||Object.hasOwn(action,'value')||Object.hasOwn(action,'checked')||Object.hasOwn(action,'durationMs')||!Array.isArray(action.steps)||action.steps.length<1||action.steps.length>8)throw new Error('INVALID_ORACLE');
    let totalWait=0;
    for(const step of action.steps){
      if(!ACTION_STEP_KINDS.includes(step?.kind))throw new Error('INVALID_ORACLE');
      validateAction(step,{allowSequence:false,allowWait:true});
      if(step.kind==='wait')totalWait+=step.durationMs;
    }
    if(totalWait>MAX_SEQUENCE_WAIT_MS)throw new Error('INVALID_ORACLE');
    return action;
  }
  if(Object.hasOwn(action,'steps')||Object.hasOwn(action,'durationMs'))throw new Error('INVALID_ORACLE');
  if(action.kind!=='set_checked'&&Object.hasOwn(action,'checked'))throw new Error('INVALID_ORACLE');
  if(action.kind==='click'&&(typeof action.selector!=='string'||!action.selector.trim()))throw new Error('INVALID_ORACLE');
  if(action.kind==='set_value'&&(typeof action.selector!=='string'||!action.selector.trim()||typeof action.value!=='string'))throw new Error('INVALID_ORACLE');
  if(action.kind==='set_checked'&&(typeof action.selector!=='string'||!action.selector.trim()||typeof action.checked!=='boolean'||Object.hasOwn(action,'value')))throw new Error('INVALID_ORACLE');
  return action;
}
function validateOracle(oracle){
  if(!oracle||typeof oracle!=='object'||Array.isArray(oracle))throw new Error('INVALID_ORACLE');
  const allowed=new Set(['kind','selector','property','equals','action','delayMs']);
  if(Object.keys(oracle).some(key=>!allowed.has(key))||!ORACLE_KINDS.includes(oracle.kind))throw new Error('INVALID_ORACLE');
  validateAction(oracle.action);
  if(oracle.kind!=='runtime_error'&&(typeof oracle.selector!=='string'||!oracle.selector.trim()))throw new Error('INVALID_ORACLE');
  if(['dom_property','dom_attribute','computed_style'].includes(oracle.kind)&&(typeof oracle.property!=='string'||!oracle.property.trim()))throw new Error('INVALID_ORACLE');
  if(oracle.kind==='dom_attribute'&&!(typeof oracle.equals==='string'||oracle.equals===null))throw new Error('INVALID_ORACLE');
  if(oracle.delayMs!==undefined&&(!Number.isFinite(oracle.delayMs)||oracle.delayMs<0||oracle.delayMs>2000))throw new Error('INVALID_ORACLE');
  return oracle;
}
function validateCase(candidate){
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))throw new Error('INVALID_CASE');
  const keys=Object.keys(candidate);
  if(keys.length!==4||keys.some(key=>!['html','css','js','oracle'].includes(key)))throw new Error('INVALID_CASE');
  if(typeof candidate.html!=='string'||typeof candidate.css!=='string'||typeof candidate.js!=='string')throw new Error('INVALID_CASE');
  validateOracle(candidate.oracle);
  return candidate;
}
function persistencePayload(profile=PERSISTENCE_PROFILES[0]){
  trimRuntimeHistory();
  const dumped=store.dump();
  const persistedStore={...dumped,snapshots:clone(dumped.snapshots.slice(-profile.storeSnapshots)),ledger:clone(dumped.ledger.slice(-profile.storeLedger))};
  return {version:3,store:persistedStore,axis,pins:[...pins],experimentLedger:clone(experimentLedger.slice(-profile.experiments)),captureProvenance:clone(captureProvenance),revisions:[...revisions.entries()].slice(-profile.runtimeRevisions).map(([rev,snapshot])=>[rev,clone(snapshot)])};
}
function snapshotCanonical(){ return clone(persistencePayload(PERSISTENCE_PROFILES[0])); }
function restoreCanonical(snapshot){
  store=createRevisionStore(fixture,snapshot.store);
  axis=['html','css','js'].includes(snapshot.axis)?snapshot.axis:'html';
  pins=new Set(Array.isArray(snapshot.pins)?snapshot.pins:[]);
  experimentLedger=Array.isArray(snapshot.experimentLedger)?clone(snapshot.experimentLedger.slice(-MAX_EXPERIMENT_LEDGER)):[];
  captureProvenance=snapshot.captureProvenance?clone(snapshot.captureProvenance):null;
  revisions.clear();
  const maxRevision=Number(revision().slice(1));
  for(const entry of Array.isArray(snapshot.revisions)?snapshot.revisions.slice(-MAX_RUNTIME_REVISIONS):[]) if(validRevisionEntry(entry,maxRevision)) revisions.set(String(entry[0]),clone(entry[1]));
  if(!revisions.has(revision())) revisions.set(revision(),{value:clone(value()),pins:[...pins],captureProvenance:clone(captureProvenance)});
  trimRuntimeHistory();
}
function isQuotaError(error){ return error?.name==='QuotaExceededError'||error?.name==='NS_ERROR_DOM_QUOTA_REACHED'||error?.code===22||error?.code===1014; }
function writePersistence(profile=PERSISTENCE_PROFILES[0]){ localStorage.setItem(STORAGE_KEY,JSON.stringify(persistencePayload(profile))); }
function writePersistenceAdaptive(){
  let quotaError=null;
  for(const profile of PERSISTENCE_PROFILES){
    try{writePersistence(profile);return profile;}
    catch(error){if(!isQuotaError(error))throw error;quotaError=error;}
  }
  throw quotaError||new Error('PERSISTENCE_FAILED');
}
function persistBestEffort(){ try{writePersistenceAdaptive();return true}catch{return false} }
function persistMutation(before){
  try{writePersistenceAdaptive();}
  catch{
    restoreCanonical(before);
    throw new Error('PERSISTENCE_FAILED');
  }
}
function restoreLocal(){
  try{
    const raw=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(raw?.store){
      store=createRevisionStore(fixture,raw.store);
      axis=['html','css','js'].includes(raw.axis)?raw.axis:'html';
      pins=new Set(Array.isArray(raw.pins)?raw.pins:[]);
      experimentLedger=Array.isArray(raw.experimentLedger)?raw.experimentLedger.slice(-MAX_EXPERIMENT_LEDGER):[];
      captureProvenance=raw.captureProvenance?clone(raw.captureProvenance):null;
      revisions.clear();
      const maxRevision=Number(revision().slice(1));
      for(const entry of Array.isArray(raw.revisions)?raw.revisions.slice(-MAX_RUNTIME_REVISIONS):[]) if(validRevisionEntry(entry,maxRevision)) revisions.set(String(entry[0]),clone(entry[1]));
      if(!revisions.has(revision())) revisions.set(revision(),{value:clone(value()),pins:[...pins],captureProvenance:clone(captureProvenance)});
      trimRuntimeHistory();
      return;
    }
  }catch{ try{localStorage.removeItem(STORAGE_KEY);}catch{} }
  try{
    const legacy=JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    if(!legacy?.state?.value)return;
    const match=/^r([1-9]\d*)$/.exec(String(legacy.state.revision||'r1'));
    const legacyRevision=match?Number(match[1]):1;
    const currentRevision=`r${legacyRevision}`;
    store=createRevisionStore(fixture,{version:1,revision:legacyRevision,value:legacy.state.value,snapshots:[[currentRevision,legacy.state.value]],ledger:Array.isArray(legacy.state.history)?legacy.state.history:[]});
    axis=['html','css','js'].includes(legacy.axis)?legacy.axis:'html';
    pins=new Set(Array.isArray(legacy.pins)?legacy.pins:[]);
    experimentLedger=Array.isArray(legacy.experimentLedger)?legacy.experimentLedger.slice(-MAX_EXPERIMENT_LEDGER):[];
    captureProvenance=null;
    revisions.clear();
    rememberRevision(currentRevision,{value:clone(value()),pins:[...pins]});
    persistBestEffort();
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }catch{}
}

function buildSandboxDocument(c,bootstrapId,{previewOnly=false,executePreview=false}={}){
  const safeCss=String(c.css).replace(/<\/style/gi,'<\\/style');
  const candidateSource=JSON.stringify(String(c.js)).replace(/</g,'\\u003c');
  const oracle=JSON.stringify(c.oracle).replace(/</g,'\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${safeCss}</style><script>
(function(){
 const candidateSource=${candidateSource};
 const o=${oracle};
 const schedule=setTimeout.bind(window);
 const querySelector=Document.prototype.querySelector.bind(document);
 const readComputedStyle=getComputedStyle.bind(window);
 const same=Object.is;
 const resultChannel=${previewOnly?'null':'new MessageChannel()'};
 const resultPort=resultChannel?.port1||null;
 const send=resultPort?resultPort.postMessage.bind(resultPort):null;
 const runtimeErrors=[];
 const navigationAttempts=[];
 let runtimePolicyViolation=null;
 let candidateExecutionStarted=false;
 const nativeFormSubmit=HTMLFormElement.prototype.submit;
 const nativeFormRequestSubmit=HTMLFormElement.prototype.requestSubmit;
 const NativeInputElement=HTMLInputElement;
 const nativeInputCheckedSetter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'checked')?.set;
 const nativeDispatchEvent=EventTarget.prototype.dispatchEvent;
 const NativeEvent=Event;
 const captureRuntimeError=value=>runtimeErrors.push(String(value));
 const reportRuntimePolicyViolation=event=>{
  if(runtimePolicyViolation)return;
  const directive=String(event.effectiveDirective||event.violatedDirective||'csp').trim().toLowerCase()||'csp';
  runtimePolicyViolation={axis:candidateExecutionStarted?'js':'html',capability:'runtime-csp-resource',directive};
  ${previewOnly?`parent.postMessage({type:'faultline:preview-policy-blocked',bootstrapId:${JSON.stringify(bootstrapId)},risk:runtimePolicyViolation},'*');`:''}
 };
 const blockedRuntimePolicy=sendResult=>{if(!runtimePolicyViolation)return false;sendResult({status:'UNRESOLVED',evidence:{reason:'UNSAFE_NETWORK',...runtimePolicyViolation}});return true;};
 const latestNavigationAttempt=()=>navigationAttempts.at(-1)||null;
 const reportNavigationAttempt=risk=>{
  const previous=latestNavigationAttempt();
  if(previous?.axis===risk.axis&&previous?.capability===risk.capability)return;
  navigationAttempts.push(risk);
  ${previewOnly?`parent.postMessage({type:'faultline:preview-navigation-blocked',bootstrapId:${JSON.stringify(bootstrapId)},risk},'*');`:''}
 };
 const formCanNavigate=(form,submitter)=>{
  if(!form||String(form.getAttribute?.('method')||form.method||'').toLowerCase()==='dialog')return false;
  return Boolean(form.noValidate||submitter?.formNoValidate||form.matches?.(':valid'));
 };
 const isSubmitControl=element=>{
  if(!element)return false;
  const tag=element.tagName;
  const type=String(element.getAttribute?.('type')||(tag==='BUTTON'?'submit':'')).toLowerCase();
  return tag==='BUTTON'?type==='submit':tag==='INPUT'&&(type==='submit'||type==='image');
 };
 const captureNavigationAttempt=event=>{
  const anchor=event.target?.closest?.('a[href],area[href]');
  if(anchor){
   const href=String(anchor.getAttribute('href')??'').trim();
   if(href&&!href.startsWith('#')){
    event.preventDefault();
    reportNavigationAttempt({axis:'html',capability:'anchor-navigation'});
    return;
   }
  }
  const submitter=event.target?.closest?.('button,input');
  const form=submitter?.form;
  if(!isSubmitControl(submitter)||!formCanNavigate(form,submitter))return;
  event.preventDefault();
  reportNavigationAttempt({axis:'html',capability:'form-navigation'});
 };
 const captureFormNavigationAttempt=event=>{
  const form=event.target;
  if(!(form instanceof HTMLFormElement)||!formCanNavigate(form,event.submitter))return;
  event.preventDefault();
  reportNavigationAttempt({axis:'html',capability:'form-navigation'});
 };
 HTMLFormElement.prototype.requestSubmit=function(submitter){
  if(String(this.getAttribute?.('method')||this.method||'').toLowerCase()==='dialog')return nativeFormRequestSubmit.call(this,submitter);
  const before=navigationAttempts.length;
  const canNavigate=formCanNavigate(this,submitter);
  const result=nativeFormRequestSubmit.call(this,submitter);
  if(canNavigate&&navigationAttempts.length===before)reportNavigationAttempt({axis:'html',capability:'form-navigation'});
  return result;
 };
 HTMLFormElement.prototype.submit=function(){
  if(String(this.getAttribute?.('method')||this.method||'').toLowerCase()==='dialog')return nativeFormSubmit.call(this);
  reportNavigationAttempt({axis:'html',capability:'form-navigation'});
 };
 const blockedNavigation=sendResult=>{const risk=latestNavigationAttempt();if(!risk)return false;sendResult({status:'UNRESOLVED',evidence:{reason:'UNSAFE_NAVIGATION',...risk}});return true;};
 addEventListener('click',captureNavigationAttempt,true);
 addEventListener('submit',captureFormNavigationAttempt,true);
 addEventListener('securitypolicyviolation',reportRuntimePolicyViolation,true);
 addEventListener('error',e=>{captureRuntimeError(e.error?.message??e.message??e.error??'runtime error');e.preventDefault()});
 addEventListener('unhandledrejection',e=>{captureRuntimeError(e.reason?.message??e.reason??'unhandled rejection');e.preventDefault()});
 const executeCandidate=()=>{candidateExecutionStarted=true;try{const script=document.createElement('script');script.textContent=candidateSource;document.body.appendChild(script);script.remove()}catch(e){captureRuntimeError(e&&e.message||e)}};
 const waitActionTurn=durationMs=>new Promise(resolve=>schedule(resolve,durationMs));
 const performAtomicAction=action=>{
  if(action?.kind==='click'){const target=querySelector(action.selector);if(!target)throw new Error('ACTION_TARGET_NOT_FOUND');target.click();return}
  if(action?.kind==='set_value'){
   const target=querySelector(action.selector);
   if(!target)throw new Error('ACTION_TARGET_NOT_FOUND');
   let prototype=target,valueDescriptor=null;
   while((prototype=Object.getPrototypeOf(prototype))&&!valueDescriptor)valueDescriptor=Object.getOwnPropertyDescriptor(prototype,'value');
   if(!valueDescriptor?.set)throw new Error('ACTION_TARGET_NOT_VALUE_CONTROL');
   valueDescriptor.set.call(target,String(action.value));
   target.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
   target.dispatchEvent(new Event('change',{bubbles:true}));
   return;
  }
  if(action?.kind==='set_checked'){
   const target=querySelector(action.selector);
   if(!target)throw new Error('ACTION_TARGET_NOT_FOUND');
   if(!(target instanceof NativeInputElement)||!['checkbox','radio'].includes(String(target.type).toLowerCase())||!nativeInputCheckedSetter)throw new Error('ACTION_TARGET_NOT_CHECKABLE');
   nativeInputCheckedSetter.call(target,Boolean(action.checked));
   nativeDispatchEvent.call(target,new NativeEvent('input',{bubbles:true,composed:true}));
   nativeDispatchEvent.call(target,new NativeEvent('change',{bubbles:true}));
  }
 };
 const performAction=async action=>{
  if(!action||action.kind==='none')return;
  if(action.kind!=='sequence'){performAtomicAction(action);return;}
  for(const step of action.steps){
   if(step.kind==='wait')await waitActionTurn(Number(step.durationMs));
   else {performAtomicAction(step);await waitActionTurn(0);}
   if(runtimePolicyViolation||latestNavigationAttempt())return;
  }
 };
 const measure=sendResult=>schedule(async()=>{try{
  if(blockedRuntimePolicy(sendResult)||blockedNavigation(sendResult))return;
  await performAction(o.action);
  if(blockedRuntimePolicy(sendResult)||blockedNavigation(sendResult))return;
  schedule(()=>{try{
   if(blockedRuntimePolicy(sendResult)||blockedNavigation(sendResult))return;
   let actual;
   if(o.kind==='runtime_error'){const expectedRuntime=o.equals!==undefined?String(o.equals):undefined;actual=expectedRuntime===undefined?(runtimeErrors.at(-1)??null):(runtimeErrors.find(message=>same(message,expectedRuntime))??runtimeErrors.at(-1)??null)}
   else {const el=querySelector(o.selector);if(o.kind==='dom_exists')actual=!!el;else if(o.kind==='dom_attribute')actual=el?el.getAttribute(o.property):undefined;else if(o.kind==='computed_style')actual=el?readComputedStyle(el)[o.property]:undefined;else actual=el?el[o.property]:undefined}
   const expected=o.kind==='computed_style'?String(o.equals):o.kind==='runtime_error'&&o.equals!==undefined?String(o.equals):o.equals;
   const fail=o.kind==='runtime_error'?(o.equals===undefined?Boolean(actual):same(actual,expected)):same(actual,expected);
   sendResult({status:fail?'FAIL':'PASS',evidence:{actual,expected,kind:o.kind,selector:o.selector,property:o.property}})
  }catch(e){sendResult({status:'UNRESOLVED',evidence:{reason:String(e&&e.message||e)}})}},Number(o.delayMs)||0)
 }catch(e){sendResult({status:'UNRESOLVED',evidence:{reason:String(e&&e.message||e)}})}},0);
 const start=()=>{${previewOnly&&!executePreview?'':'executeCandidate();'}if(send)measure(send)};
 if(resultChannel)parent.postMessage({type:'faultline:ready',bootstrapId:${JSON.stringify(bootstrapId)}},'*',[resultChannel.port2]);
 if(document.readyState==='loading')addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
<\/script></head><body>${c.html}</body></html>`;
}

function executeCase(c,{signal}={}){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(abortError());return;}
    const experiment=document.createElement('iframe');
    experiment.hidden=true;
    experiment.tabIndex=-1;
    experiment.setAttribute('aria-hidden','true');
    experiment.setAttribute('sandbox','allow-scripts');
    const previewPolicy=$('preview')?.getAttribute('csp');
    if(previewPolicy)experiment.setAttribute('csp',previewPolicy);
    const bootstrapId=crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;
    let done=false,resultPort=null;
    const timer=setTimeout(()=>finish({status:'UNRESOLVED',evidence:{reason:'HOST_TIMEOUT'}}),HOST_TIMEOUT_MS);
    const onReady=e=>{
      if(done||resultPort||e.source!==experiment.contentWindow||e.data?.type!=='faultline:ready'||e.data.bootstrapId!==bootstrapId||!e.ports?.[0])return;
      removeEventListener('message',onReady);
      resultPort=e.ports[0];
      resultPort.onmessage=event=>{
        const result=event.data;
        if(!result||!['PASS','FAIL','UNRESOLVED'].includes(result.status))return;
        finish({status:result.status,evidence:result.evidence||{}});
      };
      try{resultPort.start()}catch{}
    };
    const onAbort=()=>cancel();
    function cleanup(){clearTimeout(timer);removeEventListener('message',onReady);signal?.removeEventListener('abort',onAbort);if(resultPort){resultPort.onmessage=null;try{resultPort.close()}catch{}}experiment.remove();}
    function finish(result){if(done)return;done=true;cleanup();resolve(result);}
    function cancel(){if(done)return;done=true;cleanup();reject(abortError());}
    addEventListener('message',onReady);
    signal?.addEventListener('abort',onAbort,{once:true});
    document.body.appendChild(experiment);
    experiment.srcdoc=buildSandboxDocument(c,bootstrapId);
  });
}
function runCase(c=value(),{signal}={}){
  const snapshot=clone(c);
  const task=experimentQueue.then(()=>{
    throwIfAborted(signal);
    const risk=navigationRisk(snapshot);
    if(risk)return {status:'UNRESOLVED',evidence:{reason:'UNSAFE_NAVIGATION',...risk}};
    return executeCase(snapshot,{signal});
  });
  experimentQueue=task.then(()=>undefined,()=>undefined);
  return task;
}

function record(kind,result,extra={}){ const before=snapshotCanonical();const entry={kind,status:result.status,evidence:result.evidence||{},revision:revision(),at:new Date().toISOString(),...extra};rememberExperiment(entry);persistMutation(before);renderTrace();return entry; }
async function run({expectedRevision=revision()}={}, {signal}={}){ const testedRevision=expectedRevision;store.assertRevision(testedRevision);const r=await runCase(value(),{signal});throwIfAborted(signal);record('run',r,{revision:testedRevision});renderHealth(r.status);return {...r,testedRevision}; }
function inspect(){ const s=store.inspect(); return {revision:s.revision,case:s.value,pins:[...pins],captureProvenance:clone(captureProvenance),unitCounts:{html:unitsFor('html',s.value.html).length,css:unitsFor('css',s.value.css).length,js:unitsFor('js',s.value.js).length},latest:experimentLedger.at(-1)||null,webmcp:!!document.modelContext}; }
function units({targetAxis=axis}={}){
  if(!['html','css','js'].includes(targetAxis))throw new Error('INVALID_AXIS');
  const s=store.inspect();
  return {revision:s.revision,targetAxis,units:annotatedUnits(targetAxis,s.value[targetAxis]).map(unit=>({id:unit.id,kind:unit.kind,text:unit.text,parentId:unit.parentId,depth:unit.depth,pinned:unit.pinned,protectedByDescendant:unit.protectedByDescendant}))};
}
function commitCase(next,event,expectedRevision=revision()){ const before=snapshotCanonical();const result=store.commit(next,event,expectedRevision);rememberRevision(result.revision,{value:clone(result.value),pins:[...pins]});persistMutation(before);render();renderPreview();return inspect(); }
function defineOracle({expectedRevision=revision(),oracle}){ validateOracle(oracle);return commitCase({...value(),oracle:clone(oracle)},{kind:'define_oracle'},expectedRevision); }
function applySource({expectedRevision=revision(),targetAxis=axis,source}){ if(!['html','css','js'].includes(targetAxis))throw new Error('INVALID_AXIS'); return commitCase({...value(),[targetAxis]:String(source)},{kind:'source_edit',axis:targetAxis},expectedRevision); }
function loadCase({expectedRevision=revision(),case:nextCase}){
  validateCase(nextCase);
  store.assertRevision(expectedRevision);
  const before=snapshotCanonical();
  pins.clear();
  captureProvenance=null;
  const result=store.commit(clone(nextCase),{kind:'case_load'},expectedRevision);
  rememberRevision(result.revision,{value:clone(result.value),pins:[]});
  persistMutation(before);
  render();
  renderPreview();
  return inspect();
}
async function importCapture({expectedRevision=revision(),capture}, {signal}={}){
  const normalized=normalizeCaptureArtifact(capture);
  store.assertRevision(expectedRevision);
  throwIfAborted(signal);
  const baseline=await runCase(normalized.case,{signal});
  throwIfAborted(signal);
  store.assertRevision(expectedRevision);
  if(baseline.status==='PASS')throw new Error('CAPTURE_NOT_REPRODUCED');
  if(baseline.status!=='FAIL'){
    const reason=String(baseline.evidence?.reason||'UNRESOLVED').slice(0,160);
    throw new Error(`CAPTURE_UNRESOLVED:${reason}`);
  }
  const before=snapshotCanonical();
  pins.clear();
  const result=store.commit(clone(normalized.case),{kind:'capture_import',schema:CAPTURE_SCHEMA},expectedRevision);
  captureProvenance={...clone(normalized.provenance),importedAt:new Date().toISOString(),importedRevision:result.revision};
  rememberRevision(result.revision,{value:clone(result.value),pins:[],captureProvenance:clone(captureProvenance)});
  persistMutation(before);
  render();
  renderPreview();
  renderHealth('FAIL');
  return {status:'IMPORTED',revision:result.revision,baseline:clone(baseline),captureProvenance:clone(captureProvenance)};
}
function resetCase({expectedRevision=revision()}={}){ return loadCase({expectedRevision,case:fixture}); }
async function probe({expectedRevision=revision(),targetAxis=axis,unitId}, {signal}={}){ const testedRevision=expectedRevision;store.assertRevision(testedRevision);const source=value()[targetAxis];const unit=annotatedUnits(targetAxis,source).find(u=>u.id===unitId);if(!unit)throw new Error('UNIT_NOT_FOUND');if(unit.pinned||unit.protectedByDescendant)throw new Error('UNIT_PINNED');const candidate={...value(),[targetAxis]:removeUnits(source,[unit])};const result=await runCase(candidate,{signal});throwIfAborted(signal);record('probe',result,{axis:targetAxis,unitId,mutated:false,revision:testedRevision});return {...result,mutated:false,testedRevision,canonicalRevision:revision()}; }
function pin({expectedRevision=revision(),targetAxis=axis,unitId,pinned=true}){ store.assertRevision(expectedRevision);const unit=unitsFor(targetAxis).find(u=>u.id===unitId);if(!unit)throw new Error('UNIT_NOT_FOUND');const key=pinKey(targetAxis,unitId);const alreadyPinned=pins.has(key);if(alreadyPinned===pinned)return inspect();const before=snapshotCanonical();pinned?pins.add(key):pins.delete(key);const result=store.commit(value(),{kind:pinned?'pin':'unpin',axis:targetAxis,unitId},expectedRevision);rememberRevision(result.revision,{value:clone(result.value),pins:[...pins]});rememberExperiment({kind:pinned?'pin':'unpin',status:'OK',axis:targetAxis,unitId,revision:result.revision,at:new Date().toISOString()});persistMutation(before);render();return inspect(); }
async function reduce({expectedRevision=revision(),targetAxis=axis,maxTrials=80}={}, {signal}={}){
  store.assertRevision(expectedRevision);throwIfAborted(signal);
  const baseline=clone(value());
  const source=baseline[targetAxis],all=unitsFor(targetAxis,source);
  if(!all.length)return {status:'NO_UNITS',before:source.length,after:source.length,reduction:0,trials:0,removed:0,passes:0,revision:revision()};
  const pinDescriptors=capturePinDescriptors(targetAxis,source);
  let nextSource,reducedTrialCount,removedCount,passes=[];
  if(targetAxis==='html'||targetAxis==='css'){
    const reduced=await hierarchicalReduceSource(targetAxis,source,async candidateSource=>{throwIfAborted(signal);return (await runCase({...baseline,[targetAxis]:candidateSource},{signal})).status;},{maxTrials});
    nextSource=reduced.source;reducedTrialCount=reduced.trialCount;removedCount=reduced.removedCount;passes=reduced.passes;
  }else{
    const protectedItems=all.filter(unit=>pins.has(pinKey(targetAxis,unit.id)));
    const reduced=await ddminReduce(all,async kept=>{throwIfAborted(signal);const keptIds=new Set(kept.map(unit=>unit.id));const removed=all.filter(unit=>!keptIds.has(unit.id));return (await runCase({...baseline,[targetAxis]:removeUnits(source,removed)},{signal})).status;},{protectedItems,maxTrials});
    const keptIds=new Set(reduced.items.map(unit=>unit.id)),removed=all.filter(unit=>!keptIds.has(unit.id));
    nextSource=removeUnits(source,removed);reducedTrialCount=reduced.trialCount;removedCount=removed.length;
  }
  throwIfAborted(signal);
  const remappedPinIds=resolvePinDescriptors(targetAxis,nextSource,pinDescriptors);
  const final=await runCase({...baseline,[targetAxis]:nextSource},{signal});
  throwIfAborted(signal);if(final.status!=='FAIL')throw new Error('REDUCTION_LOST_FAILURE');
  store.assertRevision(expectedRevision);
  const beforeLength=source.length,after=nextSource.length,before=snapshotCanonical();
  const nextPins=new Set([...pins].filter(key=>!key.startsWith(`${targetAxis}|`)));
  for(const id of remappedPinIds)nextPins.add(pinKey(targetAxis,id));
  pins=nextPins;
  const committed=store.commit({...baseline,[targetAxis]:nextSource},{kind:'reduce',axis:targetAxis,trials:reducedTrialCount,removed:removedCount,passes:passes.length},expectedRevision);
  rememberRevision(committed.revision,{value:clone(committed.value),pins:[...pins]});
  rememberExperiment({kind:'reduce',status:final.status,evidence:final.evidence||{},revision:committed.revision,at:new Date().toISOString(),axis:targetAxis,trials:reducedTrialCount,removed:removedCount,passes:passes.length,reduction:beforeLength?1-after/beforeLength:0});
  persistMutation(before);render();renderPreview();renderHealth(final.status);
  return {status:final.status,before:beforeLength,after,reduction:beforeLength?1-after/beforeLength:0,trials:reducedTrialCount,removed:removedCount,passes:passes.length,revision:revision()};
}
function history({limit=100}={}){ return clone(experimentLedger.slice(-Math.max(1,Math.min(200,Number(limit)||100)))); }
function listRevisions({limit=MAX_RUNTIME_REVISIONS}={}){
  const bounded=Math.max(1,Math.min(MAX_RUNTIME_REVISIONS,Number(limit)||MAX_RUNTIME_REVISIONS));
  const events=new Map((store.inspect().history||[]).map(event=>[event.revision,event]));
  const currentRevision=revision();
  const items=[...revisions.entries()].reverse().slice(0,bounded).map(([rev,snapshot])=>{
    const c=snapshot?.value||{};
    const event=events.get(rev);
    return {
      revision:rev,
      current:rev===currentRevision,
      event:event?clone(event):null,
      summary:{
        htmlChars:String(c.html??'').length,
        cssChars:String(c.css??'').length,
        jsChars:String(c.js??'').length,
        oracleKind:c.oracle?.kind||null,
        pinCount:Array.isArray(snapshot?.pins)?snapshot.pins.length:0
      }
    };
  });
  return {currentRevision,retentionLimit:MAX_RUNTIME_REVISIONS,revisions:items};
}
function restore({expectedRevision=revision(),targetRevision}){ store.assertRevision(expectedRevision);const snap=revisions.get(targetRevision);if(!snap)throw new Error('REVISION_NOT_FOUND');const before=snapshotCanonical();pins=new Set(snap.pins||[]);captureProvenance=snap.captureProvenance?clone(snap.captureProvenance):null;const result=store.commit(snap.value,{kind:'restore',from:targetRevision},expectedRevision);rememberRevision(result.revision,{value:clone(result.value),pins:[...pins],captureProvenance:clone(captureProvenance)});persistMutation(before);render();renderPreview();return inspect(); }
function exportCase(){const c=value(),safeCss=String(c.css).replace(/<\/style/gi,'<\\/style');return `<!doctype html><html><head><meta charset="utf-8"><style>${safeCss}</style></head><body>${c.html}<script>${String(c.js).replace(/<\/script/gi,'<\\/script')}<\/script></body></html>`;}
function exportBundle(){return {schema:'faultline.export.v1',revision:revision(),case:clone(value()),standaloneHtml:exportCase(),captureProvenance:clone(captureProvenance),history:history({limit:200})};}
function validateAxes(axes){if(!Array.isArray(axes)||axes.length<1||axes.length>3||axes.some(targetAxis=>!['html','css','js'].includes(targetAxis))||new Set(axes).size!==axes.length)throw new Error('INVALID_AXES');return axes;}
async function autopilot({expectedRevision=revision(),axes=['html','css','js'],maxTrialsPerAxis=60}={}, {signal}={}){
  validateAxes(axes);store.assertRevision(expectedRevision);throwIfAborted(signal);
  const baseline=await run({expectedRevision},{signal});
  store.assertRevision(expectedRevision);
  if(baseline.status!=='FAIL')throw new Error('BASELINE_NOT_FAILING');
  const results=[];
  let ownedRevision=expectedRevision;
  for(const targetAxis of axes){
    throwIfAborted(signal);
    store.assertRevision(ownedRevision);
    const r=await reduce({expectedRevision:ownedRevision,targetAxis,maxTrials:maxTrialsPerAxis},{signal});
    ownedRevision=r.revision;
    results.push({axis:targetAxis,...r});
  }
  return {status:'COMPLETE',revision:ownedRevision,results};
}

function renderHealth(status){$('health').textContent=status;$('health').dataset.state=status;}
function renderTrace(){const list=$('trace');list.innerHTML='';for(const e of [...experimentLedger].reverse().slice(0,50)){const li=document.createElement('li');li.innerHTML=`<strong>${e.kind.toUpperCase()} · ${e.status}</strong><span>${e.revision} · ${new Date(e.at).toLocaleTimeString()}</span><code>${escapeHtml(JSON.stringify(e.evidence||{}))}</code>`;list.appendChild(li)}$('summary').textContent=experimentLedger.length?`${experimentLedger.length} evidence events · latest ${experimentLedger.at(-1).status}`:'No experiments yet.';}
function escapeHtml(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function renderUnits(){const list=$('units'),listed=units({targetAxis:axis}).units;list.innerHTML='';selectedUnitId=null;for(const unit of listed){const row=document.createElement('button');row.type='button';row.className='unit';row.dataset.unitId=unit.id;row.dataset.depth=String(unit.depth);row.setAttribute('aria-pressed','false');row.style.paddingInlineStart=`calc(12px + ${Math.min(unit.depth,6)} * 14px)`;const protection=unit.pinned?' · pinned':unit.protectedByDescendant?' · protected by pinned descendant':'';row.innerHTML=`<span>${escapeHtml(unit.text.trim().replace(/\s+/g,' ').slice(0,120))}</span><small>${unit.kind} · depth ${unit.depth}${protection}</small>`;row.onclick=()=>{document.querySelectorAll('.unit').forEach(x=>x.setAttribute('aria-pressed','false'));row.setAttribute('aria-pressed','true');selectedUnitId=unit.id;$('probe').disabled=unit.pinned||unit.protectedByDescendant;$('pin').disabled=false;};list.appendChild(row)}$('unit-count').textContent=`${listed.length} units`;}
function renderPreview(executePreview=false){const preview=$('preview');if(!preview)return;previewBootstrapId=crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;preview.srcdoc=buildSandboxDocument(value(),previewBootstrapId,{previewOnly:true,executePreview});}
function installPreviewRunner(){
  const toolbar=document.querySelector('.preview-toolbar');
  if(!toolbar||$('preview-run'))return;
  const button=document.createElement('button');
  button.id='preview-run';
  button.type='button';
  button.className='btn ghost';
  button.textContent='Run preview JS';
  button.setAttribute('aria-label','Run canonical JavaScript in isolated preview');
  button.style.marginLeft='auto';
  const label=toolbar.querySelector('.preview-label');
  if(label)label.style.marginLeft='0';
  button.onclick=()=>renderPreview(true);
  toolbar.appendChild(button);
}
function handlePreviewNavigationMessage(event){
  const preview=$('preview');
  if(!preview||event.source!==preview.contentWindow||event.data?.type!=='faultline:preview-navigation-blocked'||event.data.bootstrapId!==previewBootstrapId)return;
  const risk=event.data.risk||{};
  renderHealth('UNRESOLVED');
  $('summary').textContent=`UNSAFE_NAVIGATION · ${risk.axis||'html'} · ${risk.capability||'navigation'}`;
}
function handlePreviewPolicyMessage(event){
  const preview=$('preview');
  if(!preview||event.source!==preview.contentWindow||event.data?.type!=='faultline:preview-policy-blocked'||event.data.bootstrapId!==previewBootstrapId)return;
  const risk=event.data.risk||{};
  renderHealth('UNRESOLVED');
  $('summary').textContent=`UNSAFE_NETWORK · ${risk.axis||'js'} · ${risk.capability||'runtime-csp-resource'}${risk.directive?` · ${risk.directive}`:''}`;
}
addEventListener('message',handlePreviewNavigationMessage);
addEventListener('message',handlePreviewPolicyMessage);
function syncActionControls(){const kind=$('action-kind').value;$('action-selector').disabled=kind==='none'||kind==='sequence';$('action-value').disabled=kind!=='set_value';$('action-checked').disabled=kind!=='set_checked';$('action-sequence').disabled=kind!=='sequence';}
function render(){const s=inspect();$('revision').textContent=s.revision;document.querySelectorAll('[data-axis]').forEach(b=>{const active=b.dataset.axis===axis;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});$('source').value=s.case[axis];$('reduce').textContent=`Reduce ${axis.toUpperCase()}`;$('oracle-kind').value=s.case.oracle.kind;$('oracle-selector').value=s.case.oracle.selector||'';$('oracle-property').value=s.case.oracle.property||'';$('oracle-equals').value=String(s.case.oracle.equals??'');$('action-kind').value=s.case.oracle.action?.kind||'none';$('action-selector').value=s.case.oracle.action?.selector||'';$('action-value').value=s.case.oracle.action?.value??'';$('action-checked').value=String(s.case.oracle.action?.checked??true);$('action-sequence').value=s.case.oracle.action?.kind==='sequence'?JSON.stringify(s.case.oracle.action.steps,null,2):'';syncActionControls();renderUnits();renderTrace();persistBestEffort();}

const REVISION_PROPERTY={expectedRevision:{type:'string',pattern:'^r[1-9]\\d*$'}};
const REQUEST_PROPERTY={requestId:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'}};
const ACTION_STEP_SCHEMA={type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:ACTION_STEP_KINDS},selector:{type:'string'},value:{type:'string'},checked:{type:'boolean'},durationMs:{type:'number',minimum:0,maximum:MAX_SEQUENCE_WAIT_MS}},required:['kind']};
const ACTION_SCHEMA={type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:ACTION_KINDS},selector:{type:'string'},value:{type:'string'},checked:{type:'boolean'},steps:{type:'array',items:ACTION_STEP_SCHEMA,minItems:1,maxItems:8}},required:['kind']};
const ORACLE_SCHEMA={type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:ORACLE_KINDS},selector:{type:'string'},property:{type:'string'},equals:{},action:ACTION_SCHEMA,delayMs:{type:'number',minimum:0,maximum:2000}},required:['kind','action']};
const CASE_SCHEMA={type:'object',additionalProperties:false,properties:{html:{type:'string'},css:{type:'string'},js:{type:'string'},oracle:ORACLE_SCHEMA},required:['html','css','js','oracle']};
const CAPTURE_STRING={type:'string',maxLength:CAPTURE_LIMITS.sourceBytes};
const CAPTURE_METADATA_STRING={type:'string',maxLength:2048};
const CAPTURE_DIAGNOSTIC_ARRAY={type:'array',maxItems:CAPTURE_LIMITS.diagnosticsEntries,items:CAPTURE_METADATA_STRING};
const CAPTURE_ARTIFACT_SCHEMA={type:'object',additionalProperties:false,properties:{
 schema:{type:'string',enum:[CAPTURE_SCHEMA]},
 capturedAt:CAPTURE_METADATA_STRING,
 source:{type:'object',additionalProperties:false,properties:{url:CAPTURE_METADATA_STRING,title:CAPTURE_METADATA_STRING,html:CAPTURE_STRING,css:CAPTURE_STRING,js:CAPTURE_STRING},required:['html','css','js']},
 oracle:ORACLE_SCHEMA,
 environment:{type:'object',additionalProperties:true},
 provenance:{type:'object',additionalProperties:true,properties:{adapter:CAPTURE_METADATA_STRING},required:['adapter']},
 diagnostics:{type:'object',additionalProperties:false,properties:{externalDependencies:CAPTURE_DIAGNOSTIC_ARRAY,consoleErrors:CAPTURE_DIAGNOSTIC_ARRAY,pageErrors:CAPTURE_DIAGNOSTIC_ARRAY}}
},required:['schema','source','oracle','provenance']};
const TOOL_DEFS=[
 ['faultline_inspect','Inspect the canonical failure case, revision, pins and semantic-unit counts.',{},async()=>inspect(),true,true],
 ['faultline_units','List canonical semantic units with hierarchy, direct pin state, and ancestor protection for one source axis.',{targetAxis:{type:'string',enum:['html','css','js']}},async input=>units(input),true,true,['targetAxis']],
 ['faultline_load_case','Replace the complete canonical HTML, CSS, JavaScript and oracle in one optimistic revision.',{...REVISION_PROPERTY,case:CASE_SCHEMA},async input=>loadCase(input),false,true,['expectedRevision','case']],
 ['faultline_import_capture','Verify a portable Playwright capture in the deterministic sandbox and commit it only when the captured failure reproduces.',{...REVISION_PROPERTY,...REQUEST_PROPERTY,capture:CAPTURE_ARTIFACT_SCHEMA},async(input,options)=>importCapture(input,options),false,true,['expectedRevision','capture']],
 ['faultline_reset_case','Reset to the built-in fixture as one guarded canonical revision while preserving recoverable history.',{...REVISION_PROPERTY},async input=>resetCase(input),false,false,['expectedRevision']],
 ['faultline_run','Execute the locked deterministic failure oracle against the inspected canonical revision. Native WebMCP options.signal cancellation is supported; requestId is an optional compatibility handle for faultline_cancel_active.',{...REVISION_PROPERTY,...REQUEST_PROPERTY},async(input,options)=>run(input,options),false,true,['expectedRevision']],
 ['faultline_cancel_active','Cancel one active long-running FAULTLINE WebMCP operation by its caller-owned requestId without affecting unrelated work.',{...REQUEST_PROPERTY},async input=>cancelActiveWebMCP(input),false,false,['requestId']],
 ['faultline_define_oracle','Replace the deterministic failure oracle using an optimistic revision guard.',{...REVISION_PROPERTY,oracle:ORACLE_SCHEMA},async input=>defineOracle(input),false,true,['expectedRevision','oracle']],
 ['faultline_apply_source','Replace one canonical HTML, CSS, or JavaScript source axis using an optimistic revision guard.',{...REVISION_PROPERTY,targetAxis:{type:'string',enum:['html','css','js']},source:{type:'string'}},async input=>applySource(input),false,true,['expectedRevision','targetAxis','source']],
 ['faultline_probe','Test removing one semantic unit from the inspected canonical revision without mutating canonical state; the probe evidence trail is persisted. Native WebMCP options.signal cancellation is supported; requestId is optional.',{...REVISION_PROPERTY,...REQUEST_PROPERTY,targetAxis:{type:'string',enum:['html','css','js']},unitId:{type:'string'}},async(input,options)=>probe(input,options),false,true,['expectedRevision','targetAxis','unitId']],
 ['faultline_reduce','Delta-debug one source axis while preserving the failing oracle and rejecting stale revisions. Native WebMCP options.signal cancellation is supported; requestId is optional.',{...REVISION_PROPERTY,...REQUEST_PROPERTY,targetAxis:{type:'string',enum:['html','css','js']},maxTrials:{type:'integer',minimum:1,maximum:200}},async(input,options)=>reduce(input,options),false,false,['expectedRevision','targetAxis']],
 ['faultline_pin','Pin or unpin a semantic unit so reduction cannot remove it, guarded by canonical revision.',{...REVISION_PROPERTY,targetAxis:{type:'string',enum:['html','css','js']},unitId:{type:'string'},pinned:{type:'boolean'}},async input=>pin(input),false,true,['expectedRevision','targetAxis','unitId']],
 ['faultline_history','Read recent deterministic experiment evidence.',{limit:{type:'integer',minimum:1,maximum:200}},async input=>history(input),true,true],
 ['faultline_revisions','List bounded recoverable canonical revisions with mutation metadata for guarded restore.',{limit:{type:'integer',minimum:1,maximum:16}},async input=>listRevisions(input),true,false],
 ['faultline_restore','Restore a prior canonical revision only if the inspected current revision is still current.',{...REVISION_PROPERTY,targetRevision:{type:'string'}},async input=>restore(input),false,true,['expectedRevision','targetRevision']],
 ['faultline_export','Export the current case as a standalone HTML reproducer plus structured capture provenance.',{},async()=>({html:exportCase(),...exportBundle()}),true,true],
 ['faultline_autopilot','Run baseline verification and reduce the requested source axes sequentially from one inspected revision. Native WebMCP options.signal cancellation is supported; requestId is optional.',{...REVISION_PROPERTY,...REQUEST_PROPERTY,axes:{type:'array',items:{type:'string',enum:['html','css','js']},minItems:1,maxItems:3,uniqueItems:true},maxTrialsPerAxis:{type:'integer',minimum:1,maximum:200}},async(input,options)=>autopilot(input,options),false,false,['expectedRevision']]
];
function registerWebMCP(){const mc=document.modelContext;if(!mc?.registerTool){$('webmcp').textContent='WebMCP unavailable';return;}const controllers=[];Promise.all(TOOL_DEFS.map(async([name,description,properties,execute,readOnly,untrustedContent,required=[]])=>{const controller=new AbortController();controllers.push(controller);await mc.registerTool({name,title:name.replace('faultline_','FAULTLINE · '),description,inputSchema:{type:'object',properties,required,additionalProperties:false},execute:async(input,options)=>await (CANCELLABLE_WEBMCP_TOOLS.has(name)?executeWebMCPOperation(name,execute,input||{},options||{}):execute(input||{},options||{})),annotations:{readOnlyHint:readOnly,untrustedContentHint:untrustedContent}},{signal:controller.signal});})).then(()=>{$('webmcp').textContent=`WebMCP ready · ${TOOL_DEFS.length} tools`;$('webmcp').dataset.state='ready';}).catch(e=>{$('webmcp').textContent='WebMCP registration error';$('webmcp').title=String(e?.message||e);});window.addEventListener('pagehide',()=>{controllers.forEach(c=>c.abort());abortAllWebMCP();},{once:true});}

window.faultline={inspect,units,loadCase,importCapture,resetCase,run,defineOracle,applySource,probe,reduce,pin,history,revisions:listRevisions,restore,exportCase,exportBundle,autopilot,manifest:()=>TOOL_DEFS.map(([name,description,properties,,readOnly,untrustedContent,required=[]])=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},readOnly,annotations:{readOnlyHint:readOnly,untrustedContentHint:untrustedContent}}))};

document.querySelectorAll('[data-axis]').forEach(b=>b.onclick=()=>{axis=b.dataset.axis;render();});
$('apply').onclick=()=>applySource({source:$('source').value});
$('run').onclick=()=>run();
$('probe').onclick=()=>selectedUnitId&&probe({unitId:selectedUnitId}).then(r=>renderHealth(r.status));
$('pin').onclick=()=>{if(!selectedUnitId)return;const key=pinKey(axis,selectedUnitId);pin({unitId:selectedUnitId,pinned:!pins.has(key)});};
$('reduce').onclick=()=>reduce({targetAxis:axis}).then(r=>renderHealth(r.status)).catch(e=>{renderHealth('ERROR');$('summary').textContent=e.message;});
$('autopilot').onclick=()=>autopilot().then(()=>renderHealth('COMPLETE')).catch(e=>{renderHealth('ERROR');$('summary').textContent=e.message;});
$('action-kind').onchange=syncActionControls;
$('lock').onclick=()=>{const actionKind=$('action-kind').value;let action;if(actionKind==='sequence'){try{action={kind:'sequence',steps:JSON.parse($('action-sequence').value)}}catch{renderHealth('ERROR');$('summary').textContent='INVALID_ACTION_SEQUENCE_JSON';return;}}else{action={kind:actionKind,selector:$('action-selector').value};if(actionKind==='set_value')action.value=$('action-value').value;if(actionKind==='set_checked')action.checked=$('action-checked').value==='true';}const oracleKind=$('oracle-kind').value,rawEquals=$('oracle-equals').value,equals=oracleKind==='dom_attribute'?(rawEquals==='null'?null:rawEquals):normalizeExpected(rawEquals);try{defineOracle({oracle:{kind:oracleKind,selector:$('oracle-selector').value,property:$('oracle-property').value,equals,action,delayMs:0}})}catch(e){renderHealth('ERROR');$('summary').textContent=String(e?.message||e);}};
$('export').onclick=()=>{const a=document.createElement('a'),blob=new Blob([exportCase()],{type:'text/html'});a.href=URL.createObjectURL(blob);a.download='faultline-reproducer.html';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
$('reset').onclick=()=>resetCase({expectedRevision:revision()});
restoreLocal();rememberRevision(revision(),revisions.get(revision())||{value:clone(value()),pins:[...pins]});render();renderPreview();installPreviewRunner();registerWebMCP();