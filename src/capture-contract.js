export const CAPTURE_SCHEMA='faultline.capture.v1';
export const CAPTURE_LIMITS=Object.freeze({
  sourceBytes:1024*1024,
  totalBytes:4*1024*1024,
  diagnosticsEntries:200,
  diagnosticStringChars:2048,
  metadataStringChars:2048,
  sequenceSteps:8,
  totalWaitMs:2000,
  oracleDelayMs:2000
});

const ORACLE_KINDS=new Set(['dom_property','dom_attribute','computed_style','dom_exists','runtime_error']);
const ACTION_KINDS=new Set(['none','click','set_value','set_checked','sequence']);
const ACTION_STEP_KINDS=new Set(['click','set_value','set_checked','wait']);
const CAPTURE_KEYS=new Set(['schema','capturedAt','source','oracle','environment','provenance','diagnostics']);
const SOURCE_KEYS=new Set(['url','title','html','css','js']);
const ORACLE_KEYS=new Set(['kind','selector','property','equals','action','delayMs']);
const ACTION_KEYS=new Set(['kind','selector','value','checked','steps','durationMs']);
const DIAGNOSTIC_KEYS=new Set(['externalDependencies','consoleErrors','pageErrors']);
const utf8Size=value=>new TextEncoder().encode(String(value)).byteLength;
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=code=>{throw new Error(code)};
const hasUnknownKeys=(value,allowed)=>Object.keys(value).some(key=>!allowed.has(key));

function validateMetadataString(value,{optional=true}={}){
  if(value===undefined&&optional)return;
  if(typeof value!=='string'||value.length>CAPTURE_LIMITS.metadataStringChars)fail('INVALID_CAPTURE');
}

function validateAction(action,{allowSequence=true,allowWait=false}={}){
  if(!action||typeof action!=='object'||Array.isArray(action)||hasUnknownKeys(action,ACTION_KEYS))fail('UNSUPPORTED_CAPTURE_ACTION');
  if(action.kind==='wait'){
    if(!allowWait||Object.keys(action).some(key=>!['kind','durationMs'].includes(key))||!Number.isFinite(action.durationMs)||action.durationMs<0||action.durationMs>CAPTURE_LIMITS.totalWaitMs)fail('UNSUPPORTED_CAPTURE_ACTION');
    return;
  }
  if(!ACTION_KINDS.has(action.kind))fail('UNSUPPORTED_CAPTURE_ACTION');
  if(action.kind==='sequence'){
    if(!allowSequence||Object.hasOwn(action,'selector')||Object.hasOwn(action,'value')||Object.hasOwn(action,'checked')||Object.hasOwn(action,'durationMs')||!Array.isArray(action.steps)||action.steps.length<1||action.steps.length>CAPTURE_LIMITS.sequenceSteps)fail('UNSUPPORTED_CAPTURE_ACTION');
    let totalWait=0;
    for(const step of action.steps){
      if(!ACTION_STEP_KINDS.has(step?.kind))fail('UNSUPPORTED_CAPTURE_ACTION');
      validateAction(step,{allowSequence:false,allowWait:true});
      if(step.kind==='wait')totalWait+=step.durationMs;
    }
    if(totalWait>CAPTURE_LIMITS.totalWaitMs)fail('UNSUPPORTED_CAPTURE_ACTION');
    return;
  }
  if(Object.hasOwn(action,'steps')||Object.hasOwn(action,'durationMs'))fail('UNSUPPORTED_CAPTURE_ACTION');
  if(action.kind!=='set_checked'&&Object.hasOwn(action,'checked'))fail('UNSUPPORTED_CAPTURE_ACTION');
  if(action.kind==='none')return;
  if(typeof action.selector!=='string'||!action.selector.trim())fail('UNSUPPORTED_CAPTURE_ACTION');
  if(action.kind==='set_value'&&typeof action.value!=='string')fail('UNSUPPORTED_CAPTURE_ACTION');
  if(action.kind==='set_checked'&&(typeof action.checked!=='boolean'||Object.hasOwn(action,'value')))fail('UNSUPPORTED_CAPTURE_ACTION');
}

function validateOracle(oracle){
  if(!oracle||typeof oracle!=='object'||Array.isArray(oracle)||hasUnknownKeys(oracle,ORACLE_KEYS)||!ORACLE_KINDS.has(oracle.kind))fail('INVALID_ORACLE');
  validateAction(oracle.action);
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
