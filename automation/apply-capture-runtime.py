from pathlib import Path

path=Path('src/runtime.js')
text=path.read_text()

def replace(old,new,label):
    global text
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected exactly one anchor, found {count}')
    text=text.replace(old,new,1)

replace(
"import { navigationRisk } from './sandbox-policy.js';\n",
"import { navigationRisk } from './sandbox-policy.js';\nimport { CAPTURE_SCHEMA, normalizeCapture } from './capture.js';\n",
'import capture contract')
replace(
"let previewBootstrapId = null;\nconst activeWebMCPOperations",
"let previewBootstrapId = null;\nlet captureProvenance = null;\nconst activeWebMCPOperations",
'capture provenance state')
replace(
"const CANCELLABLE_WEBMCP_TOOLS = new Set(['faultline_run','faultline_probe','faultline_reduce','faultline_autopilot']);",
"const CANCELLABLE_WEBMCP_TOOLS = new Set(['faultline_run','faultline_probe','faultline_reduce','faultline_autopilot','faultline_import_capture']);",
'capture cancellation')
replace(
"const revisions = new Map([['r1',{value:clone(fixture),pins:[]}]]);",
"const revisions = new Map([['r1',{value:clone(fixture),pins:[],captureProvenance:null}]]);",
'initial provenance')
replace(
"function rememberRevision(rev,snapshot){ revisions.set(rev,clone(snapshot));trimRuntimeHistory(); }",
"function rememberRevision(rev,snapshot){ const next=clone(snapshot);if(!Object.hasOwn(next,'captureProvenance'))next.captureProvenance=clone(captureProvenance);revisions.set(rev,next);trimRuntimeHistory(); }",
'revision provenance')
replace(
"return {version:3,store:persistedStore,axis,pins:[...pins],experimentLedger:clone(experimentLedger.slice(-profile.experiments)),revisions:[...revisions.entries()].slice(-profile.runtimeRevisions).map(([rev,snapshot])=>[rev,clone(snapshot)])};",
"return {version:3,store:persistedStore,axis,pins:[...pins],captureProvenance:clone(captureProvenance),experimentLedger:clone(experimentLedger.slice(-profile.experiments)),revisions:[...revisions.entries()].slice(-profile.runtimeRevisions).map(([rev,snapshot])=>[rev,clone(snapshot)])};",
'persistence provenance')
replace(
"  pins=new Set(Array.isArray(snapshot.pins)?snapshot.pins:[]);\n  experimentLedger=",
"  pins=new Set(Array.isArray(snapshot.pins)?snapshot.pins:[]);\n  captureProvenance=clone(snapshot.captureProvenance??null);\n  experimentLedger=",
'restore canonical provenance')
replace(
"if(!revisions.has(revision())) revisions.set(revision(),{value:clone(value()),pins:[...pins]});\n  trimRuntimeHistory();",
"if(!revisions.has(revision())) revisions.set(revision(),{value:clone(value()),pins:[...pins],captureProvenance:clone(captureProvenance)});\n  trimRuntimeHistory();",
'restore canonical fallback provenance')
replace(
"      pins=new Set(Array.isArray(raw.pins)?raw.pins:[]);\n      experimentLedger=",
"      pins=new Set(Array.isArray(raw.pins)?raw.pins:[]);\n      captureProvenance=clone(raw.captureProvenance??null);\n      experimentLedger=",
'restore local provenance')
replace(
"if(!revisions.has(revision())) revisions.set(revision(),{value:clone(value()),pins:[...pins]});\n      trimRuntimeHistory();",
"if(!revisions.has(revision())) revisions.set(revision(),{value:clone(value()),pins:[...pins],captureProvenance:clone(captureProvenance)});\n      trimRuntimeHistory();",
'restore local fallback provenance')
replace(
"    pins=new Set(Array.isArray(legacy.pins)?legacy.pins:[]);\n    experimentLedger=",
"    pins=new Set(Array.isArray(legacy.pins)?legacy.pins:[]);\n    captureProvenance=null;\n    experimentLedger=",
'legacy provenance reset')
replace(
"function inspect(){ const s=store.inspect(); return {revision:s.revision,case:s.value,pins:[...pins],unitCounts:",
"function inspect(){ const s=store.inspect(); return {revision:s.revision,case:s.value,captureProvenance:clone(captureProvenance),pins:[...pins],unitCounts:",
'inspect provenance')
old_load="""function loadCase({expectedRevision=revision(),case:nextCase}){
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
"""
new_load="""function commitLoadedCase({expectedRevision,nextCase,kind,provenance=null}){
  validateCase(nextCase);
  store.assertRevision(expectedRevision);
  const before=snapshotCanonical();
  pins.clear();
  captureProvenance=clone(provenance);
  const result=store.commit(clone(nextCase),{kind},expectedRevision);
  rememberRevision(result.revision,{value:clone(result.value),pins:[],captureProvenance:clone(captureProvenance)});
  persistMutation(before);
  render();
  renderPreview();
  return inspect();
}
function loadCase({expectedRevision=revision(),case:nextCase}){ return commitLoadedCase({expectedRevision,nextCase,kind:'case_load',provenance:null}); }
async function importCapture({expectedRevision=revision(),capture},{signal}={}){
  store.assertRevision(expectedRevision);
  const normalized=normalizeCapture(capture);
  validateCase(normalized.case);
  throwIfAborted(signal);
  const baseline=await runCase(normalized.case,{signal});
  throwIfAborted(signal);
  store.assertRevision(expectedRevision);
  if(baseline.status!=='FAIL')throw new Error(`CAPTURE_BASELINE_${baseline.status}`);
  const state=commitLoadedCase({expectedRevision,nextCase:normalized.case,kind:'capture_import',provenance:normalized.provenance});
  return {baseline:clone(baseline),state};
}
function resetCase({expectedRevision=revision()}={}){ return loadCase({expectedRevision,case:fixture}); }
"""
replace(old_load,new_load,'transactional capture import')
replace(
"function restore({expectedRevision=revision(),targetRevision}){ store.assertRevision(expectedRevision);const snap=revisions.get(targetRevision);if(!snap)throw new Error('REVISION_NOT_FOUND');const before=snapshotCanonical();pins=new Set(snap.pins||[]);const result=store.commit(snap.value,{kind:'restore',from:targetRevision},expectedRevision);",
"function restore({expectedRevision=revision(),targetRevision}){ store.assertRevision(expectedRevision);const snap=revisions.get(targetRevision);if(!snap)throw new Error('REVISION_NOT_FOUND');const before=snapshotCanonical();pins=new Set(snap.pins||[]);captureProvenance=clone(snap.captureProvenance??null);const result=store.commit(snap.value,{kind:'restore',from:targetRevision},expectedRevision);",
'restore revision provenance')
replace(
"function exportCase(){const c=value(),safeCss=String(c.css).replace(/<\\/style/gi,'<\\\\/style');return `<!doctype html><html><head><meta charset=\"utf-8\"><style>${safeCss}</style></head><body>${c.html}<script>${String(c.js).replace(/<\\/script/gi,'<\\\\/script')}<\\/script></body></html>`;}\n",
"function exportCase(){const c=value(),safeCss=String(c.css).replace(/<\\/style/gi,'<\\\\/style');return `<!doctype html><html><head><meta charset=\"utf-8\"><style>${safeCss}</style></head><body>${c.html}<script>${String(c.js).replace(/<\\/script/gi,'<\\\\/script')}<\\/script></body></html>`;}\nfunction exportCapture(){if(!captureProvenance)throw new Error('CAPTURE_NOT_AVAILABLE');const c=value();return {schema:CAPTURE_SCHEMA,source:{html:c.html,css:c.css,js:c.js},oracle:clone(c.oracle),provenance:clone(captureProvenance),expectedStatus:'FAIL'};}\n",
'capture export')
replace(
"const CASE_SCHEMA={type:'object',additionalProperties:false,properties:{html:{type:'string'},css:{type:'string'},js:{type:'string'},oracle:ORACLE_SCHEMA},required:['html','css','js','oracle']};\nconst TOOL_DEFS=[",
"const CASE_SCHEMA={type:'object',additionalProperties:false,properties:{html:{type:'string'},css:{type:'string'},js:{type:'string'},oracle:ORACLE_SCHEMA},required:['html','css','js','oracle']};\nconst CAPTURE_PROVENANCE_SCHEMA={type:'object',additionalProperties:false,properties:{url:{type:'string'},title:{type:'string'},capturedAt:{type:'string'},userAgent:{type:'string'},label:{type:'string'}},required:['url','title','capturedAt','userAgent']};\nconst CAPTURE_ENVELOPE_SCHEMA={type:'object',additionalProperties:false,properties:{schema:{type:'string',const:CAPTURE_SCHEMA},source:{type:'object',additionalProperties:false,properties:{html:{type:'string'},css:{type:'string'},js:{type:'string'}},required:['html','css','js']},oracle:ORACLE_SCHEMA,provenance:CAPTURE_PROVENANCE_SCHEMA,expectedStatus:{type:'string',const:'FAIL'}},required:['schema','source','oracle','provenance','expectedStatus']};\nconst TOOL_DEFS=[",
'capture WebMCP schema')
replace(
" ['faultline_load_case','Replace the complete canonical HTML, CSS, JavaScript and oracle in one optimistic revision.',{...REVISION_PROPERTY,case:CASE_SCHEMA},async input=>loadCase(input),false,true,['expectedRevision','case']],\n",
" ['faultline_load_case','Replace the complete canonical HTML, CSS, JavaScript and oracle in one optimistic revision.',{...REVISION_PROPERTY,case:CASE_SCHEMA},async input=>loadCase(input),false,true,['expectedRevision','case']],\n ['faultline_import_capture','Baseline-verify and atomically import a faultline.capture.v1 envelope produced from a real browser failure. Native WebMCP options.signal cancellation is supported.',{...REVISION_PROPERTY,...REQUEST_PROPERTY,capture:CAPTURE_ENVELOPE_SCHEMA},async(input,options)=>importCapture(input,options),false,true,['expectedRevision','capture']],\n",
'capture WebMCP tool')
replace(
"window.faultline={inspect,units,loadCase,resetCase,run,defineOracle,applySource,probe,reduce,pin,history,revisions:listRevisions,restore,exportCase,autopilot,manifest:",
"window.faultline={inspect,units,loadCase,importCapture,resetCase,run,defineOracle,applySource,probe,reduce,pin,history,revisions:listRevisions,restore,exportCase,exportCapture,autopilot,manifest:",
'capture browser API')

path.write_text(text)
print('capture runtime patch applied with all exact anchors matched')
