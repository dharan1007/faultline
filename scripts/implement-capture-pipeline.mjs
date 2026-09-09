import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

function edit(path,transform){
  const before=readFileSync(path,'utf8');
  const after=transform(before);
  if(after===before)throw new Error(`NO_CHANGE:${path}`);
  writeFileSync(path,after);
}
function replaceOne(source,needle,replacement,label){
  const count=source.split(needle).length-1;
  if(count!==1)throw new Error(`ANCHOR_${label}:${count}`);
  return source.replace(needle,replacement);
}

edit('src/runtime.js',source=>{
  source=replaceOne(source,
    "import { navigationRisk } from './sandbox-policy.js';",
    "import { navigationRisk } from './sandbox-policy.js';\nimport { createCaptureV1, normalizeCaptureV1 } from './capture-format.js';",
    'runtime_import');
  source=replaceOne(source,
    "let previewBootstrapId = null;\nconst activeWebMCPOperations = new Map();",
    "let previewBootstrapId = null;\nlet captureMetadata = null;\nconst activeWebMCPOperations = new Map();",
    'capture_state');
  source=replaceOne(source,
    "const CANCELLABLE_WEBMCP_TOOLS = new Set(['faultline_run','faultline_probe','faultline_reduce','faultline_autopilot']);",
    "const CANCELLABLE_WEBMCP_TOOLS = new Set(['faultline_run','faultline_probe','faultline_reduce','faultline_autopilot','faultline_import_capture']);",
    'cancellable');
  source=replaceOne(source,
    "function rememberRevision(rev,snapshot){ revisions.set(rev,clone(snapshot));trimRuntimeHistory(); }",
    "function rememberRevision(rev,snapshot){ const withCapture={...snapshot,captureMetadata:snapshot?.captureMetadata===undefined?clone(captureMetadata):clone(snapshot.captureMetadata)};revisions.set(rev,clone(withCapture));trimRuntimeHistory(); }",
    'remember_revision');
  source=replaceOne(source,
    "return {version:3,store:persistedStore,axis,pins:[...pins],experimentLedger:clone(experimentLedger.slice(-profile.experiments)),revisions:[...revisions.entries()].slice(-profile.runtimeRevisions).map(([rev,snapshot])=>[rev,clone(snapshot)])};",
    "return {version:3,store:persistedStore,axis,pins:[...pins],captureMetadata:clone(captureMetadata),experimentLedger:clone(experimentLedger.slice(-profile.experiments)),revisions:[...revisions.entries()].slice(-profile.runtimeRevisions).map(([rev,snapshot])=>[rev,clone(snapshot)])};",
    'persistence_payload');
  source=replaceOne(source,
    "  experimentLedger=Array.isArray(snapshot.experimentLedger)?clone(snapshot.experimentLedger.slice(-MAX_EXPERIMENT_LEDGER)):[];\n  revisions.clear();",
    "  experimentLedger=Array.isArray(snapshot.experimentLedger)?clone(snapshot.experimentLedger.slice(-MAX_EXPERIMENT_LEDGER)):[];\n  captureMetadata=snapshot.captureMetadata?clone(snapshot.captureMetadata):null;\n  revisions.clear();",
    'restore_capture');
  source=replaceOne(source,
    "      experimentLedger=Array.isArray(raw.experimentLedger)?raw.experimentLedger.slice(-MAX_EXPERIMENT_LEDGER):[];\n      revisions.clear();",
    "      experimentLedger=Array.isArray(raw.experimentLedger)?raw.experimentLedger.slice(-MAX_EXPERIMENT_LEDGER):[];\n      captureMetadata=raw.captureMetadata?clone(raw.captureMetadata):null;\n      revisions.clear();",
    'restore_local_capture');
  source=replaceOne(source,
    "    experimentLedger=Array.isArray(legacy.experimentLedger)?legacy.experimentLedger.slice(-MAX_EXPERIMENT_LEDGER):[];\n    revisions.clear();",
    "    experimentLedger=Array.isArray(legacy.experimentLedger)?legacy.experimentLedger.slice(-MAX_EXPERIMENT_LEDGER):[];\n    captureMetadata=null;\n    revisions.clear();",
    'legacy_capture');
  source=replaceOne(source,
    "function inspect(){ const s=store.inspect(); return {revision:s.revision,case:s.value,pins:[...pins],unitCounts:{html:unitsFor('html',s.value.html).length,css:unitsFor('css',s.value.css).length,js:unitsFor('js',s.value.js).length},latest:experimentLedger.at(-1)||null,webmcp:!!document.modelContext}; }",
    "function inspect(){ const s=store.inspect(); return {revision:s.revision,case:s.value,pins:[...pins],captureProvenance:captureMetadata?clone(captureMetadata):null,unitCounts:{html:unitsFor('html',s.value.html).length,css:unitsFor('css',s.value.css).length,js:unitsFor('js',s.value.js).length},latest:experimentLedger.at(-1)||null,webmcp:!!document.modelContext}; }",
    'inspect_capture');
  source=replaceOne(source,
    "function loadCase({expectedRevision=revision(),case:nextCase}){\n  validateCase(nextCase);\n  store.assertRevision(expectedRevision);\n  const before=snapshotCanonical();\n  pins.clear();\n  const result=store.commit(clone(nextCase),{kind:'case_load'},expectedRevision);\n  rememberRevision(result.revision,{value:clone(result.value),pins:[]});\n  persistMutation(before);\n  render();\n  renderPreview();\n  return inspect();\n}",
    "function loadCase({expectedRevision=revision(),case:nextCase}){\n  validateCase(nextCase);\n  store.assertRevision(expectedRevision);\n  const before=snapshotCanonical();\n  pins.clear();\n  captureMetadata=null;\n  const result=store.commit(clone(nextCase),{kind:'case_load'},expectedRevision);\n  rememberRevision(result.revision,{value:clone(result.value),pins:[],captureMetadata:null});\n  persistMutation(before);\n  render();\n  renderPreview();\n  return inspect();\n}\nasync function importCapture({expectedRevision=revision(),capture}={}, {signal}={}){\n  const normalized=normalizeCaptureV1(capture);\n  if(normalized.metadata.unresolvedResources.length)throw new Error('CAPTURE_UNRESOLVED_RESOURCES');\n  validateCase(normalized.case);\n  store.assertRevision(expectedRevision);\n  throwIfAborted(signal);\n  const baseline=await runCase(normalized.case,{signal});\n  throwIfAborted(signal);\n  store.assertRevision(expectedRevision);\n  if(baseline.status==='PASS')throw new Error('CAPTURE_BASELINE_NOT_FAILING');\n  if(baseline.status!=='FAIL')throw new Error('CAPTURE_BASELINE_UNRESOLVED');\n  const before=snapshotCanonical();\n  pins.clear();\n  captureMetadata=clone(normalized.metadata);\n  const result=store.commit(clone(normalized.case),{kind:'capture_import',source:captureMetadata.provenance.url},expectedRevision);\n  rememberRevision(result.revision,{value:clone(result.value),pins:[],captureMetadata});\n  persistMutation(before);\n  render();\n  renderPreview();\n  renderHealth('FAIL');\n  return {...inspect(),baseline:clone(baseline)};\n}\nfunction exportCapture(){ return createCaptureV1({case:value(),metadata:captureMetadata}); }",
    'load_import_capture');
  source=replaceOne(source,
    "function restore({expectedRevision=revision(),targetRevision}){ store.assertRevision(expectedRevision);const snap=revisions.get(targetRevision);if(!snap)throw new Error('REVISION_NOT_FOUND');const before=snapshotCanonical();pins=new Set(snap.pins||[]);const result=store.commit(snap.value,{kind:'restore',from:targetRevision},expectedRevision);rememberRevision(result.revision,{value:clone(result.value),pins:[...pins]});persistMutation(before);render();renderPreview();return inspect(); }",
    "function restore({expectedRevision=revision(),targetRevision}){ store.assertRevision(expectedRevision);const snap=revisions.get(targetRevision);if(!snap)throw new Error('REVISION_NOT_FOUND');const before=snapshotCanonical();pins=new Set(snap.pins||[]);captureMetadata=snap.captureMetadata?clone(snap.captureMetadata):null;const result=store.commit(snap.value,{kind:'restore',from:targetRevision},expectedRevision);rememberRevision(result.revision,{value:clone(result.value),pins:[...pins],captureMetadata});persistMutation(before);render();renderPreview();return inspect(); }",
    'restore_revision_capture');
  source=replaceOne(source,
    "const CASE_SCHEMA={type:'object',additionalProperties:false,properties:{html:{type:'string'},css:{type:'string'},js:{type:'string'},oracle:ORACLE_SCHEMA},required:['html','css','js','oracle']};",
    "const CASE_SCHEMA={type:'object',additionalProperties:false,properties:{html:{type:'string'},css:{type:'string'},js:{type:'string'},oracle:ORACLE_SCHEMA},required:['html','css','js','oracle']};\nconst CAPTURE_RECORDED_ACTION_SCHEMA={type:'object',properties:{kind:{type:'string',enum:ACTION_STEP_KINDS},selector:{type:'string'},value:{type:'string'},checked:{type:'boolean'},durationMs:{type:'number',minimum:0,maximum:2000}},required:['kind'],additionalProperties:false};\nconst CAPTURE_PROVENANCE_SCHEMA={type:'object',properties:{url:{type:'string'},title:{type:'string'},browser:{type:'string'},viewport:{type:'object',properties:{width:{type:'integer',minimum:1},height:{type:'integer',minimum:1}},required:['width','height'],additionalProperties:false},actions:{type:'array',items:CAPTURE_RECORDED_ACTION_SCHEMA,maxItems:8}},required:['url','title','browser','viewport','actions'],additionalProperties:false};\nconst CAPTURE_SCHEMA={type:'object',properties:{format:{type:'string',const:'faultline.capture.v1'},mode:{type:'string',const:'snapshot'},capturedAt:{type:'string'},provenance:CAPTURE_PROVENANCE_SCHEMA,unresolvedResources:{type:'array',items:{type:'string'}},case:CASE_SCHEMA},required:['format','mode','capturedAt','provenance','unresolvedResources','case'],additionalProperties:false};",
    'capture_schema');
  source=replaceOne(source,
    " ['faultline_load_case','Replace the complete canonical HTML, CSS, JavaScript and oracle in one optimistic revision.',{...REVISION_PROPERTY,case:CASE_SCHEMA},async input=>loadCase(input),false,true,['expectedRevision','case']],",
    " ['faultline_load_case','Replace the complete canonical HTML, CSS, JavaScript and oracle in one optimistic revision.',{...REVISION_PROPERTY,case:CASE_SCHEMA},async input=>loadCase(input),false,true,['expectedRevision','case']],\n ['faultline_import_capture','Preflight a versioned local Playwright snapshot capture and commit it only when the canonical sandbox reproduces FAIL.',{...REVISION_PROPERTY,...REQUEST_PROPERTY,capture:CAPTURE_SCHEMA},async(input,options)=>importCapture(input,options),false,true,['expectedRevision','capture']],",
    'import_tool');
  source=replaceOne(source,
    " ['faultline_export','Export the current case as a standalone HTML reproducer.',{},async()=>({html:exportCase()}),true,true],",
    " ['faultline_export','Export the current case as a standalone HTML reproducer.',{},async()=>({html:exportCase()}),true,true],\n ['faultline_export_capture','Export the canonical case as faultline.capture.v1 with retained capture provenance when available.',{},async()=>exportCapture(),true,true],",
    'export_tool');
  source=replaceOne(source,
    "window.faultline={inspect,units,loadCase,resetCase,run,defineOracle,applySource,probe,reduce,pin,history,revisions:listRevisions,restore,exportCase,autopilot,manifest:",
    "window.faultline={inspect,units,loadCase,importCapture,exportCapture,resetCase,run,defineOracle,applySource,probe,reduce,pin,history,revisions:listRevisions,restore,exportCase,autopilot,manifest:",
    'window_api');
  return source;
});

edit('src/ui.js',source=>{
  source=replaceOne(source,
    "function installRevisionRecovery(){",
    `function installCaptureImport(){
  const actionBar=document.querySelector('#case-workspace .action-bar');
  if(!actionBar||document.getElementById('capture-import'))return;
  const details=document.createElement('details');
  details.id='capture-import';
  details.style.marginTop='12px';
  details.style.paddingTop='12px';
  details.style.borderTop='1px solid var(--line)';
  const summary=document.createElement('summary');
  summary.className='btn ghost';
  summary.textContent='Import Playwright capture';
  const help=document.createElement('p');
  help.id='capture-import-help';
  help.className='small';
  help.textContent='Import faultline.capture.v1 from the local Playwright adapter. FAULTLINE first re-runs the captured case in its canonical sandbox and replaces current state only when the baseline reproduces FAIL.';
  const fileLabel=document.createElement('label');
  fileLabel.htmlFor='capture-file';
  fileLabel.textContent='Capture file';
  const file=document.createElement('input');
  file.id='capture-file';
  file.type='file';
  file.accept='.json,application/json';
  file.setAttribute('aria-describedby','capture-import-help');
  const label=document.createElement('label');
  label.htmlFor='capture-import-json';
  label.textContent='Capture JSON';
  const editor=document.createElement('textarea');
  editor.id='capture-import-json';
  editor.spellcheck=false;
  editor.style.minHeight='190px';
  editor.setAttribute('aria-describedby','capture-import-help');
  file.addEventListener('change',async()=>{try{const selected=file.files?.[0];if(selected)editor.value=await selected.text();}catch(error){reportActionError(error);}});
  const actions=document.createElement('div');
  actions.className='actions';
  actions.style.marginTop='10px';
  const button=document.createElement('button');
  button.id='import-capture';
  button.className='btn primary';
  button.type='button';
  button.textContent='Verify FAIL and import';
  button.addEventListener('click',async()=>{
    try{
      const capture=JSON.parse(editor.value);
      const current=window.faultline.inspect();
      const result=await window.faultline.importCapture({expectedRevision:current.revision,capture});
      const health=document.getElementById('health');
      const evidence=document.getElementById('summary');
      if(health){health.textContent='FAIL';health.dataset.state='FAIL';}
      if(evidence)evidence.textContent=\`CAPTURE VERIFIED · FAIL · \${result.captureProvenance?.provenance?.url||'local capture'}\`;
    }catch(error){reportActionError(error);}
  });
  actions.append(button);
  details.append(summary,help,fileLabel,file,label,editor,actions);
  actionBar.insertAdjacentElement('afterend',details);
}

function installCaptureExport(){
  const reproducerButton=document.getElementById('export');
  if(!reproducerButton||document.getElementById('export-capture-json'))return;
  const button=document.createElement('button');
  button.id='export-capture-json';
  button.className='btn';
  button.type='button';
  button.textContent='Export capture JSON';
  button.addEventListener('click',()=>{
    try{
      const state=window.faultline.inspect();
      const blob=new Blob([\`${'${JSON.stringify(window.faultline.exportCapture(),null,2)}'}\\n\`],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;
      link.download=\`faultline-capture-\${state.revision}.json\`;
      link.hidden=true;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),0);
    }catch(error){reportActionError(error);}
  });
  reproducerButton.insertAdjacentElement('beforebegin',button);
}

function installRevisionRecovery(){`,
    'ui_capture_functions');
  source=replaceOne(source,
    "installCaseImport();\ninstallCaseJsonExport();\ninstallRevisionRecovery();",
    "installCaseImport();\ninstallCaptureImport();\ninstallCaseJsonExport();\ninstallCaptureExport();\ninstallRevisionRecovery();",
    'ui_capture_install');
  return source;
});

edit('scripts-build.mjs',source=>replaceOne(source,
  "  'src/ui.js',\n  'src/reducer-engine.js',",
  "  'src/ui.js',\n  'src/capture-format.js',\n  'src/reducer-engine.js',",
  'build_capture'));

edit('.github/workflows/deploy-production.yml',source=>{
  const old='index.html src/runtime.js src/ui.js src/reducer-engine.js src/sandbox-policy.js';
  const next='index.html src/runtime.js src/ui.js src/capture-format.js src/reducer-engine.js src/sandbox-policy.js';
  const count=source.split(old).length-1;
  if(count!==2)throw new Error(`ANCHOR_deploy_files:${count}`);
  return source.replaceAll(old,next);
});

edit('tests/deployment-tree-parity.test.js',source=>replaceOne(source,
  "  'src/ui.js',\n  'src/reducer-engine.js',",
  "  'src/ui.js',\n  'src/capture-format.js',\n  'src/reducer-engine.js',",
  'parity_capture'));

edit('package.json',source=>{
  source=replaceOne(source,
    'node --check src/sandbox-policy.js && node --check src/runtime.js',
    'node --check src/sandbox-policy.js && node --check src/capture-format.js && node --check src/runtime.js',
    'check_capture_module');
  source=replaceOne(source,
    'node --check src/ui.js && node --check tests/browser-e2e.mjs',
    'node --check src/ui.js && node --check scripts/capture-playwright.mjs && node --check tests/browser-e2e.mjs',
    'check_capture_cli');
  return source;
});

edit('README.md',source=>{
  source=replaceOne(source,
    'FAULTLINE is a local-first causal debugging workbench. You load a deterministic web failure, define an oracle, probe removals, run bounded delta reduction, pin important units, inspect revision/evidence history, restore earlier states and export a standalone HTML reproducer.',
    'FAULTLINE is a local-first causal debugging workbench. You can load a deterministic web failure directly or capture a real locally reachable page with the Playwright adapter, verify that the captured baseline still fails inside FAULTLINE, then probe removals, run bounded delta reduction, inspect evidence/revision history and export a standalone reproducer with capture provenance.',
    'readme_intro');
  const marker='## Try the built-in case';
  const section=`## Capture a real browser failure\n\nThe production repository includes a local Playwright snapshot adapter so a developer does not have to manually reconstruct every DOM-state failure. Create a config containing the target URL, failure oracle and bounded pre-capture actions, then run:\n\n\`\`\`bash\nnode scripts/capture-playwright.mjs --config ./faultline-capture.config.json\n\`\`\`\n\nThe adapter emits \`faultline.capture.v1\` with the final DOM, readable CSS, normalized oracle and provenance. Import it through the workbench, \`window.faultline.importCapture\`, or \`faultline_import_capture\`. FAULTLINE executes the normalized case in the same canonical sandbox and commits it only if the result is exactly \`FAIL\`. PASS, UNRESOLVED, stale, malformed or dependency-incomplete captures leave the current case untouched.\n\nSnapshot capture supports DOM property/attribute, existence and computed-style failures after bounded click/value/checked/wait actions. It intentionally does not claim to reconstruct arbitrary framework JavaScript, authentication/backend state, cross-origin stylesheet contents or runtime-error causality. Those captures must be made self-contained first.\n\n`;
  if(!source.includes(marker))throw new Error('ANCHOR_readme_section');
  return source.replace(marker,section+marker);
});

edit('docs/SECURITY.md',source=>replaceOne(source,
  '## Known limits',
  '## Capture boundary\n\nThe Playwright capture adapter runs locally in the developer environment. The hosted FAULTLINE workbench does not navigate to arbitrary target URLs, receive target-site credentials or gain new network capability. Imported capture content is still evaluated through the existing sandbox/CSP and navigation/network policy, and capture import commits only after a canonical FAIL preflight. Inaccessible stylesheet dependencies are recorded and rejected rather than silently omitted.\n\n## Known limits',
  'security_capture'));

edit('ROADMAP.md',source=>{
  if(source.includes('Playwright snapshot capture pipeline'))return source;
  return source+`\n\n## Real browser ingestion\n\n- [x] Playwright snapshot capture pipeline for bounded DOM-state failures\n- [x] Transactional capture import with canonical FAIL preflight and provenance\n- [x] Browser API, human workbench and WebMCP capture import/export parity\n- [ ] Script-aware capture/replay for failures whose causality cannot be represented by a final DOM snapshot\n- [ ] Framework/dev-server adapters with explicit dependency packaging instead of silent network coupling\n`;
});

unlinkSync('scripts/implement-capture-pipeline.mjs');
unlinkSync('.github/workflows/capture-implementation.yml');
