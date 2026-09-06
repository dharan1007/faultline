import { semanticUnits, removeUnits, ddminReduce, createRevisionStore } from './reducer-engine.js';
import { navigationRisk } from './sandbox-policy.js';

const $ = id => document.getElementById(id);
const clone = v => JSON.parse(JSON.stringify(v));
const STORAGE_KEY = 'faultline-prod-v3';
const LEGACY_STORAGE_KEY = 'faultline-prod-v2';
const MAX_RUNTIME_REVISIONS = 16;
const MAX_EXPERIMENT_LEDGER = 200;
const ORACLE_KINDS=['dom_property','computed_style','dom_exists','runtime_error'];
const ACTION_KINDS=['none','click'];
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
let experimentQueue = Promise.resolve();
const revisions = new Map([['r1',{value:clone(fixture),pins:[]}]]);

function value(){ return store.inspect().value; }
function revision(){ return store.inspect().revision; }
function normalizeExpected(v){ const s=String(v); if(s==='true')return true;if(s==='false')return false;if(s==='null')return null;if(s==='undefined')return undefined;if(s!==''&&!Number.isNaN(Number(s)))return Number(s);return v; }
function unitsFor(targetAxis=axis, source=value()[targetAxis]){ return semanticUnits(targetAxis,source); }
function pinKey(targetAxis,unitId){ return `${targetAxis}|${unitId}`; }
function validRevisionEntry(entry){ return Array.isArray(entry)&&entry.length===2&&/^r[1-9]\d*$/.test(String(entry[0]))&&entry[1]?.value; }
function trimRuntimeHistory(){
  while(revisions.size>MAX_RUNTIME_REVISIONS){
    const oldest=revisions.keys().next().value;
    if(oldest===revision())break;
    revisions.delete(oldest);
  }
  if(experimentLedger.length>MAX_EXPERIMENT_LEDGER) experimentLedger.splice(0,experimentLedger.length-MAX_EXPERIMENT_LEDGER);
}
function rememberRevision(rev,snapshot){ revisions.set(rev,clone(snapshot));trimRuntimeHistory(); }
function rememberExperiment(entry){ experimentLedger.push(entry);trimRuntimeHistory();return entry; }
function abortError(){ return new DOMException('WebMCP execution aborted','AbortError'); }
function throwIfAborted(signal){ if(signal?.aborted)throw abortError(); }
function validateOracle(oracle){
  if(!oracle||typeof oracle!=='object'||Array.isArray(oracle))throw new Error('INVALID_ORACLE');
  const allowed=new Set(['kind','selector','property','equals','action','delayMs']);
  if(Object.keys(oracle).some(key=>!allowed.has(key))||!ORACLE_KINDS.includes(oracle.kind))throw new Error('INVALID_ORACLE');
  if(!oracle.action||typeof oracle.action!=='object'||Array.isArray(oracle.action))throw new Error('INVALID_ORACLE');
  if(Object.keys(oracle.action).some(key=>!['kind','selector'].includes(key))||!ACTION_KINDS.includes(oracle.action.kind))throw new Error('INVALID_ORACLE');
  if(oracle.action.kind==='click'&&typeof oracle.action.selector==='string'&&oracle.action.selector.trim()==='')throw new Error('INVALID_ORACLE');
  if(oracle.action.kind==='click'&&typeof oracle.action.selector!=='string')throw new Error('INVALID_ORACLE');
  if(oracle.kind!=='runtime_error'&&(typeof oracle.selector!=='string'||!oracle.selector.trim()))throw new Error('INVALID_ORACLE');
  if(['dom_property','computed_style'].includes(oracle.kind)&&(typeof oracle.property!=='string'||!oracle.property.trim()))throw new Error('INVALID_ORACLE');
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
function persistencePayload(){ trimRuntimeHistory();return {version:3,store:store.dump(),axis,pins:[...pins],experimentLedger:clone(experimentLedger),revisions:[...revisions.entries()].map(([rev,snapshot])=>[rev,clone(snapshot)])}; }
function snapshotCanonical(){ return clone(persistencePayload()); }
function restoreCanonical(snapshot){
  store=createRevisionStore(fixture,snapshot.store);
  axis=['html','css','js'].includes(snapshot.axis)?snapshot.axis:'html';
  pins=new Set(Array.isArray(snapshot.pins)?snapshot.pins:[]);
  experimentLedger=Array.isArray(snapshot.experimentLedger)?clone(snapshot.experimentLedger.slice(-MAX_EXPERIMENT_LEDGER)):[];
  revisions.clear();
  for(const entry of Array.isArray(snapshot.revisions)?snapshot.revisions.slice(-MAX_RUNTIME_REVISIONS):[]) if(validRevisionEntry(entry)) revisions.set(String(entry[0]),clone(entry[1]));
  if(!revisions.has(revision())) revisions.set(revision(),{value:clone(value()),pins:[...pins]});
  trimRuntimeHistory();
}
function writePersistence(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(persistencePayload())); }
function persistBestEffort(){ try{writePersistence();return true}catch{return false} }
function persistMutation(before){
  try{writePersistence();}
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
      revisions.clear();
      for(const entry of Array.isArray(raw.revisions)?raw.revisions.slice(-MAX_RUNTIME_REVISIONS):[]) if(validRevisionEntry(entry)) revisions.set(String(entry[0]),clone(entry[1]));
      if(!revisions.has(revision())) revisions.set(revision(),{value:clone(value()),pins:[...pins]});
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
    revisions.clear();
    rememberRevision(currentRevision,{value:clone(value()),pins:[...pins]});
    persistBestEffort();
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }catch{}
}

function buildSandboxDocument(c,bootstrapId,{previewOnly=false}={}){
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
 let runtimeError=null;
 addEventListener('error',e=>{runtimeError=String(e.message||e.error||'runtime error');e.preventDefault()});
 const executeCandidate=()=>{try{const script=document.createElement('script');script.textContent=candidateSource;document.body.appendChild(script);script.remove()}catch(e){runtimeError=String(e&&e.message||e)}};
 const measure=sendResult=>schedule(()=>{try{
  if(o.action?.kind==='click'){const target=querySelector(o.action.selector);if(!target)throw new Error('ACTION_TARGET_NOT_FOUND');target.click()}
  schedule(()=>{try{let actual;
   if(o.kind==='runtime_error'){actual=runtimeError}
   else {const el=querySelector(o.selector);if(o.kind==='dom_exists')actual=!!el;else if(o.kind==='computed_style')actual=el?readComputedStyle(el)[o.property]:undefined;else actual=el?el[o.property]:undefined}
   const expected=o.kind==='computed_style'?String(o.equals):o.equals;
   const fail=o.kind==='runtime_error'?Boolean(actual):same(actual,expected);
   sendResult({status:fail?'FAIL':'PASS',evidence:{actual,expected,kind:o.kind,selector:o.selector,property:o.property}})
  }catch(e){sendResult({status:'UNRESOLVED',evidence:{reason:String(e&&e.message||e)}})}},Number(o.delayMs)||0)
 }catch(e){sendResult({status:'UNRESOLVED',evidence:{reason:String(e&&e.message||e)}})}},0);
 const start=()=>{${previewOnly?'':'executeCandidate();'}if(send)measure(send)};
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
    const timer=setTimeout(()=>finish({status:'UNRESOLVED',evidence:{reason:'HOST_TIMEOUT'}}),2200);
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
async function run({expectedRevision=revision()}={}, {signal}={}){ const testedRevision=expectedRevision;store.assertRevision(testedRevision);const r=await runCase(value(),{signal});throwIfAborted(signal);record('run',r,{revision:testedRevision});renderHealth(r.status);return r; }
function inspect(){ const s=store.inspect(); return {revision:s.revision,case:s.value,pins:[...pins],unitCounts:{html:unitsFor('html',s.value.html).length,css:unitsFor('css',s.value.css).length,js:unitsFor('js',s.value.js).length},latest:experimentLedger.at(-1)||null,webmcp:!!document.modelContext}; }
function units({targetAxis=axis}={}){
  if(!['html','css','js'].includes(targetAxis))throw new Error('INVALID_AXIS');
  const s=store.inspect();
  return {revision:s.revision,targetAxis,units:unitsFor(targetAxis,s.value[targetAxis]).map(unit=>({id:unit.id,kind:unit.kind,text:unit.text,pinned:pins.has(pinKey(targetAxis,unit.id))}))};
}
function commitCase(next,event,expectedRevision=revision()){ const before=snapshotCanonical();const result=store.commit(next,event,expectedRevision);rememberRevision(result.revision,{value:clone(result.value),pins:[...pins]});persistMutation(before);render();renderPreview();return inspect(); }
function defineOracle({expectedRevision=revision(),oracle}){ validateOracle(oracle);return commitCase({...value(),oracle:clone(oracle)},{kind:'define_oracle'},expectedRevision); }
function applySource({expectedRevision=revision(),targetAxis=axis,source}){ if(!['html','css','js'].includes(targetAxis))throw new Error('INVALID_AXIS'); return commitCase({...value(),[targetAxis]:String(source)},{kind:'source_edit',axis:targetAxis},expectedRevision); }
function loadCase({expectedRevision=revision(),case:nextCase}){
  validateCase(nextCase);
  store.assertRevision(expectedRevision);
  const before=snapshotCanonical();
  pins.clear();
  const result=store.commit(clone(nextCase),{kind:'case_load'},expectedRevision);
  rememberRevision(result.revision,{value:clone(result.value),pins:[]});
  persistMutation(before);
  render();
  renderPreview();
  return inspect();
}
function resetCase({expectedRevision=revision()}={}){ return loadCase({expectedRevision,case:fixture}); }
async function probe({expectedRevision=revision(),targetAxis=axis,unitId}, {signal}={}){ const testedRevision=expectedRevision;store.assertRevision(testedRevision);const source=value()[targetAxis];const unit=unitsFor(targetAxis,source).find(u=>u.id===unitId);if(!unit)throw new Error('UNIT_NOT_FOUND');if(pins.has(pinKey(targetAxis,unitId)))throw new Error('UNIT_PINNED');const candidate={...value(),[targetAxis]:removeUnits(source,[unit])};const result=await runCase(candidate,{signal});throwIfAborted(signal);record('probe',result,{axis:targetAxis,unitId,mutated:false,revision:testedRevision});return {...result,mutated:false,canonicalRevision:revision()}; }
function pin({expectedRevision=revision(),targetAxis=axis,unitId,pinned=true}){ store.assertRevision(expectedRevision);const unit=unitsFor(targetAxis).find(u=>u.id===unitId);if(!unit)throw new Error('UNIT_NOT_FOUND');const key=pinKey(targetAxis,unitId);const alreadyPinned=pins.has(key);if(alreadyPinned===pinned)return inspect();const before=snapshotCanonical();pinned?pins.add(key):pins.delete(key);const result=store.commit(value(),{kind:pinned?'pin':'unpin',axis:targetAxis,unitId},expectedRevision);rememberRevision(result.revision,{value:clone(result.value),pins:[...pins]});rememberExperiment({kind:pinned?'pin':'unpin',status:'OK',axis:targetAxis,unitId,revision:result.revision,at:new Date().toISOString()});persistMutation(before);render();return inspect(); }
async function reduce({expectedRevision=revision(),targetAxis=axis,maxTrials=80}={}, {signal}={}){
  store.assertRevision(expectedRevision);throwIfAborted(signal);
  const baseline=clone(value());
  const source=baseline[targetAxis], all=unitsFor(targetAxis,source);
  if(!all.length) return {status:'NO_UNITS',before:source.length,after:source.length,reduction:0,trials:0,revision:revision()};
  const protectedItems=all.filter(u=>pins.has(pinKey(targetAxis,u.id)));
  const reduced=await ddminReduce(all,async kept=>{throwIfAborted(signal);const keptIds=new Set(kept.map(u=>u.id));const removed=all.filter(u=>!keptIds.has(u.id));return (await runCase({...baseline,[targetAxis]:removeUnits(source,removed)},{signal})).status;},{protectedItems,maxTrials});
  throwIfAborted(signal);
  const keptIds=new Set(reduced.items.map(u=>u.id));const removed=all.filter(u=>!keptIds.has(u.id));const nextSource=removeUnits(source,removed);const final=await runCase({...baseline,[targetAxis]:nextSource},{signal});
  throwIfAborted(signal);if(final.status!=='FAIL')throw new Error('REDUCTION_LOST_FAILURE');
  const beforeLength=source.length,after=nextSource.length,before=snapshotCanonical();
  const committed=store.commit({...baseline,[targetAxis]:nextSource},{kind:'reduce',axis:targetAxis,trials:reduced.trialCount,removed:removed.length},expectedRevision);
  rememberRevision(committed.revision,{value:clone(committed.value),pins:[...pins]});
  rememberExperiment({kind:'reduce',status:final.status,evidence:final.evidence||{},revision:committed.revision,at:new Date().toISOString(),axis:targetAxis,trials:reduced.trialCount,removed:removed.length,reduction:beforeLength?1-after/beforeLength:0});
  persistMutation(before);render();renderPreview();renderHealth(final.status);
  return {status:final.status,before:beforeLength,after,reduction:beforeLength?1-after/beforeLength:0,trials:reduced.trialCount,removed:removed.length,revision:revision()};
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
function restore({expectedRevision=revision(),targetRevision}){ store.assertRevision(expectedRevision);const snap=revisions.get(targetRevision);if(!snap)throw new Error('REVISION_NOT_FOUND');const before=snapshotCanonical();pins=new Set(snap.pins||[]);const result=store.commit(snap.value,{kind:'restore',from:targetRevision},expectedRevision);rememberRevision(result.revision,{value:clone(result.value),pins:[...pins]});persistMutation(before);render();renderPreview();return inspect(); }
function exportCase(){const c=value(),safeCss=String(c.css).replace(/<\/style/gi,'<\\/style');return `<!doctype html><html><head><meta charset="utf-8"><style>${safeCss}</style></head><body>${c.html}<script>${String(c.js).replace(/<\/script/gi,'<\\/script')}<\/script></body></html>`;}
async function autopilot({expectedRevision=revision(),axes=['html','css','js'],maxTrialsPerAxis=60}={}, {signal}={}){
  store.assertRevision(expectedRevision);throwIfAborted(signal);
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
function renderUnits(){const list=$('units'),units=unitsFor();list.innerHTML='';selectedUnitId=null;for(const unit of units){const row=document.createElement('button');row.type='button';row.className='unit';row.dataset.unitId=unit.id;row.setAttribute('aria-pressed','false');const pinned=pins.has(pinKey(axis,unit.id));row.innerHTML=`<span>${escapeHtml(unit.text.trim().replace(/\s+/g,' ').slice(0,120))}</span><small>${unit.kind}${pinned?' · pinned':''}</small>`;row.onclick=()=>{document.querySelectorAll('.unit').forEach(x=>x.setAttribute('aria-pressed','false'));row.setAttribute('aria-pressed','true');selectedUnitId=unit.id;$('probe').disabled=false;$('pin').disabled=false;};list.appendChild(row)}$('unit-count').textContent=`${units.length} units`;}
function renderPreview(){const preview=$('preview');if(!preview)return;preview.srcdoc=buildSandboxDocument(value(),'canonical-preview',{previewOnly:true});}
function render(){const s=inspect();$('revision').textContent=s.revision;document.querySelectorAll('[data-axis]').forEach(b=>{const active=b.dataset.axis===axis;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});$('source').value=s.case[axis];$('reduce').textContent=`Reduce ${axis.toUpperCase()}`;$('oracle-kind').value=s.case.oracle.kind;$('oracle-selector').value=s.case.oracle.selector||'';$('oracle-property').value=s.case.oracle.property||'';$('oracle-equals').value=String(s.case.oracle.equals??'');$('action-kind').value=s.case.oracle.action?.kind||'none';$('action-selector').value=s.case.oracle.action?.selector||'';renderUnits();renderTrace();persistBestEffort();}

const REVISION_PROPERTY={expectedRevision:{type:'string',pattern:'^r[1-9]\\d*$'}};
const ORACLE_SCHEMA={type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:ORACLE_KINDS},selector:{type:'string'},property:{type:'string'},equals:{},action:{type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:ACTION_KINDS},selector:{type:'string'}},required:['kind']},delayMs:{type:'number',minimum:0,maximum:2000}},required:['kind','action']};
const CASE_SCHEMA={type:'object',additionalProperties:false,properties:{html:{type:'string'},css:{type:'string'},js:{type:'string'},oracle:ORACLE_SCHEMA},required:['html','css','js','oracle']};
const TOOL_DEFS=[
 ['faultline_inspect','Inspect the canonical failure case, revision, pins and semantic-unit counts.',{},async()=>inspect(),true,true],
 ['faultline_units','List actionable semantic units and pin state for one canonical source axis.',{targetAxis:{type:'string',enum:['html','css','js']}},async input=>units(input),true,true,['targetAxis']],
 ['faultline_load_case','Replace the complete canonical HTML, CSS, JavaScript and oracle in one optimistic revision.',{...REVISION_PROPERTY,case:CASE_SCHEMA},async input=>loadCase(input),false,true,['expectedRevision','case']],
 ['faultline_reset_case','Reset to the built-in fixture as one guarded canonical revision while preserving recoverable history.',{...REVISION_PROPERTY},async input=>resetCase(input),false,false,['expectedRevision']],
 ['faultline_run','Execute the locked deterministic failure oracle against the inspected canonical revision.',{...REVISION_PROPERTY},async(input,options)=>run(input,options),false,true,['expectedRevision']],
 ['faultline_define_oracle','Replace the deterministic failure oracle using an optimistic revision guard.',{...REVISION_PROPERTY,oracle:ORACLE_SCHEMA},async input=>defineOracle(input),false,true,['expectedRevision','oracle']],
 ['faultline_apply_source','Replace one canonical HTML, CSS, or JavaScript source axis using an optimistic revision guard.',{...REVISION_PROPERTY,targetAxis:{type:'string',enum:['html','css','js']},source:{type:'string'}},async input=>applySource(input),false,true,['expectedRevision','targetAxis','source']],
 ['faultline_probe','Test removing one semantic unit from the inspected canonical revision without mutating canonical state.',{...REVISION_PROPERTY,targetAxis:{type:'string',enum:['html','css','js']},unitId:{type:'string'}},async(input,options)=>probe(input,options),true,true,['expectedRevision','targetAxis','unitId']],
 ['faultline_reduce','Delta-debug one source axis while preserving the failing oracle and rejecting stale revisions.',{...REVISION_PROPERTY,targetAxis:{type:'string',enum:['html','css','js']},maxTrials:{type:'integer',minimum:1,maximum:200}},async(input,options)=>reduce(input,options),false,false,['expectedRevision','targetAxis']],
 ['faultline_pin','Pin or unpin a semantic unit so reduction cannot remove it, guarded by canonical revision.',{...REVISION_PROPERTY,targetAxis:{type:'string',enum:['html','css','js']},unitId:{type:'string'},pinned:{type:'boolean'}},async input=>pin(input),false,true,['expectedRevision','targetAxis','unitId']],
 ['faultline_history','Read recent deterministic experiment evidence.',{limit:{type:'integer',minimum:1,maximum:200}},async input=>history(input),true,true],
 ['faultline_revisions','List bounded recoverable canonical revisions with mutation metadata for guarded restore.',{limit:{type:'integer',minimum:1,maximum:16}},async input=>listRevisions(input),true,false],
 ['faultline_restore','Restore a prior canonical revision only if the inspected current revision is still current.',{...REVISION_PROPERTY,targetRevision:{type:'string'}},async input=>restore(input),false,true,['expectedRevision','targetRevision']],
 ['faultline_export','Export the current case as a standalone HTML reproducer.',{},async()=>({html:exportCase()}),true,true],
 ['faultline_autopilot','Run baseline verification and reduce HTML, CSS and JS sequentially from one inspected revision.',{...REVISION_PROPERTY,maxTrialsPerAxis:{type:'integer',minimum:1,maximum:200}},async(input,options)=>autopilot(input,options),false,false,['expectedRevision']]
];
function registerWebMCP(){const mc=document.modelContext;if(!mc?.registerTool){$('webmcp').textContent='WebMCP unavailable';return;}const controllers=[];Promise.all(TOOL_DEFS.map(async([name,description,properties,execute,readOnly,untrustedContent,required=[]])=>{const controller=new AbortController();controllers.push(controller);await mc.registerTool({name,title:name.replace('faultline_','FAULTLINE · '),description,inputSchema:{type:'object',properties,required,additionalProperties:false},execute:async(input,options)=>JSON.stringify(await execute(input||{},options||{})),annotations:{readOnlyHint:readOnly,untrustedContentHint:untrustedContent}},{signal:controller.signal});})).then(()=>{$('webmcp').textContent=`WebMCP ready · ${TOOL_DEFS.length} tools`;$('webmcp').dataset.state='ready';}).catch(e=>{$('webmcp').textContent='WebMCP registration error';$('webmcp').title=String(e?.message||e);});window.addEventListener('pagehide',()=>controllers.forEach(c=>c.abort()),{once:true});}

window.faultline={inspect,units,loadCase,resetCase,run,defineOracle,applySource,probe,reduce,pin,history,revisions:listRevisions,restore,exportCase,autopilot,manifest:()=>TOOL_DEFS.map(([name,description,properties,,readOnly,untrustedContent,required=[]])=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},readOnly,annotations:{readOnlyHint:readOnly,untrustedContentHint:untrustedContent}}))};

document.querySelectorAll('[data-axis]').forEach(b=>b.onclick=()=>{axis=b.dataset.axis;render();});
$('apply').onclick=()=>applySource({source:$('source').value});
$('run').onclick=()=>run();
$('probe').onclick=()=>selectedUnitId&&probe({unitId:selectedUnitId}).then(r=>renderHealth(r.status));
$('pin').onclick=()=>{if(!selectedUnitId)return;const key=pinKey(axis,selectedUnitId);pin({unitId:selectedUnitId,pinned:!pins.has(key)});};
$('reduce').onclick=()=>reduce({targetAxis:axis}).then(r=>renderHealth(r.status)).catch(e=>{renderHealth('ERROR');$('summary').textContent=e.message;});
$('autopilot').onclick=()=>autopilot().then(()=>renderHealth('COMPLETE')).catch(e=>{renderHealth('ERROR');$('summary').textContent=e.message;});
$('lock').onclick=()=>defineOracle({oracle:{kind:$('oracle-kind').value,selector:$('oracle-selector').value,property:$('oracle-property').value,equals:normalizeExpected($('oracle-equals').value),action:{kind:$('action-kind').value,selector:$('action-selector').value},delayMs:0}});
$('export').onclick=()=>{const a=document.createElement('a'),blob=new Blob([exportCase()],{type:'text/html'});a.href=URL.createObjectURL(blob);a.download='faultline-reproducer.html';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
$('reset').onclick=()=>resetCase({expectedRevision:revision()});
restoreLocal();rememberRevision(revision(),revisions.get(revision())||{value:clone(value()),pins:[...pins]});render();renderPreview();registerWebMCP();
