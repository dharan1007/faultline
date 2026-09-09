import { readFileSync, writeFileSync } from 'node:fs';

const path='src/ui.js';
let source=readFileSync(path,'utf8');
const replace=(from,to,label)=>{
  if(!source.includes(from))throw new Error(`PATCH_PRECONDITION_FAILED:${label}`);
  source=source.replace(from,to);
};

replace(
"import { navigationRisk } from './sandbox-policy.js';",
"import { navigationRisk } from './sandbox-policy.js';\nimport { CAPTURE_LIMITS, validateCaptureArtifact } from './capture-contract.js';",
'capture-ui-contract-import');

replace(
"function installCaseJsonExport(){",
`function installCaptureImport(){
  const actionBar=document.querySelector('#case-workspace .action-bar');
  if(!actionBar||document.getElementById('capture-import'))return;

  let pendingCapture=null;
  const details=document.createElement('details');
  details.id='capture-import';
  details.style.marginTop='12px';
  details.style.paddingTop='12px';
  details.style.borderTop='1px solid var(--line)';

  const disclosure=document.createElement('summary');
  disclosure.className='btn ghost';
  disclosure.textContent='Import Playwright capture';

  const help=document.createElement('p');
  help.className='small';
  help.textContent='Select a local .faultline.json artifact. Selection only validates and previews metadata; Verify & import independently reproduces FAIL in the sandbox before canonical state can change.';

  const label=document.createElement('label');
  label.htmlFor='capture-file';
  label.textContent='FAULTLINE capture file';

  const file=document.createElement('input');
  file.id='capture-file';
  file.type='file';
  file.accept='.json,.faultline.json';

  const captureSummary=document.createElement('div');
  captureSummary.id='capture-summary';
  captureSummary.className='small';
  captureSummary.style.marginTop='10px';
  captureSummary.style.whiteSpace='pre-wrap';
  captureSummary.style.overflowWrap='anywhere';
  captureSummary.textContent='No capture selected.';

  const status=document.createElement('p');
  status.id='capture-status';
  status.className='small';
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  status.textContent='Waiting for a capture.';

  const actions=document.createElement('div');
  actions.className='actions';
  actions.style.marginTop='10px';

  const verify=document.createElement('button');
  verify.id='verify-capture';
  verify.type='button';
  verify.className='btn primary';
  verify.textContent='Verify & import';
  verify.disabled=true;

  file.addEventListener('change',async()=>{
    pendingCapture=null;
    verify.disabled=true;
    const selected=file.files?.[0];
    if(!selected){captureSummary.textContent='No capture selected.';status.textContent='Waiting for a capture.';return;}
    try{
      if(selected.size>CAPTURE_LIMITS.totalBytes)throw new Error('CAPTURE_TOO_LARGE');
      const parsed=JSON.parse(await selected.text());
      validateCaptureArtifact(parsed);
      pendingCapture=parsed;
      const sourceTitle=typeof parsed.source?.title==='string'?parsed.source.title:'Untitled page';
      const sourceUrl=typeof parsed.source?.url==='string'?parsed.source.url:'No source URL';
      const testTitle=typeof parsed.provenance?.testTitle==='string'?parsed.provenance.testTitle:'No test title';
      captureSummary.textContent=`${testTitle}\n${sourceTitle}\n${sourceUrl}\nOracle: ${parsed.oracle?.kind||'unknown'}`;
      status.textContent='Capture validated locally. Canonical state is unchanged until verification succeeds.';
      verify.disabled=false;
    }catch(error){
      captureSummary.textContent=selected.name;
      status.textContent=`Capture rejected: ${String(error?.message||error)}`;
    }
  });

  verify.addEventListener('click',async()=>{
    if(!pendingCapture)return;
    verify.disabled=true;
    status.textContent='Verifying captured failure in isolated sandbox…';
    try{
      const current=window.faultline.inspect();
      const result=await window.faultline.importCapture({expectedRevision:current.revision,capture:pendingCapture});
      status.textContent=`Imported ${result.revision} · baseline ${result.baseline.status}`;
    }catch(error){
      status.textContent=`Import blocked: ${String(error?.message||error)}`;
      reportActionError(error);
    }finally{
      verify.disabled=pendingCapture===null;
    }
  });

  actions.append(verify);
  details.append(disclosure,help,label,file,captureSummary,status,actions);
  actionBar.insertAdjacentElement('afterend',details);
}

function installCaseJsonExport(){`,
'capture-ui-function');

replace(
"installCaseImport();\ninstallCaseJsonExport();",
"installCaptureImport();\ninstallCaseImport();\ninstallCaseJsonExport();",
'capture-ui-install');

writeFileSync(path,source);
console.log('capture UI patch applied');
