import {
  mountProductHeader,
  syncShell,
  faultlineState,
  reportUiError,
  clearUiError,
  caseSourceSize,
  formatOracle
} from './ui-shell.js';

const errorTarget=document.querySelector('[data-ui-error]');
const fileInput=document.getElementById('case-file');
const chooseButton=document.getElementById('choose-case-file');
const dropZone=document.getElementById('case-drop');
const jsonEditor=document.getElementById('case-json');
const importButton=document.getElementById('import-json');
const exampleButton=document.getElementById('load-example');

export function parseCaseJson(text){
  return JSON.parse(String(text));
}

export function loadImportedCase(candidate){
  const current=faultlineState();
  return window.faultline.loadCase({expectedRevision:current.revision,case:candidate});
}

function navigateWorkbench(){
  window.location.assign('./workbench.html');
}

function latestLabel(latest){
  if(!latest)return 'No experiment evidence yet. The case is ready for a deterministic run.';
  const kind=String(latest.kind||'experiment').replaceAll('_',' ');
  return `${kind} · ${latest.status||'UNKNOWN'} · tested ${latest.revision||'unknown revision'}`;
}

function renderSession(){
  const state=syncShell();
  const revision=document.querySelector('[data-session-revision]');
  const size=document.querySelector('[data-session-size]');
  const oracle=document.querySelector('[data-session-oracle]');
  const latest=document.querySelector('[data-session-latest]');
  if(revision)revision.textContent=state.revision;
  if(size)size.textContent=`${caseSourceSize(state.case).toLocaleString()} chars`;
  if(oracle)oracle.textContent=formatOracle(state.case.oracle);
  if(latest)latest.textContent=latestLabel(state.latest);
  return state;
}

function loadCandidate(candidate){
  clearUiError(errorTarget);
  loadImportedCase(candidate);
  renderSession();
  navigateWorkbench();
}

function loadJsonText(text){
  try{
    loadCandidate(parseCaseJson(text));
  }catch(error){
    reportUiError(error,errorTarget);
    renderSession();
  }
}

async function loadFile(file){
  if(!file)return;
  try{
    const text=await file.text();
    loadJsonText(text);
  }catch(error){
    reportUiError(error,errorTarget);
    renderSession();
  }finally{
    if(fileInput)fileInput.value='';
  }
}

mountProductHeader();
renderSession();

chooseButton?.addEventListener('click',()=>fileInput?.click());
fileInput?.addEventListener('change',()=>loadFile(fileInput.files?.[0]));

if(dropZone){
  dropZone.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    event.preventDefault();
    fileInput?.click();
  });
  dropZone.addEventListener('dragenter',event=>{
    event.preventDefault();
    dropZone.dataset.dragging='true';
  });
  dropZone.addEventListener('dragover',event=>{
    event.preventDefault();
    dropZone.dataset.dragging='true';
    if(event.dataTransfer)event.dataTransfer.dropEffect='copy';
  });
  dropZone.addEventListener('dragleave',event=>{
    if(event.relatedTarget&&dropZone.contains(event.relatedTarget))return;
    dropZone.dataset.dragging='false';
  });
  dropZone.addEventListener('drop',event=>{
    event.preventDefault();
    dropZone.dataset.dragging='false';
    loadFile(event.dataTransfer?.files?.[0]);
  });
}

importButton?.addEventListener('click',()=>loadJsonText(jsonEditor?.value??''));

exampleButton?.addEventListener('click',()=>{
  clearUiError(errorTarget);
  try{
    const state=faultlineState();
    window.faultline.resetCase({expectedRevision:state.revision});
    renderSession();
    navigateWorkbench();
  }catch(error){
    reportUiError(error,errorTarget);
    renderSession();
  }
});
