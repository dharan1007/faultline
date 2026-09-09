export const CAPTURE_SCHEMA='faultline.capture.v1';
export const MAX_CAPTURE_SOURCE_BYTES=1_500_000;
export const MAX_CAPTURE_DIAGNOSTICS=100;
const MAX_METADATA_CHARS=4096;
const encoder=new TextEncoder();

const clone=value=>JSON.parse(JSON.stringify(value));
const isObject=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const exactKeys=(value,allowed)=>Object.keys(value).every(key=>allowed.includes(key));

function requireString(value,{allowEmpty=true,max=MAX_METADATA_CHARS,error='INVALID_CAPTURE'}={}){
  if(typeof value!=='string'||(!allowEmpty&&!value.trim())||value.length>max)throw new Error(error);
  return value;
}

function normalizeOptionalString(value,error='INVALID_CAPTURE'){
  if(value===undefined)return undefined;
  return requireString(value,{max:MAX_METADATA_CHARS,error});
}

function normalizeViewport(value){
  if(value===undefined||value===null)return null;
  if(!isObject(value)||!exactKeys(value,['width','height']))throw new Error('INVALID_CAPTURE_PROVENANCE');
  const width=Number(value.width),height=Number(value.height);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>16384||height>16384)throw new Error('INVALID_CAPTURE_PROVENANCE');
  return {width,height};
}

function normalizePlaywright(value){
  if(value===undefined||value===null)return null;
  if(!isObject(value)||!exactKeys(value,['projectName','testTitle']))throw new Error('INVALID_CAPTURE_PROVENANCE');
  const result={};
  if(value.projectName!==undefined)result.projectName=requireString(value.projectName,{max:MAX_METADATA_CHARS,error:'INVALID_CAPTURE_PROVENANCE'});
  if(value.testTitle!==undefined)result.testTitle=requireString(value.testTitle,{max:MAX_METADATA_CHARS,error:'INVALID_CAPTURE_PROVENANCE'});
  return result;
}

function normalizeProvenance(value){
  if(!isObject(value)||!exactKeys(value,['url','title','capturedAt','viewport','userAgent','playwright']))throw new Error('INVALID_CAPTURE_PROVENANCE');
  const result={
    url:requireString(value.url??'',{max:MAX_METADATA_CHARS,error:'INVALID_CAPTURE_PROVENANCE'}),
    title:requireString(value.title??'',{max:MAX_METADATA_CHARS,error:'INVALID_CAPTURE_PROVENANCE'}),
    capturedAt:requireString(value.capturedAt??'',{allowEmpty:false,max:128,error:'INVALID_CAPTURE_PROVENANCE'}),
    viewport:normalizeViewport(value.viewport),
    userAgent:requireString(value.userAgent??'',{max:MAX_METADATA_CHARS,error:'INVALID_CAPTURE_PROVENANCE'}),
    playwright:normalizePlaywright(value.playwright)
  };
  if(Number.isNaN(Date.parse(result.capturedAt)))throw new Error('INVALID_CAPTURE_PROVENANCE');
  return result;
}

function normalizeDiagnosticItem(value,type){
  if(!isObject(value))throw new Error('INVALID_CAPTURE_DIAGNOSTICS');
  if(type==='omitted'){
    if(!exactKeys(value,['kind','url','reason']))throw new Error('INVALID_CAPTURE_DIAGNOSTICS');
    return {
      kind:requireString(value.kind??'',{allowEmpty:false,max:128,error:'INVALID_CAPTURE_DIAGNOSTICS'}),
      url:value.url===null?null:requireString(value.url??'',{max:MAX_METADATA_CHARS,error:'INVALID_CAPTURE_DIAGNOSTICS'}),
      reason:requireString(value.reason??'',{allowEmpty:false,max:256,error:'INVALID_CAPTURE_DIAGNOSTICS'})
    };
  }
  if(!exactKeys(value,['url','chars']))throw new Error('INVALID_CAPTURE_DIAGNOSTICS');
  const chars=Number(value.chars);
  if(!Number.isInteger(chars)||chars<0||chars>MAX_CAPTURE_SOURCE_BYTES)throw new Error('INVALID_CAPTURE_DIAGNOSTICS');
  return {url:value.url===null?null:requireString(value.url??'',{max:MAX_METADATA_CHARS,error:'INVALID_CAPTURE_DIAGNOSTICS'}),chars};
}

function normalizeDiagnosticArray(value,type){
  if(!Array.isArray(value)||value.length>MAX_CAPTURE_DIAGNOSTICS)throw new Error('INVALID_CAPTURE_DIAGNOSTICS');
  return value.map(item=>normalizeDiagnosticItem(item,type));
}

function normalizeDiagnostics(value){
  if(!isObject(value)||!exactKeys(value,['omittedResources','capturedScripts','capturedStylesheets']))throw new Error('INVALID_CAPTURE_DIAGNOSTICS');
  return {
    omittedResources:normalizeDiagnosticArray(value.omittedResources,'omitted'),
    capturedScripts:normalizeDiagnosticArray(value.capturedScripts,'captured'),
    capturedStylesheets:normalizeDiagnosticArray(value.capturedStylesheets,'captured')
  };
}

function normalizeCase(value){
  if(!isObject(value)||!exactKeys(value,['html','css','js','oracle'])||Object.keys(value).length!==4)throw new Error('INVALID_CAPTURE_CASE');
  if(typeof value.html!=='string'||typeof value.css!=='string'||typeof value.js!=='string'||!isObject(value.oracle))throw new Error('INVALID_CAPTURE_CASE');
  const sourceBytes=encoder.encode(value.html).byteLength+encoder.encode(value.css).byteLength+encoder.encode(value.js).byteLength;
  if(sourceBytes>MAX_CAPTURE_SOURCE_BYTES)throw new Error('CAPTURE_SOURCE_TOO_LARGE');
  return {html:value.html,css:value.css,js:value.js,oracle:clone(value.oracle)};
}

export function normalizeCapture(value){
  if(!isObject(value)||!exactKeys(value,['schema','case','provenance','diagnostics']))throw new Error('INVALID_CAPTURE');
  if(value.schema!==CAPTURE_SCHEMA)throw new Error('INVALID_CAPTURE_SCHEMA');
  if(!Object.hasOwn(value,'case')||!Object.hasOwn(value,'provenance')||!Object.hasOwn(value,'diagnostics'))throw new Error('INVALID_CAPTURE');
  return {
    schema:CAPTURE_SCHEMA,
    case:normalizeCase(value.case),
    provenance:normalizeProvenance(value.provenance),
    diagnostics:normalizeDiagnostics(value.diagnostics)
  };
}

export function captureSummary(value){
  const capture=normalizeCapture(value);
  return {
    schema:capture.schema,
    url:capture.provenance.url,
    title:capture.provenance.title,
    capturedAt:capture.provenance.capturedAt,
    projectName:capture.provenance.playwright?.projectName??null,
    testTitle:capture.provenance.playwright?.testTitle??null,
    omittedResources:capture.diagnostics.omittedResources.length,
    sourceBytes:encoder.encode(capture.case.html).byteLength+encoder.encode(capture.case.css).byteLength+encoder.encode(capture.case.js).byteLength
  };
}