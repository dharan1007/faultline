const TARGET_MODES=new Set(['public_url','current_tab','trace_import','complex_demo','legacy_source']);
const ORACLE_OUTCOMES=new Set(['PASS','FAIL','UNRESOLVED']);
const clone=value=>structuredClone?structuredClone(value):JSON.parse(JSON.stringify(value));

function requireObject(value,code){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(code);return value;}
function requireString(value,code){if(typeof value!=='string'||!value.trim())throw new Error(code);return value;}
function validRevision(value){return /^r[1-9]\d*$/.test(String(value));}

export function validateInvestigation(value){
  requireObject(value,'INVALID_INVESTIGATION');
  if(value.schemaVersion!==1)throw new Error('UNSUPPORTED_INVESTIGATION_SCHEMA');
  requireString(value.id,'INVALID_INVESTIGATION_ID');
  if(!validRevision(value.revision))throw new Error('INVALID_INVESTIGATION_REVISION');
  requireString(value.createdAt,'INVALID_INVESTIGATION_TIME');
  requireString(value.updatedAt,'INVALID_INVESTIGATION_TIME');
  const target=requireObject(value.target,'INVALID_INVESTIGATION_TARGET');
  if(!TARGET_MODES.has(target.mode))throw new Error('INVALID_TARGET_MODE');
  requireString(target.url,'INVALID_TARGET_URL');
  requireString(target.origin,'INVALID_TARGET_ORIGIN');
  requireObject(value.environment,'INVALID_INVESTIGATION_ENVIRONMENT');
  requireObject(value.capture,'INVALID_INVESTIGATION_CAPTURE');
  for(const key of ['journey','observations','capabilities','candidateGraph','experiments','receipts','exports'])if(!Array.isArray(value[key]))throw new Error(`INVALID_INVESTIGATION_${key.toUpperCase()}`);
  if(value.oracle!==null&&value.oracle!==undefined)requireObject(value.oracle,'INVALID_INVESTIGATION_ORACLE');
  for(const experiment of value.experiments){if(experiment?.outcome!==undefined&&!ORACLE_OUTCOMES.has(experiment.outcome))throw new Error('INVALID_ORACLE_OUTCOME');}
  return clone(value);
}

export function createInvestigation({id,target,environment,now=new Date().toISOString()}={}){
  requireString(id,'INVALID_INVESTIGATION_ID');
  const normalizedTarget=clone(requireObject(target,'INVALID_INVESTIGATION_TARGET'));
  if(!TARGET_MODES.has(normalizedTarget.mode))throw new Error('INVALID_TARGET_MODE');
  requireString(normalizedTarget.url,'INVALID_TARGET_URL');
  requireString(normalizedTarget.origin,'INVALID_TARGET_ORIGIN');
  const captureStartedAt=normalizedTarget.captureStartedAt||now;
  normalizedTarget.captureStartedAt=captureStartedAt;
  const investigation={
    schemaVersion:1,id,revision:'r1',createdAt:now,updatedAt:now,target:normalizedTarget,
    environment:clone(requireObject(environment,'INVALID_INVESTIGATION_ENVIRONMENT')),
    capture:{id:`capture_${id}`,mode:normalizedTarget.mode,status:'CREATED',startedAt:captureStartedAt,documentSnapshots:[],screenshots:[],consoleEvents:[],runtimeEvents:[],networkEvents:[],navigationEvents:[],resources:[],storageDiffs:[],traceReferences:[],redactionSummary:{redacted:false,categories:[]}},
    journey:[],oracle:null,observations:[],capabilities:[],candidateGraph:[],experiments:[],receipts:[],exports:[]
  };
  return validateInvestigation(investigation);
}

export function canonicalJson(value){
  const normalize=input=>{
    if(Array.isArray(input))return input.map(normalize);
    if(input&&typeof input==='object')return Object.fromEntries(Object.keys(input).sort().filter(key=>input[key]!==undefined).map(key=>[key,normalize(input[key])]));
    return input;
  };
  return JSON.stringify(normalize(value));
}

export async function sha256Hex(value){
  const bytes=new TextEncoder().encode(typeof value==='string'?value:canonicalJson(value));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
