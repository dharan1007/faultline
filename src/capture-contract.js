export const CAPTURE_SCHEMA='faultline.capture.v1';
export const CAPTURE_LIMITS=Object.freeze({
  sourceBytes:1024*1024,
  totalBytes:4*1024*1024,
  diagnosticsEntries:200,
  diagnosticStringChars:2048,
  metadataStringChars:2048,
  sequenceSteps:16,
  totalWaitMs:5000,
  oracleDelayMs:5000
});

const ORACLE_KINDS=new Set(['dom_property','dom_attribute','computed_style','dom_exists','runtime_error']);
export const ACTION_KINDS=Object.freeze(['none','click','hover','pointer_move','set_value','set_checked','key_press','focus','blur','scroll','select_option','sequence']);
export const ACTION_STEP_KINDS=Object.freeze(['click','hover','pointer_move','set_value','set_checked','key_press','focus','blur','scroll','select_option','wait']);
const ACTION_KIND_SET=new Set(ACTION_KINDS);
const ACTION_STEP_KIND_SET=new Set(ACTION_STEP_KINDS);
const CAPTURE_KEYS=new Set(['schema','capturedAt','source','oracle','environment','provenance','diagnostics']);
const SOURCE_KEYS=new Set(['url','title','html','css','js']);
const ORACLE_KEYS=new Set(['kind','selector','property','equals','action','delayMs']);
const ACTION_KEYS=new Set(['kind','selector','value','checked','steps','durationMs','key','x','y']);
const DIAGNOSTIC_KEYS=new Set(['externalDependencies','consoleErrors','pageErrors']);
const utf8Size=value=>new TextEncoder().encode(String(value)).byteLength;
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=code=>{throw new Error(code)};
const hasUnknownKeys=(value,allowed)=>Object.keys(value).some(key=>!allowed.has(key));
const hasOwn=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const validSelector=value=>typeof value==='string'&&value.trim().length>0&&value.length<=2048;
const finiteCoord=value=>Number.isFinite(value)&&Math.abs(value)<=1_000_000;

function validateMetadataString(value,{optional=true}={}){
  if(value===undefined&&optional)return;
  if(typeof value!=='string'||value.length>CAPTURE_LIMITS.metadataStringChars)fail('INVALID_CAPTURE');
}

function forbid(action,keys){
  if(keys.some(key=>hasOwn(action,key)))fail('UNSUPPORTED_CAPTURE_ACTION');
}

export function validateCaptureAction(action,{allowSequence=true,allowWait=false}={}){
  if(!action||typeof action!=='object'||Array.isArray(action)||hasUnknownKeys(action,ACTION_KEYS))fail('UNSUPPORTED_CAPTURE_ACTION');
  if(action.kind==='wait'){
    if(!allowWait||Object.keys(action).some(key=>!['kind','durationMs'].includes(key))||!Number.isFinite(action.durationMs)||action.durationMs<0||action.durationMs>CAPTURE_LIMITS.totalWaitMs)fail('UNSUPPORTED_CAPTURE_ACTION');
    return action;
  }
  if(!ACTION_KIND_SET.has(action.kind))fail('UNSUPPORTED_CAPTURE_ACTION');
  if(action.kind==='sequence'){
    if(!allowSequence||Object.keys(action).some(key=>!['kind','steps'].includes(key))||!Array.isArray(action.steps)||action.steps.length<1||action.steps.length>CAPTURE_LIMITS.sequenceSteps)fail('UNSUPPORTED_CAPTURE_ACTION');
    let totalWait=0;
    for(const step of action.steps){
      if(!ACTION_STEP_KIND_SET.has(step?.kind))fail('UNSUPPORTED_CAPTURE_ACTION');
      validateCaptureAction(step,{allowSequence:false,allowWait:true});
      if(step.kind==='wait')totalWait+=step.durationMs;
    }
    if(totalWait>CAPTURE_LIMITS.totalWaitMs)fail('UNSUPPORTED_CAPTURE_ACTION');
    return action;
  }
  forbid(action,['steps','durationMs']);
  if(action.kind==='none'){
    if(Object.keys(action).length!==1)fail('UNSUPPORTED_CAPTURE_ACTION');
    return action;
  }
  if(['click','hover','focus','blur'].includes(action.kind)){
    if(!validSelector(action.selector)||Object.keys(action).some(key=>!['kind','selector'].includes(key)))fail('UNSUPPORTED_CAPTURE_ACTION');
    return action;
  }
  if(action.kind==='pointer_move'){
    if(hasOwn(action,'selector')&&!validSelector(action.selector))fail('UNSUPPORTED_CAPTURE_ACTION');
    if(hasOwn(action,'x')&&!finiteCoord(action.x))fail('UNSUPPORTED_CAPTURE_ACTION');
    if(hasOwn(action,'y')&&!finiteCoord(action.y))fail('UNSUPPORTED_CAPTURE_ACTION');
    if(!hasOwn(action,'selector')&&!(hasOwn(action,'x')&&hasOwn(action,'y')))fail('UNSUPPORTED_CAPTURE_ACTION');
    if(Object.keys(action).some(key=>!['kind','selector','x','y'].includes(key)))fail('UNSUPPORTED_CAPTURE_ACTION');
    return action;
  }
  if(action.kind==='set_value'){
    if(!validSelector(action.selector)||typeof action.value!=='string'||Object.keys(action).some(key=>!['kind','selector','value'].includes(key)))fail('UNSUPPORTED_CAPTURE_ACTION');
    return action;
  }
  if(action.kind==='set_checked'){
    if(!validSelector(action.selector)||typeof action.checked!=='boolean'||Object.keys(action).some(key=>!['kind','selector','checked'].includes(key)))fail('UNSUPPORTED_CAPTURE_ACTION');
    return action;
  }
  if(action.kind==='key_press'){
    if(hasOwn(action,'selector')&&!validSelector(action.selector))fail('UNSUPPORTED_CAPTURE_ACTION');
    if(typeof action.key!=='string'||!action.key||action.key.length>64||/[\r\n\0]/.test(action.key)||Object.keys(action).some(key=>!['kind','selector','key'].includes(key)))fail('UNSUPPORTED_CAPTURE_ACTION');
    return action;
  }
  if(action.kind==='scroll'){
    if(hasOwn(action,'selector')&&!validSelector(action.selector))fail('UNSUPPORTED_CAPTURE_ACTION');
    if(hasOwn(action,'x')&&!finiteCoord(action.x))fail('UNSUPPORTED_CAPTURE_ACTION');
    if(hasOwn(action,'y')&&!finiteCoord(action.y))fail('UNSUPPORTED_CAPTURE_ACTION');
    if(!hasOwn(action,'x')&&!hasOwn(action,'y'))fail('UNSUPPORTED_CAPTURE_ACTION');
    if(Object.keys(action).some(key=>!['kind','selector','x','y'].includes(key)))fail('UNSUPPORTED_CAPTURE_ACTION');
    return action;
  }
  if(action.kind==='select_option'){
    if(!validSelector(action.selector)||typeof action.value!=='string'||Object.keys(action).some(key=>!['kind','selector','value'].includes(key)))fail('UNSUPPORTED_CAPTURE_ACTION');
    return action;
  }
  fail('UNSUPPORTED_CAPTURE_ACTION');
}

function validateOracle(oracle){
  if(!oracle||typeof oracle!=='object'||Array.isArray(oracle)||hasUnknownKeys(oracle,ORACLE_KEYS)||!ORACLE_KINDS.has(oracle.kind))fail('INVALID_ORACLE');
  validateCaptureAction(oracle.action);
  if(oracle.kind!=='runtime_error'&&(typeof oracle.selector!=='string'||!oracle.selector.trim()))fail('INVALID_ORACLE');
  if(['dom_property','dom_attribute','computed_style'].includes(oracle.kind)&&(typeof oracle.property!=='string'||!oracle.property.trim()))fail('INVALID_ORACLE');
  if(oracle.kind==='dom_attribute'&&!(typeof oracle.equals==='string'||oracle.equals===null))fail('INVALID_ORACLE');
  if(oracle.delayMs!==undefined&&(!Number.isFinite(oracle.delayMs)||oracle.delayMs<0||oracle.delayMs>CAPTURE_LIMITS.oracleDelayMs))fail('INVALID_ORACLE');
}

function validateDiagnostics(diagnostics={}){
  if(!diagnostics||typeof diagnostics!=='object'||Array.isArray(diagnostics)||hasUnknownKeys(diagnostics,DIAGNOSTIC_KEYS))fail('INVALID_CAPTURE');
  for(const key of DIAGNOSTIC_KEYS){
    const entries=diagnostics[key]??[];
    if(!Array.isArray(entries)||entries.length>CAPTURE_LIMITS.diagnosticsEntries)fail('INVALID_CAPTURE');
    if(entries.some(entry=>typeof entry!=='string'||entry.length>CAPTURE_LIMITS.diagnosticStringChars))fail('INVALID_CAPTURE');
  }
  if((diagnostics.externalDependencies??[]).length)fail('UNSUPPORTED_CAPTURE_DEPENDENCY');
}

export function validateCaptureArtifact(capture){
  if(!capture||typeof capture!=='object'||Array.isArray(capture)||hasUnknownKeys(capture,CAPTURE_KEYS))fail('INVALID_CAPTURE');
  if(capture.schema!==CAPTURE_SCHEMA)fail('UNSUPPORTED_CAPTURE_SCHEMA');
  validateMetadataString(capture.capturedAt);
  if(!capture.source||typeof capture.source!=='object'||Array.isArray(capture.source)||hasUnknownKeys(capture.source,SOURCE_KEYS))fail('INVALID_CAPTURE');
  for(const key of ['html','css','js']){
    if(typeof capture.source[key]!=='string')fail('INVALID_CAPTURE');
    if(utf8Size(capture.source[key])>CAPTURE_LIMITS.sourceBytes)fail('CAPTURE_TOO_LARGE');
  }
  validateMetadataString(capture.source.url);
  validateMetadataString(capture.source.title);
  if(capture.environment!==undefined&&(!capture.environment||typeof capture.environment!=='object'||Array.isArray(capture.environment)))fail('INVALID_CAPTURE');
  if(!capture.provenance||typeof capture.provenance!=='object'||Array.isArray(capture.provenance))fail('INVALID_CAPTURE');
  validateMetadataString(capture.provenance.adapter,{optional:false});
  if(!capture.provenance.adapter.trim())fail('INVALID_CAPTURE');
  validateOracle(capture.oracle);
  validateDiagnostics(capture.diagnostics??{});
  let serialized;
  try{serialized=JSON.stringify(capture)}catch{fail('INVALID_CAPTURE')}
  if(utf8Size(serialized)>CAPTURE_LIMITS.totalBytes)fail('CAPTURE_TOO_LARGE');
  return capture;
}

export function summarizeCaptureProvenance(capture){
  validateCaptureArtifact(capture);
  const diagnostics=capture.diagnostics??{};
  return {
    schema:CAPTURE_SCHEMA,
    capturedAt:typeof capture.capturedAt==='string'?capture.capturedAt:null,
    sourceUrl:typeof capture.source.url==='string'?capture.source.url:null,
    environment:capture.environment&&typeof capture.environment==='object'&&!Array.isArray(capture.environment)?clone(capture.environment):null,
    provenance:clone(capture.provenance),
    diagnosticsSummary:{
      externalDependencies:(diagnostics.externalDependencies??[]).length,
      consoleErrors:(diagnostics.consoleErrors??[]).length,
      pageErrors:(diagnostics.pageErrors??[]).length
    }
  };
}

export function normalizeCaptureArtifact(capture){
  validateCaptureArtifact(capture);
  return {
    case:{html:capture.source.html,css:capture.source.css,js:capture.source.js,oracle:clone(capture.oracle)},
    provenance:summarizeCaptureProvenance(capture)
  };
}