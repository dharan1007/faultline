import { semanticUnits, removeUnits, ddminReduce, createRevisionStore } from './reducer-engine.js';

const $ = id => document.getElementById(id);
const clone = v => JSON.parse(JSON.stringify(v));
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
const revisions = new Map([['r1',{value:clone(fixture),pins:[]}]]);

function value(){ return store.inspect().value; }
function revision(){ return store.inspect().revision; }
function normalizeExpected(v){ const s=String(v); if(s==='true')return true;if(s==='false')return false;if(s==='null')return null;if(s==='undefined')return undefined;if(s!==''&&!Number.isNaN(Number(s)))return Number(s);return v; }
function unitsFor(targetAxis=axis, source=value()[targetAxis]){ return semanticUnits(targetAxis,source); }
function pinKey(targetAxis,unitId){ return `${targetAxis}|${unitId}`; }
function persist(){ try{ localStorage.setItem('faultline-prod-v2',JSON.stringify({state:store.inspect(),axis,pins:[...pins],experimentLedger})); }catch{} }
function restoreLocal(){ try{ const raw=JSON.parse(localStorage.getItem('faultline-prod-v2')); if(!raw?.state?.value)return; store=createRevisionStore(raw.state.value); axis=raw.axis||'html'; pins=new Set(raw.pins||[]); experimentLedger=raw.experimentLedger||[]; }catch{} }

function buildSandboxDocument(c,runId){
  const safeJs=String(c.js).replace(/<\/script/gi,'<\\/script');
  const oracle=JSON.stringify(c.oracle);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${c.css}</style></head><body>${c.html}<script>
let __faultlineRuntimeError=null;
addEventListener('error',e=>{__faultlineRuntimeError=String(e.message||e.error||'runtime error')});
try{${safeJs}}catch(e){__faultlineRuntimeError=String(e&&e.message||e)}
const o=${oracle};
setTimeout(()=>{try{
 if(o.action?.kind==='click'){const target=document.querySelector(o.action.selector);if(!target)throw new Error('ACTION_TARGET_NOT_FOUND');target.click()}
 setTimeout(()=>{try{let actual;
  if(o.kind==='runtime_error'){actual=__faultlineRuntimeError}
  else {const el=document.querySelector(o.selector);if(o.kind==='dom_exists')actual=!!el;else if(o.kind==='computed_style')actual=el?getComputedStyle(el)[o.property]:undefined;else actual=el?el[o.property]:undefined}
  const fail=o.kind==='runtime_error'?Boolean(actual):Object.is(actual,o.equals);
  parent.postMessage({type:'faultline:result',runId:${JSON.stringify(runId)},status:fail?'FAIL':'PASS',evidence:{actual,expected:o.equals,kind:o.kind,selector:o.selector,property:o.property}},'*')
 }catch(e){parent.postMessage({type:'faultline:result',runId:${JSON.stringify(runId)},status:'UNRESOLVED',evidence:{reason:String(e&&e.message||e)}},'*')}},Number(o.delayMs)||0)
}catch(e){parent.postMessage({type:'faultline:result',runId:${JSON.stringify(runId)},status:'UNRESOLVED',evidence:{reason:String(e&&e.message||e)}},'*')}},0)
<\/script></body></html>`;
}

function runCase(c=value()){
  return new Promise(resolve=>{
    const runId=crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;
    let done=false;
    const timer=setTimeout(()=>finish({status:'UNRESOLVED',evidence:{reason:'HOST_TIMEOUT'}}),2200);
    const onMessage=e=>{ if(e.data?.type==='faultline:result'&&e.data.runId===runId) finish({status:e.data.status,evidence:e.data.evidence||{}}); };
    function finish(result){ if(done)return;done=true;clearTimeout(timer);removeEventListener('message',onMessage);resolve(result); }
    addEventListener('message',onMessage);
    $('preview').srcdoc=buildSandboxDocument(c,runId);
  });
}

function record(kind,result,extra={}){ const entry={kind,status:result.status,evidence:result.evidence||{},revision:revision(),at:new Date().toISOString(),...extra};experimentLedger.push(entry);persist();renderTrace();return entry; }
async function run({expectedRevision}={}){ if(expectedRevision)store.assertRevision(expectedRevision);const r=await runCase();record('run',r);renderHealth(r.status);return r; }
function inspect(){ const s=store.inspect(); return {revision:s.revision,case:s.value,pins:[...pins],unitCounts:{html:unitsFor('html',s.value.html).length,css:unitsFor('css',s.value.css).length,js:unitsFor('js',s.value.js).length},latest:experimentLedger.at(-1)||null,webmcp:!!document.modelContext}; }
function commitCase(next,event,expectedRevision=revision()){ const result=store.commit(next,event,expectedRevision); revisions.set(result.revision,{value:clone(result.value),pins:[...pins]}); persist();render();return inspect(); }
function defineOracle({expectedRevision=revision(),oracle}){ return commitCase({...value(),oracle:clone(oracle)},{kind:'define_oracle'},expectedRevision); }
function applySource({expectedRevision=revision(),targetAxis=axis,source}){ if(!['html','css','js'].includes(targetAxis))throw new Error('INVALID_AXIS'); return commitCase({...value(),[targetAxis]:String(source)},{kind:'source_edit',axis:targetAxis},expectedRevision); }
async function probe({expectedRevision=revision(),targetAxis=axis,unitId}){ store.assertRevision(expectedRevision);const source=value()[targetAxis];const unit=unitsFor(targetAxis,source).find(u=>u.id===unitId);if(!unit)throw new Error('UNIT_NOT_FOUND');if(pins.has(pinKey(targetAxis,unitId)))throw new Error('UNIT_PINNED');const candidate={...value(),[targetAxis]:removeUnits(source,[unit])};const result=await runCase(candidate);record('probe',result,{axis:targetAxis,unitId,mutated:false});return {...result,mutated:false,canonicalRevision:revision()}; }
function pin({expectedRevision=revision(),targetAxis=axis,unitId,pinned=true}){ store.assertRevision(expectedRevision);const unit=unitsFor(targetAxis).find(u=>u.id===unitId);if(!unit)throw new Error('UNIT_NOT_FOUND');const key=pinKey(targetAxis,unitId);pinned?pins.add(key):pins.delete(key);experimentLedger.push({kind:pinned?'pin':'unpin',status:'OK',axis:targetAxis,unitId,revision:revision(),at:new Date().toISOString()});persist();render();return inspect(); }
async function reduce({expectedRevision=revision(),targetAxis=axis,maxTrials=80}={}){
  store.assertRevision(expectedRevision);
  const source=value()[targetAxis], all=unitsFor(targetAxis,source);
  if(!all.length) return {status:'NO_UNITS',before:source.length,after:source.length,reduction:0,trials:0,revision:revision()};
  const protectedItems=all.filter(u=>pins.has(pinKey(targetAxis,u.id)));
  const reduced=await ddminReduce(all,async kept=>{const keptIds=new Set(kept.map(u=>u.id));const removed=all.filter(u=>!keptIds.has(u.id));return (await runCase({...value(),[targetAxis]:removeUnits(source,removed)})).status;},{protectedItems,maxTrials});
  const keptIds=new Set(reduced.items.map(u=>u.id));const removed=all.filter(u=>!keptIds.has(u.id));const nextSource=removeUnits(source,removed);const final=await runCase({...value(),[targetAxis]:nextSource});
  if(final.status!=='FAIL')throw new Error('REDUCTION_LOST_FAILURE');
  const before=source.length,after=nextSource.length;commitCase({...value(),[targetAxis]:nextSource},{kind:'reduce',axis:targetAxis,trials:reduced.trialCount,removed:removed.length},expectedRevision);record('reduce',final,{axis:targetAxis,trials:reduced.trialCount,removed:removed.length,reduction:before?1-after/before:0});
  return {status:final.status,before,after,reduction:before?1-after/before:0,trials:reduced.trialCount,removed:removed.length,revision:revision()};
}
function history({limit=100}={}){ return clone(experimentLedger.slice(-Math.max(1,Math.min(200,Number(limit)||100)))); }
function restore({expectedRevision=revision(),targetRevision}){ store.assertRevision(expectedRevision);const snap=revisions.get(targetRevision);if(!snap)throw new Error('REVISION_NOT_FOUND');pins=new Set(snap.pins||[]);const result=store.commit(snap.value,{kind:'restore',from:targetRevision},expectedRevision);revisions.set(result.revision,{value:clone(result.value),pins:[...pins]});persist();render();return inspect(); }
function exportCase(){const c=value();return `<!doctype html><html><head><meta charset="utf-8"><style>${c.css}</style></head><body>${c.html}<script>${String(c.js).replace(/<\/script/gi,'<\\/script')}<\/script></body></html>`;}
async function autopilot({expectedRevision=revision(),axes=['html','css','js'],maxTrialsPerAxis=60}={}){store.assertRevision(expectedRevision);const baseline=await run({expectedRevision});if(baseline.status!=='FAIL')throw new Error('BASELINE_NOT_FAILING');const results=[];for(const targetAxis of axes){const beforeRevision=revision();const r=await reduce({expectedRevision:beforeRevision,targetAxis,maxTrials:maxTrialsPerAxis});results.push({axis:targetAxis,...r});}return {status:'COMPLETE',revision:revision(),results};}

function renderHealth(status){$('health').textContent=status;$('health').dataset.state=status;}
function renderTrace(){const list=$('trace');list.innerHTML='';for(const e of [...experimentLedger].reverse().slice(0,50)){const li=document.createElement('li');li.innerHTML=`<strong>${e.kind.toUpperCase()} · ${e.status}</strong><span>${e.revision} · ${new Date(e.at).toLocaleTimeString()}</span><code>${escapeHtml(JSON.stringify(e.evidence||{}))}</code>`;list.appendChild(li)}$('summary').textContent=experimentLedger.length?`${experimentLedger.length} evidence events · latest ${experimentLedger.at(-1).status}`:'No experiments yet.';}
function escapeHtml(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function renderUnits(){const list=$('units'),units=unitsFor();list.innerHTML='';selectedUnitId=null;for(const unit of units){const row=document.createElement('button');row.type='button';row.className='unit';row.dataset.unitId=unit.id;row.setAttribute('aria-pressed','false');const pinned=pins.has(pinKey(axis,unit.id));row.innerHTML=`<span>${escapeHtml(unit.text.trim().replace(/\s+/g,' ').slice(0,120))}</span><small>${unit.kind}${pinned?' · pinned':''}</small>`;row.onclick=()=>{document.querySelectorAll('.unit').forEach(x=>x.setAttribute('aria-pressed','false'));row.setAttribute('aria-pressed','true');selectedUnitId=unit.id;$('probe').disabled=false;$('pin').disabled=false;};list.appendChild(row)}$('unit-count').textContent=`${units.length} units`;}
function render(){const s=inspect();$('revision').textContent=s.revision;document.querySelectorAll('[data-axis]').forEach(b=>{const active=b.dataset.axis===axis;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});$('source').value=s.case[axis];$('reduce').textContent=`Reduce ${axis.toUpperCase()}`;$('oracle-kind').value=s.case.oracle.kind;$('oracle-selector').value=s.case.oracle.selector||'';$('oracle-property').value=s.case.oracle.property||'';$('oracle-equals').value=String(s.case.oracle.equals??'');$('action-kind').value=s.case.oracle.action?.kind||'none';$('action-selector').value=s.case.oracle.action?.selector||'';renderUnits();renderTrace();persist();}

const TOOL_DEFS=[
 ['faultline_inspect','Inspect the canonical failure case, revision, pins and semantic-unit counts.',{},async()=>inspect(),true],
 ['faultline_run','Execute the locked deterministic failure oracle against the canonical case.',{},async()=>run(),false],
 ['faultline_define_oracle','Replace the deterministic failure oracle.',{oracle:{type:'object'}},async({oracle})=>defineOracle({oracle}),false],
 ['faultline_probe','Test removing one semantic unit without mutating canonical state.',{targetAxis:{type:'string',enum:['html','css','js']},unitId:{type:'string'}},async input=>probe(input),true],
 ['faultline_reduce','Delta-debug one source axis while preserving the failing oracle.',{targetAxis:{type:'string',enum:['html','css','js']},maxTrials:{type:'integer',minimum:1,maximum:200}},async input=>reduce(input),false],
 ['faultline_pin','Pin or unpin a semantic unit so reduction cannot remove it.',{targetAxis:{type:'string',enum:['html','css','js']},unitId:{type:'string'},pinned:{type:'boolean'}},async input=>pin(input),false],
 ['faultline_history','Read recent deterministic experiment evidence.',{limit:{type:'integer',minimum:1,maximum:200}},async input=>history(input),true],
 ['faultline_restore','Restore a prior canonical revision.',{targetRevision:{type:'string'}},async input=>restore(input),false],
 ['faultline_export','Export the current case as a standalone HTML reproducer.',{},async()=>({html:exportCase()}),true],
 ['faultline_autopilot','Run baseline verification and reduce HTML, CSS and JS sequentially.',{maxTrialsPerAxis:{type:'integer',minimum:1,maximum:200}},async input=>autopilot(input),false]
];
function registerWebMCP(){const mc=document.modelContext;if(!mc?.registerTool){$('webmcp').textContent='WebMCP unavailable';return;}const controllers=[];Promise.all(TOOL_DEFS.map(async([name,description,properties,execute,readOnly])=>{const controller=new AbortController();controllers.push(controller);await mc.registerTool({name,title:name.replace('faultline_','FAULTLINE · '),description,inputSchema:{type:'object',properties,additionalProperties:false},execute:async input=>JSON.stringify(await execute(input||{})),annotations:{readOnlyHint:readOnly,untrustedContentHint:false}},{signal:controller.signal});})).then(()=>{$('webmcp').textContent=`WebMCP ready · ${TOOL_DEFS.length} tools`;$('webmcp').dataset.state='ready';}).catch(e=>{$('webmcp').textContent='WebMCP registration error';$('webmcp').title=String(e?.message||e);});window.addEventListener('pagehide',()=>controllers.forEach(c=>c.abort()),{once:true});}

window.faultline={inspect,run,defineOracle,applySource,probe,reduce,pin,history,restore,exportCase,autopilot,manifest:()=>TOOL_DEFS.map(([name,description,properties,,readOnly])=>({name,description,inputSchema:{type:'object',properties,additionalProperties:false},readOnly}))};

document.querySelectorAll('[data-axis]').forEach(b=>b.onclick=()=>{axis=b.dataset.axis;render();});
$('apply').onclick=()=>applySource({source:$('source').value});
$('run').onclick=()=>run();
$('probe').onclick=()=>selectedUnitId&&probe({unitId:selectedUnitId}).then(r=>renderHealth(r.status));
$('pin').onclick=()=>{if(!selectedUnitId)return;const key=pinKey(axis,selectedUnitId);pin({unitId:selectedUnitId,pinned:!pins.has(key)});};
$('reduce').onclick=()=>reduce({targetAxis:axis}).then(r=>renderHealth(r.status)).catch(e=>{renderHealth('ERROR');$('summary').textContent=e.message;});
$('autopilot').onclick=()=>autopilot().then(()=>renderHealth('COMPLETE')).catch(e=>{renderHealth('ERROR');$('summary').textContent=e.message;});
$('lock').onclick=()=>defineOracle({oracle:{kind:$('oracle-kind').value,selector:$('oracle-selector').value,property:$('oracle-property').value,equals:normalizeExpected($('oracle-equals').value),action:{kind:$('action-kind').value,selector:$('action-selector').value},delayMs:0}});
$('export').onclick=()=>{const a=document.createElement('a'),blob=new Blob([exportCase()],{type:'text/html'});a.href=URL.createObjectURL(blob);a.download='faultline-reproducer.html';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
$('reset').onclick=()=>{store=createRevisionStore(fixture);pins.clear();experimentLedger=[];axis='html';revisions.clear();revisions.set('r1',{value:clone(fixture),pins:[]});render();};
restoreLocal();revisions.set(revision(),{value:clone(value()),pins:[...pins]});render();registerWebMCP();$('preview').srcdoc=buildSandboxDocument(value(),'initial-preview');
