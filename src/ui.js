import './runtime.js';
import { navigationRisk } from './sandbox-policy.js';

const actionIds=['apply','run','probe','pin','reduce','autopilot','lock','reset'];
const axisTabs=[...document.querySelectorAll('[role="tab"][data-axis]')];
const integrationNote=document.querySelector('#integration-workspace .integration-column:nth-child(2) .integration-note');
const integrationBadge=document.querySelector('#integration-workspace>summary .tool-badge');
const integrationFlow=document.querySelector('#integration-workspace .integration-column:nth-child(2) pre');
const browserFlow=document.querySelector('#integration-workspace .integration-column:nth-child(1) pre');
const toolCount=window.faultline.manifest().length;
const toolCountLabel=({13:'thirteen',14:'fourteen',15:'fifteen',16:'sixteen',17:'seventeen'})[toolCount]||String(toolCount);

if(integrationBadge)integrationBadge.textContent=`${toolCount} WebMCP tools`;
if(integrationNote){
  integrationNote.textContent=integrationNote.textContent.replace(/\b(?:twelve|thirteen|fourteen|fifteen|sixteen|seventeen|\d+) WebMCP tools\b/i,`${toolCountLabel} WebMCP tools`);
  if(!integrationNote.textContent.includes('faultline_apply_source')){
    const separator=document.createTextNode(' Single-axis agent writes use ');
    const tool=document.createElement('code');
    tool.textContent='faultline_apply_source';
    integrationNote.append(separator,tool,document.createTextNode('.'));
  }
  if(!integrationNote.textContent.includes('faultline_units')){
    const separator=document.createTextNode(' Discover actionable semantic IDs with ');
    const tool=document.createElement('code');
    tool.textContent='faultline_units';
    integrationNote.append(separator,tool,document.createTextNode(' before probe or pin operations.'));
  }
  if(!integrationNote.textContent.includes('faultline_revisions')){
    const separator=document.createTextNode(' Discover bounded recovery points with ');
    const tool=document.createElement('code');
    tool.textContent='faultline_revisions';
    integrationNote.append(separator,tool,document.createTextNode(' before faultline_restore.'));
  }
  if(!integrationNote.textContent.includes('faultline_import_capture')){
    const separator=document.createTextNode(' Import real Playwright-captured failures with ');
    const tool=document.createElement('code');
    tool.textContent='faultline_import_capture';
    integrationNote.append(separator,tool,document.createTextNode(' after inspecting the current revision.'));
  }
}
if(integrationFlow&&!integrationFlow.textContent.includes('faultline_units')){
  integrationFlow.textContent=integrationFlow.textContent.replace('faultline_probe','faultline_units({ targetAxis })\n  ↓\nfaultline_probe({ expectedRevision, targetAxis, unitId })');
}
if(integrationFlow&&!integrationFlow.textContent.includes('faultline_import_capture')){
  integrationFlow.textContent=`faultline_inspect()\n  ↓\nfaultline_import_capture({ expectedRevision, capture })\n  ↓\n${integrationFlow.textContent}`;
}
if(browserFlow&&!browserFlow.textContent.includes('window.faultline.units')){
  browserFlow.textContent+=`\n\nconst frontier = await window.faultline.units({ targetAxis: 'html' })\nconst unitId = frontier.units[0]?.id`;
}
if(browserFlow&&!browserFlow.textContent.includes('window.faultline.importCapture')){
  browserFlow.textContent+=`\n\nconst current = window.faultline.inspect()\nawait window.faultline.importCapture({ expectedRevision: current.revision, capture })`;
}

function reportActionError(error){
  const message=String(error?.message||error||'UNKNOWN_ERROR');
  const health=document.getElementById('health');
  const summary=document.getElementById('summary');
  if(health){health.textContent='ERROR';health.dataset.state='ERROR';}
  if(summary)summary.textContent=message;
}

function installCaseImport(){
  const actionBar=document.querySelector('#case-workspace .action-bar');
  if(!actionBar||document.getElementById('case-import'))return;

  const details=document.createElement('details');
  details.id='case-import';
  details.style.marginTop='12px';
  details.style.paddingTop='12px';
  details.style.borderTop='1px solid var(--line)';

  const summary=document.createElement('summary');
  summary.className='btn ghost';
  summary.style.display='inline-flex';
  summary.textContent='Import complete case JSON';

  const help=document.createElement('p');
  help.className='small';
  help.textContent='Atomically replace HTML, CSS, JavaScript, and the oracle in one guarded revision. Invalid input leaves canonical state unchanged.';

  const label=document.createElement('label');
  label.htmlFor='case-import-json';
  label.textContent='Case JSON';

  const editor=document.createElement('textarea');
  editor.id='case-import-json';
  editor.spellcheck=false;
  editor.style.minHeight='180px';
  editor.value=JSON.stringify(window.faultline.inspect().case,null,2);

  const actions=document.createElement('div');
  actions.className='actions';
  actions.style.marginTop='10px';

  const button=document.createElement('button');
  button.id='import-case';
  button.className='btn primary';
  button.type='button';
  button.textContent='Import case atomically';
  button.addEventListener('click',()=>{
    try{
      const nextCase=JSON.parse(editor.value);
      const current=window.faultline.inspect();
      window.faultline.loadCase({expectedRevision:current.revision,case:nextCase});
      const health=document.getElementById('health');
      if(health){health.textContent='READY';health.dataset.state='READY';}
      refreshCaptureExport();
    }catch(error){
      reportActionError(error);
    }
  });

  actions.append(button);
  details.append(summary,help,label,editor,actions);
  actionBar.insertAdjacentElement('afterend',details);
}

function installCaptureImport(){
  const caseImport=document.getElementById('case-import');
  const actionBar=document.querySelector('#case-workspace .action-bar');
  if((!caseImport&&!actionBar)||document.getElementById('capture-import'))return;

  const details=document.createElement('details');
  details.id='capture-import';
  details.style.marginTop='12px';
  details.style.paddingTop='12px';
  details.style.borderTop='1px solid var(--line)';

  const summary=document.createElement('summary');
  summary.className='btn ghost';
  summary.style.display='inline-flex';
  summary.textContent='Import Playwright capture';

  const help=document.createElement('p');
  help.className='small';
  help.textContent='Paste a faultline.capture.v1 envelope created from a real Playwright failure. FAULTLINE validates and baseline-runs it first; only a reproduced FAIL becomes canonical state.';

  const label=document.createElement('label');
  label.htmlFor='capture-import-json';
  label.textContent='Playwright capture JSON';

  const editor=document.createElement('textarea');
  editor.id='capture-import-json';
  editor.spellcheck=false;
  editor.style.minHeight='220px';
  editor.placeholder='{"schema":"faultline.capture.v1", ...}';
  editor.setAttribute('aria-describedby','capture-import-help');
  help.id='capture-import-help';

  const actions=document.createElement('div');
  actions.className='actions';
  actions.style.marginTop='10px';

  const button=document.createElement('button');
  button.id='import-capture';
  button.className='btn primary';
  button.type='button';
  button.textContent='Verify and import capture';
  button.addEventListener('click',async()=>{
    button.disabled=true;
    try{
      const capture=JSON.parse(editor.value);
      const current=window.faultline.inspect();
      const result=await window.faultline.importCapture({expectedRevision:current.revision,capture});
      const health=document.getElementById('health');
      const evidence=document.getElementById('summary');
      if(health){health.textContent='FAIL';health.dataset.state='FAIL';}
      if(evidence){
        const labelText=result.state.captureProvenance?.label||result.state.captureProvenance?.url||'captured failure';
        evidence.textContent=`Capture baseline confirmed FAIL · ${labelText}`;
      }
      refreshCaptureExport();
    }catch(error){
      reportActionError(error);
    }finally{
      button.disabled=false;
    }
  });

  actions.append(button);
  details.append(summary,help,label,editor,actions);
  (caseImport||actionBar).insertAdjacentElement('afterend',details);
}

function installCaseJsonExport(){
  const reproducerButton=document.getElementById('export');
  if(!reproducerButton||document.getElementById('export-case-json'))return;

  const button=document.createElement('button');
  button.id='export-case-json';
  button.className='btn';
  button.type='button';
  button.textContent='Export case JSON';
  button.addEventListener('click',()=>{
    try{
      const state=window.faultline.inspect();
      const blob=new Blob([`${JSON.stringify(state.case,null,2)}\n`],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;
      link.download=`faultline-case-${state.revision}.json`;
      link.hidden=true;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),0);
    }catch(error){
      reportActionError(error);
    }
  });

  reproducerButton.insertAdjacentElement('beforebegin',button);
}

function refreshCaptureExport(){
  const button=document.getElementById('export-capture-json');
  if(!button)return;
  const provenance=window.faultline.inspect().captureProvenance;
  button.disabled=!provenance;
  button.title=provenance?`Export capture from ${provenance.label||provenance.url}`:'Import a Playwright capture before exporting capture JSON';
}

function installCaptureJsonExport(){
  const reproducerButton=document.getElementById('export');
  if(!reproducerButton||document.getElementById('export-capture-json'))return;

  const button=document.createElement('button');
  button.id='export-capture-json';
  button.className='btn';
  button.type='button';
  button.textContent='Export capture JSON';
  button.setAttribute('aria-label','Export current provenance-bound Playwright capture JSON');
  button.addEventListener('click',()=>{
    try{
      const state=window.faultline.inspect();
      const capture=window.faultline.exportCapture();
      const blob=new Blob([`${JSON.stringify(capture,null,2)}\n`],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;
      link.download=`faultline-capture-${state.revision}.faultline.json`;
      link.hidden=true;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),0);
    }catch(error){reportActionError(error);}
  });
  reproducerButton.insertAdjacentElement('beforebegin',button);
  refreshCaptureExport();

  const revisionBadge=document.getElementById('revision');
  if(revisionBadge)new MutationObserver(refreshCaptureExport).observe(revisionBadge,{childList:true,subtree:true,characterData:true});
}

function installRevisionRecovery(){
  const actionBar=document.querySelector('#case-workspace .action-bar');
  if(!actionBar||document.getElementById('revision-recovery'))return ()=>{};

  const details=document.createElement('details');
  details.id='revision-recovery';
  details.style.marginTop='12px';
  details.style.paddingTop='12px';
  details.style.borderTop='1px solid var(--line)';

  const summary=document.createElement('summary');
  summary.className='btn ghost';
  summary.textContent='Recoverable revisions';

  const help=document.createElement('p');
  help.className='small';
  help.textContent='Restore a retained canonical checkpoint as a new guarded revision. Current state is never rewritten in place.';

  const list=document.createElement('div');
  list.setAttribute('role','list');
  list.setAttribute('aria-label','Recoverable canonical revisions');
  list.style.display='grid';
  list.style.gap='7px';

  const refresh=()=>{
    const state=window.faultline.revisions({limit:8});
    list.replaceChildren();
    for(const item of state.revisions){
      const row=document.createElement('div');
      row.setAttribute('role','listitem');
      row.style.display='flex';
      row.style.alignItems='center';
      row.style.justifyContent='space-between';
      row.style.gap='10px';
      row.style.padding='9px 10px';
      row.style.border='1px solid var(--line)';
      row.style.borderRadius='9px';
      row.style.background='#08090c';

      const mutation=item.event?.kind?item.event.kind.replaceAll('_',' '):'initial state';
      const mutationAxis=item.event?.axis?` · ${item.event.axis.toUpperCase()}`:'';
      const meta=document.createElement('span');
      meta.className='small';
      meta.textContent=`${item.revision}${item.current?' · current':''} · ${mutation}${mutationAxis} · H${item.summary.htmlChars} C${item.summary.cssChars} J${item.summary.jsChars}`;
      row.append(meta);

      if(!item.current){
        const button=document.createElement('button');
        button.type='button';
        button.className='btn';
        button.dataset.revision=item.revision;
        button.textContent='Restore';
        button.setAttribute('aria-label',`Restore canonical revision ${item.revision}`);
        button.addEventListener('click',()=>{
          try{
            const current=window.faultline.inspect();
            window.faultline.restore({expectedRevision:current.revision,targetRevision:item.revision});
            refresh();
            refreshCaptureExport();
            const health=document.getElementById('health');
            if(health){health.textContent='READY';health.dataset.state='READY';}
          }catch(error){reportActionError(error);refresh();}
        });
        row.append(button);
      }
      list.append(row);
    }
  };

  details.addEventListener('toggle',()=>{if(details.open)refresh();});
  details.append(summary,help,list);
  actionBar.insertAdjacentElement('afterend',details);
  refresh();

  const revisionBadge=document.getElementById('revision');
  if(revisionBadge)new MutationObserver(refresh).observe(revisionBadge,{childList:true,subtree:true,characterData:true});
  return refresh;
}

function installPreviewNavigationGuard(){
  const button=document.getElementById('preview-run');
  const execute=button?.onclick;
  if(!button||typeof execute!=='function')return;
  button.onclick=event=>{
    const risk=navigationRisk(window.faultline.inspect().case);
    if(risk){
      const health=document.getElementById('health');
      const summary=document.getElementById('summary');
      const reason=risk.reason||'UNSAFE_NAVIGATION';
      if(health){health.textContent='UNRESOLVED';health.dataset.state='UNRESOLVED';}
      if(summary)summary.textContent=`${reason} · ${risk.axis} · ${risk.capability}`;
      return undefined;
    }
    return execute.call(button,event);
  };
}

installCaseImport();
installCaptureImport();
installCaseJsonExport();
installCaptureJsonExport();
installRevisionRecovery();
installPreviewNavigationGuard();

function syncAxisTabStops(activeTab=axisTabs.find(tab=>tab.getAttribute('aria-selected')==='true')){
  for(const tab of axisTabs)tab.tabIndex=tab===activeTab?0:-1;
}

for(const [index,tab] of axisTabs.entries()){
  const activate=tab.onclick;
  tab.onclick=event=>{
    const result=typeof activate==='function'?activate.call(tab,event):undefined;
    syncAxisTabStops(tab);
    return result;
  };
  tab.addEventListener('keydown',event=>{
    let nextIndex=null;
    if(event.key==='ArrowRight')nextIndex=(index+1)%axisTabs.length;
    else if(event.key==='ArrowLeft')nextIndex=(index-1+axisTabs.length)%axisTabs.length;
    else if(event.key==='Home')nextIndex=0;
    else if(event.key==='End')nextIndex=axisTabs.length-1;
    if(nextIndex===null)return;
    event.preventDefault();
    const next=axisTabs[nextIndex];
    next.click();
    next.focus();
  });
}
syncAxisTabStops();

for(const id of actionIds){
  const element=document.getElementById(id);
  const action=element?.onclick;
  if(!element||typeof action!=='function')continue;
  element.onclick=async event=>{
    try{
      const result=await action.call(element,event);
      refreshCaptureExport();
      return result;
    }catch(error){
      reportActionError(error);
      return undefined;
    }
  };
}
