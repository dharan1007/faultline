const FORMAT='faultline.capture';
const VERSION=1;
const BASELINE_NOTE='Source and oracle captured from the Playwright test boundary; FAULTLINE independently re-verifies FAIL before import.';
const MAX_TEXT=2048;
const TOP_LEVEL_KEYS=['format','version','capturedAt','case','provenance','baseline'];
const CASE_KEYS=['html','css','js','oracle'];
const PROVENANCE_KEYS=['adapter','adapterVersion','url','title','userAgent','viewport','browser'];
const BASELINE_KEYS=['captured','status','evidence','note'];

const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const fail=detail=>{throw new Error(`FAULTLINE_CAPTURE_INVALID${detail?`:${detail}`:''}`);};
const exactKeys=(value,keys)=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const actual=Object.keys(value).sort();
  const expected=[...keys].sort();
  return actual.length===expected.length&&actual.every((key,index)=>key===expected[index]);
};
const boundedText=(value,{allowEmpty=false}={})=>typeof value==='string'&&(allowEmpty||value.length>0)&&value.length<=MAX_TEXT;
const positiveInteger=value=>Number.isInteger(value)&&value>0;

function validateCaseShape(caseValue){
  if(!exactKeys(caseValue,CASE_KEYS))fail('CASE_KEYS');
  if(typeof caseValue.html!=='string'||typeof caseValue.css!=='string'||typeof caseValue.js!=='string')fail('CASE_SOURCE');
  if(!caseValue.oracle||typeof caseValue.oracle!=='object'||Array.isArray(caseValue.oracle))fail('CASE_ORACLE');
  return caseValue;
}

function validateProvenance(provenance){
  if(!exactKeys(provenance,PROVENANCE_KEYS))fail('PROVENANCE_KEYS');
  if(provenance.adapter!=='faultline-playwright'||provenance.adapterVersion!==VERSION)fail('PROVENANCE_ADAPTER');
  if(!boundedText(provenance.url)||!boundedText(provenance.title,{allowEmpty:true})||!boundedText(provenance.userAgent)||!boundedText(provenance.browser))fail('PROVENANCE_TEXT');
  try{new URL(provenance.url);}catch{fail('PROVENANCE_URL');}
  if(!exactKeys(provenance.viewport,['width','height'])||!positiveInteger(provenance.viewport.width)||!positiveInteger(provenance.viewport.height))fail('PROVENANCE_VIEWPORT');
  return provenance;
}

function validateBaseline(baseline){
  if(!exactKeys(baseline,BASELINE_KEYS)||baseline.captured!==true||baseline.status!=='FAIL'||baseline.note!==BASELINE_NOTE)fail('BASELINE');
  if(!baseline.evidence||typeof baseline.evidence!=='object'||Array.isArray(baseline.evidence))fail('BASELINE_EVIDENCE');
  return baseline;
}

export function validateCaptureArtifact(input){
  if(!exactKeys(input,TOP_LEVEL_KEYS))fail('ENVELOPE_KEYS');
  if(input.format!==FORMAT)fail('FORMAT');
  if(input.version!==VERSION)fail('VERSION');
  if(typeof input.capturedAt!=='string'||Number.isNaN(Date.parse(input.capturedAt))||new Date(input.capturedAt).toISOString()!==input.capturedAt)fail('CAPTURED_AT');
  validateCaseShape(input.case);
  validateProvenance(input.provenance);
  validateBaseline(input.baseline);
  return clone(input);
}

export function createCaptureArtifact({caseValue,provenance,baseline,capturedAt=new Date().toISOString()}={}){
  const artifact={
    format:FORMAT,
    version:VERSION,
    capturedAt,
    case:clone(caseValue),
    provenance:clone(provenance),
    baseline:{
      captured:true,
      status:baseline?.status,
      evidence:clone(baseline?.evidence||{}),
      note:BASELINE_NOTE
    }
  };
  return validateCaptureArtifact(artifact);
}

export const CAPTURE_FORMAT=FORMAT;
export const CAPTURE_VERSION=VERSION;
export const CAPTURE_BASELINE_NOTE=BASELINE_NOTE;
