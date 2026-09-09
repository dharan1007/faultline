export const CAPTURE_SCHEMA='faultline.capture.v1';
export const CAPTURE_MAX_SEQUENCE_STEPS=8;
export const CAPTURE_MAX_WAIT_MS=2000;

const ORACLE_KINDS=new Set(['dom_property','dom_attribute','computed_style','dom_exists','runtime_error']);
const ACTION_KINDS=new Set(['none','click','set_value','set_checked','sequence']);
const STEP_KINDS=new Set(['click','set_value','set_checked','wait']);
const TOP_KEYS=new Set(['schema','source','oracle','provenance','expectedStatus']);
const SOURCE_KEYS=new Set(['html','css','js']);
const PROVENANCE_KEYS=new Set(['url','title','capturedAt','userAgent','label']);
const ORACLE_KEYS=new Set(['kind','selector','property','equals','action','delayMs']);
const ACTION_KEYS=new Set(['kind','selector','value','checked','steps','durationMs']);

const clone=value=>JSON.parse(JSON.stringify(value));
const invalid=()=>{throw new Error('INVALID_CAPTURE');};
const exactKeys=(object,allowed,required=[])=>{
  if(!object||typeof object!=='object'||Array.isArray(object))invalid();
  const keys=Object.keys(object);
  if(keys.some(key=>!allowed.has(key))||required.some(key=>!Object.hasOwn(object,key)))invalid();
};

function validateAction(action,{allowSequence=true,allowWait=false}={}){
  exactKeys(action,ACTION_KEYS,['kind']);
  if(action.kind==='wait'){
    if(!allowWait||Object.keys(action).some(key=>!['kind','durationMs'].includes(key))||!Number.isFinite(action.durationMs)||action.durationMs<0||action.durationMs>CAPTURE_MAX_WAIT_MS)invalid();
    return;
  }
  if(!ACTION_KINDS.has(action.kind))invalid();
  if(action.kind==='sequence'){
    if(!allowSequence||Object.hasOwn(action,'selector')||Object.hasOwn(action,'value')||Object.hasOwn(action,'checked')||Object.hasOwn(action,'durationMs')||!Array.isArray(action.steps)||action.steps.length<1||action.steps.length>CAPTURE_MAX_SEQUENCE_STEPS)invalid();
    let totalWait=0;
    for(const step of action.steps){
      if(!step||!STEP_KINDS.has(step.kind))invalid();
      validateAction(step,{allowSequence:false,allowWait:true});
      if(step.kind==='wait')totalWait+=step.durationMs;
    }
    if(totalWait>CAPTURE_MAX_WAIT_MS)invalid();
    return;
  }
  if(Object.hasOwn(action,'steps')||Object.hasOwn(action,'durationMs'))invalid();
  if(action.kind==='none'){
    if(Object.keys(action).some(key=>key!=='kind'))invalid();
    return;
  }
  if(typeof action.selector!=='string'||!action.selector.trim())invalid();
  if(action.kind==='click'){
    if(Object.keys(action).some(key=>!['kind','selector'].includes(key)))invalid();
    return;
  }
  if(action.kind==='set_value'){
    if(typeof action.value!=='string'||Object.keys(action).some(key=>!['kind','selector','value'].includes(key)))invalid();
    return;
  }
  if(action.kind==='set_checked'){
    if(typeof action.checked!=='boolean'||Object.keys(action).some(key=>!['kind','selector','checked'].includes(key)))invalid();
    return;
  }
  invalid();
}

function validateOracle(oracle){
  exactKeys(oracle,ORACLE_KEYS,['kind','action']);
  if(!ORACLE_KINDS.has(oracle.kind))invalid();
  validateAction(oracle.action);
  if(oracle.kind!=='runtime_error'&&(typeof oracle.selector!=='string'||!oracle.selector.trim()))invalid();
  if(['dom_property','dom_attribute','computed_style'].includes(oracle.kind)&&(typeof oracle.property!=='string'||!oracle.property.trim()))invalid();
  if(oracle.kind==='dom_attribute'&&!(typeof oracle.equals==='string'||oracle.equals===null))invalid();
  if(oracle.delayMs!==undefined&&(!Number.isFinite(oracle.delayMs)||oracle.delayMs<0||oracle.delayMs>CAPTURE_MAX_WAIT_MS))invalid();
}

export function normalizeCapture(capture){
  exactKeys(capture,TOP_KEYS,['schema','source','oracle','provenance','expectedStatus']);
  if(capture.schema!==CAPTURE_SCHEMA||capture.expectedStatus!=='FAIL')invalid();

  exactKeys(capture.source,SOURCE_KEYS,['html','css','js']);
  if(typeof capture.source.html!=='string'||typeof capture.source.css!=='string'||typeof capture.source.js!=='string')invalid();

  exactKeys(capture.provenance,PROVENANCE_KEYS,['url','title','capturedAt','userAgent']);
  for(const key of ['url','title','capturedAt','userAgent']) if(typeof capture.provenance[key]!=='string'||!capture.provenance[key].trim())invalid();
  try{new URL(capture.provenance.url);}catch{invalid();}
  if(Number.isNaN(Date.parse(capture.provenance.capturedAt)))invalid();
  if(Object.hasOwn(capture.provenance,'label')&&typeof capture.provenance.label!=='string')invalid();

  validateOracle(capture.oracle);

  return clone({
    case:{html:capture.source.html,css:capture.source.css,js:capture.source.js,oracle:capture.oracle},
    provenance:capture.provenance,
    expectedStatus:'FAIL'
  });
}
