import { readFileSync, writeFileSync } from 'node:fs';

const path='src/runtime.js';
let source=readFileSync(path,'utf8');
const replace=(from,to,label)=>{
  if(!source.includes(from))throw new Error(`PATCH_PRECONDITION_FAILED:${label}`);
  source=source.replace(from,to);
};

replace(
"import { navigationRisk } from './sandbox-policy.js';",
"import { navigationRisk } from './sandbox-policy.js';\nimport { CAPTURE_SCHEMA, CAPTURE_LIMITS, normalizeCaptureArtifact } from './capture-contract.js';",
'import-capture-contract');

replace(
"let experimentLedger = [];\nlet experimentQueue = Promise.resolve();",
"let experimentLedger = [];\nlet captureProvenance = null;\nlet experimentQueue = Promise.resolve();",
'capture-provenance-state');

replace(
"const CANCELLABLE_WEBMCP_TOOLS = new Set(['faultline_run','faultline_probe','faultline_reduce','faultline_autopilot']);\nconst revisions = new Map([['r1',{value:clone(fixture),pins:[]}]]);",
"const CANCELLABLE_WEBMCP_TOOLS = new Set(['faultline_run','faultline_probe','faultline_reduce','faultline_autopilot','faultline_import_capture']);\nconst revisions = new Map([['r1',{value:clone(fixture),pins:[],captureProvenance:null}]]);",
'cancellable-import-and-initial-provenance');

replace(
"function rememberRevision(rev,snapshot){ revisions.set(rev,clone(snapshot));trimRuntimeHistory(); }",
"function rememberRevision(rev,snapshot){ const next=clone(snapshot);if(!Object.hasOwn(next,'captureProvenance'))next.captureProvenance=clone(captureProvenance);revisions.set(rev,next);trimRuntimeHistory(); }",
'revision-provenance');

replace(
"return {version:3,store:persistedStore,axis,pins:[...pins],experimentLedger:clone(experimentLedger.slice(-profile.experiments)),revisions:[...revisions.entries()].slice(-profile.runtimeRevisions).map(([rev,snapshot])=>[rev,clone(snapshot)])};",
"return {version:3,store:persistedStore,axis,pins:[...pins],experimentLedger:clone(experimentLedger.slice(-profile.experiments)),captureProvenance:clone(captureProvenance),revisions:[...revisions.entries()].slice(-profile.runtimeRevisions).map(([rev,snapshot])=>[rev,clone(snapshot)])};",
'persistence-provenance');

replace(
"  experimentLedger=Array.isArray(snapshot.experimentLedger)?clone(snapshot.experimentLedger.slice(-MAX_EXPERIMENT_LEDGER)):[];\n  revisions.clear();",
"  experimentLedger=Array.isArray(snapshot.experimentLedger)?clone(snapshot.experimentLedger.slice(-MAX_EXPERIMENT_LEDGER)):[];\n  captureProvenance=snapshot.captureProvenance?clone(snapshot.captureProvenance):null;\n  revisions.clear();",
'restore-canonical-provenance');

replace(
"  if(!revisions.has(revision())) revisions.set(revision(),{value:clone(value()),pins:[...pins]});",
"  if(!revisions.has(revision())) revisions.set(revision(),{value:clone(value()),pins:[...pins],captureProvenance:clone(captureProvenance)});",
'restore-canonical-current-revision');

replace(
"      experimentLedger=Array.isArray(raw.experimentLedger)?raw.experimentLedger.slice(-MAX_EXPERIMENT_LEDGER):[];\n      revisions.clear();",
"      experimentLedger=Array.isArray(raw.experimentLedger)?raw.experimentLedger.slice(-MAX_EXPERIMENT_LEDGER):[];\n      captureProvenance=raw.captureProvenance?clone(raw.captureProvenance):null;\n      revisions.clear();",
'restore-local-provenance');

replace(
"      if(!revisions.has(revision())) revisions.set(revision(),{value:clone(value()),pins:[...pins]});",
"      if(!revisions.has(revision())) revisions.set(revision(),{value:clone(value()),pins:[...pins],captureProvenance:clone(captureProvenance)});",
'restore-local-current-revision');

replace(
"    experimentLedger=Array.isArray(legacy.experimentLedger)?legacy.experimentLedger.slice(-MAX_EXPERIMENT_LEDGER):[];\n    revisions.clear();",
"    experimentLedger=Array.isArray(legacy.experimentLedger)?legacy.experimentLedger.slice(-MAX_EXPERIMENT_LEDGER):[];\n    captureProvenance=null;\n    revisions.clear();",
'legacy-provenance');

replace(
"function inspect(){ const s=store.inspect(); return {revision:s.revision,case:s.value,pins:[...pins],unitCounts:{html:unitsFor('html',s.value.html).length,css:unitsFor('css',s.value.css).length,js:unitsFor('js',s.value.js).length},latest:experimentLedger.at(-1)||null,webmcp:!!document.modelContext}; }",
"function inspect(){ const s=store.inspect(); return {revision:s.revision,case:s.value,pins:[...pins],captureProvenance:clone(captureProvenance),unitCounts:{html:unitsFor('html',s.value.html).length,css:unitsFor('css',s.value.css).length,js:unitsFor('js',s.value.js).length},latest:experimentLedger.at(-1)||null,webmcp:!!document.modelContext}; }",
'inspect-provenance');

replace(
"  const before=snapshotCanonical();\n  pins.clear();\n  const result=store.commit(clone(nextCase),{kind:'case_load'},expectedRevision);",
"  const before=snapshotCanonical();\n  pins.clear();\n  captureProvenance=null;\n  const result=store.commit(clone(nextCase),{kind:'case_load'},expectedRevision);",
'manual-load-clears-provenance');

replace(
"function resetCase({expectedRevision=revision()}={}){ return loadCase({expectedRevision,case:fixture}); }",
`async function importCapture({expectedRevision=revision(),capture}, {signal}={}){
  const normalized=normalizeCaptureArtifact(capture);
  store.assertRevision(expectedRevision);
  throwIfAborted(signal);
  const baseline=await runCase(normalized.case,{signal});
  throwIfAborted(signal);
  store.assertRevision(expectedRevision);
  if(baseline.status==='PASS')throw new Error('CAPTURE_NOT_REPRODUCED');
  if(baseline.status!=='FAIL'){
    const reason=String(baseline.evidence?.reason||'UNRESOLVED').slice(0,160);
    throw new Error(\`CAPTURE_UNRESOLVED:\${reason}\`);
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
function resetCase({expectedRevision=revision()}={}){ return loadCase({expectedRevision,case:fixture}); }`,
'capture-import');

replace(
"function restore({expectedRevision=revision(),targetRevision}){ store.assertRevision(expectedRevision);const snap=revisions.get(targetRevision);if(!snap)throw new Error('REVISION_NOT_FOUND');const before=snapshotCanonical();pins=new Set(snap.pins||[]);const result=store.commit(snap.value,{kind:'restore',from:targetRevision},expectedRevision);rememberRevision(result.revision,{value:clone(result.value),pins:[...pins]});persistMutation(before);render();renderPreview();return inspect(); }\nfunction exportCase(){",
"function restore({expectedRevision=revision(),targetRevision}){ store.assertRevision(expectedRevision);const snap=revisions.get(targetRevision);if(!snap)throw new Error('REVISION_NOT_FOUND');const before=snapshotCanonical();pins=new Set(snap.pins||[]);captureProvenance=snap.captureProvenance?clone(snap.captureProvenance):null;const result=store.commit(snap.value,{kind:'restore',from:targetRevision},expectedRevision);rememberRevision(result.revision,{value:clone(result.value),pins:[...pins],captureProvenance:clone(captureProvenance)});persistMutation(before);render();renderPreview();return inspect(); }\nfunction exportCase(){",
'restore-provenance');

replace(
"function validateAxes(axes){",
"function exportBundle(){return {schema:'faultline.export.v1',revision:revision(),case:clone(value()),standaloneHtml:exportCase(),captureProvenance:clone(captureProvenance),history:history({limit:200})};}\nfunction validateAxes(axes){",
'export-bundle');

replace(
"const CASE_SCHEMA={type:'object',additionalProperties:false,properties:{html:{type:'string'},css:{type:'string'},js:{type:'string'},oracle:ORACLE_SCHEMA},required:['html','css','js','oracle']};",
`const CASE_SCHEMA={type:'object',additionalProperties:false,properties:{html:{type:'string'},css:{type:'string'},js:{type:'string'},oracle:ORACLE_SCHEMA},required:['html','css','js','oracle']};
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
},required:['schema','source','oracle','provenance']};`,
'capture-schema');

replace(
" ['faultline_load_case','Replace the complete canonical HTML, CSS, JavaScript and oracle in one optimistic revision.',{...REVISION_PROPERTY,case:CASE_SCHEMA},async input=>loadCase(input),false,true,['expectedRevision','case']],",
" ['faultline_load_case','Replace the complete canonical HTML, CSS, JavaScript and oracle in one optimistic revision.',{...REVISION_PROPERTY,case:CASE_SCHEMA},async input=>loadCase(input),false,true,['expectedRevision','case']],\n ['faultline_import_capture','Verify a portable Playwright capture in the deterministic sandbox and commit it only when the captured failure reproduces.',{...REVISION_PROPERTY,...REQUEST_PROPERTY,capture:CAPTURE_ARTIFACT_SCHEMA},async(input,options)=>importCapture(input,options),false,true,['expectedRevision','capture']],",
'capture-webmcp-tool');

replace(
" ['faultline_export','Export the current case as a standalone HTML reproducer.',{},async()=>({html:exportCase()}),true,true],",
" ['faultline_export','Export the current case as a standalone HTML reproducer plus structured capture provenance.',{},async()=>({html:exportCase(),...exportBundle()}),true,true],",
'provenance-export-tool');

replace(
"window.faultline={inspect,units,loadCase,resetCase,run,defineOracle,applySource,probe,reduce,pin,history,revisions:listRevisions,restore,exportCase,autopilot,manifest:",
"window.faultline={inspect,units,loadCase,importCapture,resetCase,run,defineOracle,applySource,probe,reduce,pin,history,revisions:listRevisions,restore,exportCase,exportBundle,autopilot,manifest:",
'public-capture-api');

writeFileSync(path,source);
console.log('capture runtime patch applied');
