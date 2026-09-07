import {createInvestigation} from './investigation-protocol.js';

const clone=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
const LEGACY_KEYS=['html','css','js','oracle'];

function validateLegacyCase(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('INVALID_LEGACY_CASE');
  const keys=Object.keys(value).sort();
  if(keys.length!==4||LEGACY_KEYS.some(key=>!keys.includes(key)))throw new Error('INVALID_LEGACY_CASE');
  if(typeof value.html!=='string'||typeof value.css!=='string'||typeof value.js!=='string'||!value.oracle||typeof value.oracle!=='object'||Array.isArray(value.oracle))throw new Error('INVALID_LEGACY_CASE');
  return clone(value);
}

export function legacyCaseToInvestigation(caseValue,{id=`inv_legacy_${Date.now()}`,now=new Date().toISOString()}={}){
  const legacyCase=validateLegacyCase(caseValue);
  const investigation=createInvestigation({
    id,now,
    target:{mode:'legacy_source',url:'faultline://legacy-source',origin:'faultline://legacy-source',captureStartedAt:now},
    environment:{browserName:'isolated-iframe',browserVersion:'legacy',viewport:{width:0,height:0},deviceScaleFactor:1,locale:'und',timezone:'local',colorScheme:'dark',userAgent:'faultline-legacy-source',reducedMotion:'no-preference'}
  });
  investigation.capture.status='COMPLETE';
  investigation.capture.completedAt=now;
  investigation.capture.legacyCase=legacyCase;
  investigation.capabilities=[
    {id:'legacy.html',axis:'html',observable:true,controllable:true},
    {id:'legacy.css',axis:'css',observable:true,controllable:true},
    {id:'legacy.js',axis:'js',observable:true,controllable:true}
  ];
  investigation.oracle=clone(legacyCase.oracle);
  return investigation;
}

export function investigationToLegacyCase(investigation){
  if(investigation?.target?.mode!=='legacy_source')throw new Error('NOT_LEGACY_SOURCE_INVESTIGATION');
  return validateLegacyCase(investigation?.capture?.legacyCase);
}
