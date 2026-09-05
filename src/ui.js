import './runtime.js';

const actionIds=['apply','run','probe','pin','reduce','autopilot','lock'];

function reportActionError(error){
  const message=String(error?.message||error||'UNKNOWN_ERROR');
  const health=document.getElementById('health');
  const summary=document.getElementById('summary');
  if(health){health.textContent='ERROR';health.dataset.state='ERROR';}
  if(summary)summary.textContent=message;
}

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
