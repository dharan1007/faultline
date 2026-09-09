from pathlib import Path

runtime=Path('src/runtime.js')
text=runtime.read_text()

replacements=[
("const ACTION_STEP_KINDS=['click','set_value'];", "const ACTION_STEP_KINDS=['click','set_value','wait'];\nconst MAX_SEQUENCE_WAIT_MS=2000;\nconst HOST_TIMEOUT_MS=5000;"),
]

old_validate="""function validateAction(action,{allowSequence=true}={}){
  if(!action||typeof action!=='object'||Array.isArray(action)||!ACTION_KINDS.includes(action.kind))throw new Error('INVALID_ORACLE');
  if(Object.keys(action).some(key=>!['kind','selector','value','steps'].includes(key)))throw new Error('INVALID_ORACLE');
  if(action.kind==='sequence'){
    if(!allowSequence||Object.hasOwn(action,'selector')||Object.hasOwn(action,'value')||!Array.isArray(action.steps)||action.steps.length<1||action.steps.length>8)throw new Error('INVALID_ORACLE');
    for(const step of action.steps){
      if(!ACTION_STEP_KINDS.includes(step?.kind))throw new Error('INVALID_ORACLE');
      validateAction(step,{allowSequence:false});
    }
    return action;
  }
  if(Object.hasOwn(action,'steps'))throw new Error('INVALID_ORACLE');
  if(action.kind==='click'&&(typeof action.selector!=='string'||!action.selector.trim()))throw new Error('INVALID_ORACLE');
  if(action.kind==='set_value'&&(typeof action.selector!=='string'||!action.selector.trim()||typeof action.value!=='string'))throw new Error('INVALID_ORACLE');
  return action;
}"""
new_validate="""function validateAction(action,{allowSequence=true,allowWait=false}={}){
  if(!action||typeof action!=='object'||Array.isArray(action))throw new Error('INVALID_ORACLE');
  const supported=allowWait?[...ACTION_KINDS,'wait']:ACTION_KINDS;
  if(!supported.includes(action.kind)||Object.keys(action).some(key=>!['kind','selector','value','steps','durationMs'].includes(key)))throw new Error('INVALID_ORACLE');
  if(action.kind==='wait'){
    if(!allowWait||Object.keys(action).some(key=>!['kind','durationMs'].includes(key))||!Number.isFinite(action.durationMs)||action.durationMs<0||action.durationMs>MAX_SEQUENCE_WAIT_MS)throw new Error('INVALID_ORACLE');
    return action;
  }
  if(action.kind==='sequence'){
    if(!allowSequence||Object.hasOwn(action,'selector')||Object.hasOwn(action,'value')||Object.hasOwn(action,'durationMs')||!Array.isArray(action.steps)||action.steps.length<1||action.steps.length>8)throw new Error('INVALID_ORACLE');
    let totalWait=0;
    for(const step of action.steps){
      if(!ACTION_STEP_KINDS.includes(step?.kind))throw new Error('INVALID_ORACLE');
      validateAction(step,{allowSequence:false,allowWait:true});
      if(step.kind==='wait')totalWait+=step.durationMs;
    }
    if(totalWait>MAX_SEQUENCE_WAIT_MS)throw new Error('INVALID_ORACLE');
    return action;
  }
  if(Object.hasOwn(action,'steps')||Object.hasOwn(action,'durationMs'))throw new Error('INVALID_ORACLE');
  if(action.kind==='click'&&(typeof action.selector!=='string'||!action.selector.trim()))throw new Error('INVALID_ORACLE');
  if(action.kind==='set_value'&&(typeof action.selector!=='string'||!action.selector.trim()||typeof action.value!=='string'))throw new Error('INVALID_ORACLE');
  return action;
}"""
replacements.append((old_validate,new_validate))

old_action=""" const waitActionTurn=()=>new Promise(resolve=>schedule(resolve,0));
 const performAtomicAction=action=>{
  if(action?.kind==='click'){const target=querySelector(action.selector);if(!target)throw new Error('ACTION_TARGET_NOT_FOUND');target.click();return}
  if(action?.kind==='set_value'){
   const target=querySelector(action.selector);
   if(!target)throw new Error('ACTION_TARGET_NOT_FOUND');
   let prototype=target,valueDescriptor=null;
   while((prototype=Object.getPrototypeOf(prototype))&&!valueDescriptor)valueDescriptor=Object.getOwnPropertyDescriptor(prototype,'value');
   if(!valueDescriptor?.set)throw new Error('ACTION_TARGET_NOT_VALUE_CONTROL');
   valueDescriptor.set.call(target,String(action.value));
   target.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
   target.dispatchEvent(new Event('change',{bubbles:true}));
  }
 };
 const performAction=async action=>{
  if(!action||action.kind==='none')return;
  if(action.kind!=='sequence'){performAtomicAction(action);return;}
  for(const step of action.steps){
   performAtomicAction(step);
   await waitActionTurn();
   if(runtimePolicyViolation||latestNavigationAttempt())return;
  }
 };"""
new_action=""" const waitActionTurn=durationMs=>new Promise(resolve=>schedule(resolve,durationMs));
 const performAtomicAction=action=>{
  if(action?.kind==='click'){const target=querySelector(action.selector);if(!target)throw new Error('ACTION_TARGET_NOT_FOUND');target.click();return}
  if(action?.kind==='set_value'){
   const target=querySelector(action.selector);
   if(!target)throw new Error('ACTION_TARGET_NOT_FOUND');
   let prototype=target,valueDescriptor=null;
   while((prototype=Object.getPrototypeOf(prototype))&&!valueDescriptor)valueDescriptor=Object.getOwnPropertyDescriptor(prototype,'value');
   if(!valueDescriptor?.set)throw new Error('ACTION_TARGET_NOT_VALUE_CONTROL');
   valueDescriptor.set.call(target,String(action.value));
   target.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
   target.dispatchEvent(new Event('change',{bubbles:true}));
  }
 };
 const performAction=async action=>{
  if(!action||action.kind==='none')return;
  if(action.kind!=='sequence'){performAtomicAction(action);return;}
  for(const step of action.steps){
   if(step.kind==='wait')await waitActionTurn(Number(step.durationMs));
   else {performAtomicAction(step);await waitActionTurn(0);}
   if(runtimePolicyViolation||latestNavigationAttempt())return;
  }
 };"""
replacements.append((old_action,new_action))
replacements.append(("const timer=setTimeout(()=>finish({status:'UNRESOLVED',evidence:{reason:'HOST_TIMEOUT'}}),2200);", "const timer=setTimeout(()=>finish({status:'UNRESOLVED',evidence:{reason:'HOST_TIMEOUT'}}),HOST_TIMEOUT_MS);"))
replacements.append(("const ACTION_STEP_SCHEMA={type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:ACTION_STEP_KINDS},selector:{type:'string'},value:{type:'string'}},required:['kind','selector']};", "const ACTION_STEP_SCHEMA={type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:ACTION_STEP_KINDS},selector:{type:'string'},value:{type:'string'},durationMs:{type:'number',minimum:0,maximum:MAX_SEQUENCE_WAIT_MS}},required:['kind']};"))

for old,new in replacements:
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'expected exactly one runtime match, found {count}: {old[:100]!r}')
    text=text.replace(old,new)
runtime.write_text(text)

index=Path('index.html')
html=index.read_text()
old='For “Action sequence”, provide 1–8 ordered click/set_value steps. Each step runs in its own browser task before measurement.'
new='For “Action sequence”, provide 1–8 ordered click, set_value, or wait steps. Wait uses {&quot;kind&quot;:&quot;wait&quot;,&quot;durationMs&quot;:...}; total wait time is capped at 2000 ms.'
if html.count(old)!=1:
    raise SystemExit('expected one action-sequence help match')
index.write_text(html.replace(old,new))
