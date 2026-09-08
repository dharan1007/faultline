const SUPPORTED_KINDS=new Set(['click','type','select','check','uncheck','wait','navigate','assertion']);
const clone=value=>value===undefined?undefined:(typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value)));

function deepFreeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function requireString(value,code){if(typeof value!=='string'||!value.trim())throw new Error(code);return value.trim();}
function normalizeTimeout(value){
  if(value===undefined)return 5000;
  if(!Number.isInteger(value)||value<1||value>30000)throw new Error('INVALID_JOURNEY_TIMEOUT');
  return value;
}
function normalizeTarget(value){
  if(value===undefined||value===null)return null;
  if(typeof value!=='object'||Array.isArray(value))throw new Error('INVALID_JOURNEY_TARGET');
  const target={};
  for(const key of ['role','accessibleName','testId','text','css','label'])if(typeof value[key]==='string'&&value[key].trim())target[key]=value[key].trim();
  if(!Object.keys(target).length)throw new Error('INVALID_JOURNEY_TARGET');
  return deepFreeze(target);
}

export function rankSelectorStrategies(snapshot={}){
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))throw new Error('INVALID_SELECTOR_SNAPSHOT');
  const strategies=[];
  const role=typeof snapshot.role==='string'?snapshot.role.trim():'';
  const name=typeof snapshot.accessibleName==='string'?snapshot.accessibleName.trim():'';
  if(role&&name)strategies.push({kind:'role',role,name});
  const testId=typeof snapshot.testId==='string'?snapshot.testId.trim():'';
  if(testId)strategies.push({kind:'test_id',value:testId});
  const text=typeof snapshot.text==='string'?snapshot.text.trim():'';
  if(text)strategies.push({kind:'text',value:text});
  const css=typeof snapshot.css==='string'?snapshot.css.trim():'';
  if(css)strategies.push({kind:'css',value:css});
  if(!strategies.length)throw new Error('NO_SELECTOR_STRATEGY');
  return deepFreeze(strategies);
}

export function createJourneyStep(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('INVALID_JOURNEY_STEP');
  const id=requireString(input.id,'INVALID_JOURNEY_STEP_ID');
  const kind=requireString(input.kind,'INVALID_JOURNEY_STEP_KIND');
  if(!SUPPORTED_KINDS.has(kind))throw new Error('UNSUPPORTED_JOURNEY_STEP_KIND');
  const target=normalizeTarget(input.target);
  if(!['wait','navigate','assertion'].includes(kind)&&!target)throw new Error('JOURNEY_TARGET_REQUIRED');
  const sensitive=input.sensitive===true;
  const step={id,kind,target,timeoutMs:normalizeTimeout(input.timeoutMs),sensitive};
  if(input.value!==undefined)step.value=sensitive?'[REDACTED]':clone(input.value);
  if(input.url!==undefined)step.url=requireString(input.url,'INVALID_JOURNEY_URL');
  if(input.precondition!==undefined)step.precondition=clone(input.precondition);
  if(input.oracle!==undefined)step.oracle=clone(input.oracle);
  return deepFreeze(step);
}

export function validateJourney(value){
  if(!Array.isArray(value))throw new Error('INVALID_JOURNEY');
  const ids=new Set();
  const result=value.map(raw=>{
    const step=createJourneyStep(raw);
    if(ids.has(step.id))throw new Error('DUPLICATE_JOURNEY_STEP_ID');
    ids.add(step.id);
    return step;
  });
  return deepFreeze(result);
}
