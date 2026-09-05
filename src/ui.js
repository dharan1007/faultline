import './runtime.js';

const actionIds=['apply','run','probe','pin','reduce','autopilot','lock'];
const axisTabs=[...document.querySelectorAll('[role="tab"][data-axis]')];
const integrationNote=document.querySelector('#integration-workspace .integration-column:nth-child(2) .integration-note');

if(integrationNote&&!integrationNote.textContent.includes('faultline_apply_source')){
  const separator=document.createTextNode(' Single-axis agent writes use ');
  const tool=document.createElement('code');
  tool.textContent='faultline_apply_source';
  integrationNote.append(separator,tool,document.createTextNode('.'));
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
    }catch(error){
      reportActionError(error);
    }
  });

  actions.append(button);
  details.append(summary,help,label,editor,actions);
  actionBar.insertAdjacentElement('afterend',details);
}

installCaseImport();

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
      return await action.call(element,event);
    }catch(error){
      reportActionError(error);
      return undefined;
    }
  };
}
