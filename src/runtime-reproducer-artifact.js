import { validateCaptureAction } from './capture-contract.js';
import { FINGERPRINT_VERSION } from './causal-fingerprint.js';

export const RUNTIME_REPRO_SCHEMA='faultline.runtime-repro.v1';
const SHA=/^[0-9a-f]{40}$/i;
const ZERO_SHA=/^0{40}$/;
const fail=code=>{throw new Error(code)};
const text=(value,max=2048)=>typeof value==='string'&&value.trim()&&value.length<=max?value.trim():null;
const clone=value=>structuredClone(value);

function safeUrl(value,{required=false}={}){
  if(value==null&&!required)return null;
  let url;
  try{url=new URL(value);}catch{fail('FAULTLINE_RUNTIME_REPRO_INVALID_URL');}
  if(!['https:','http:'].includes(url.protocol))fail('FAULTLINE_RUNTIME_REPRO_INVALID_URL');
  url.username='';url.password='';url.search='';url.hash='';
  return url.toString();
}

function sourceIdentity(sourceRepository,sourceCommit){
  const repository=text(sourceRepository);
  const raw=String(sourceCommit??'').trim().toLowerCase();
  if(repository&&!raw)fail('FAULTLINE_RUNTIME_REPRO_SOURCE_COMMIT_REQUIRED');
  if(raw&&(!SHA.test(raw)||ZERO_SHA.test(raw)))fail('FAULTLINE_RUNTIME_REPRO_INVALID_SOURCE_COMMIT');
  return {sourceRepository:repository,sourceCommit:raw||null};
}

function recipe(value,name){
  if(!Array.isArray(value)||value.length>64)fail(`FAULTLINE_RUNTIME_REPRO_INVALID_${name}`);
  for(const action of value)validateCaptureAction(action);
  return clone(value);
}

function fingerprint(value,name){
  if(!value||typeof value!=='object'||value.version!==FINGERPRINT_VERSION||typeof value.signature!=='string'||!value.signature)fail(`FAULTLINE_RUNTIME_REPRO_INVALID_${name}_FINGERPRINT`);
  return clone(value);
}

function boundedMetric(value,name,{integer=false,min=0,max=Number.MAX_SAFE_INTEGER}={}){
  if((integer?!Number.isSafeInteger(value):!Number.isFinite(value))||value<min||value>max)fail(`FAULTLINE_RUNTIME_REPRO_INVALID_${name}`);
  return value;
}

function dependencies(values){
  if(values==null)return [];
  if(!Array.isArray(values)||values.length>100)fail('FAULTLINE_RUNTIME_REPRO_INVALID_DEPENDENCIES');
  return values.map(value=>safeUrl(value,{required:true}));
}

export function createRuntimeReproducerArtifact({
  sourceRepository=null,sourceCommit=null,applicationUrl,browser='unknown',browserVersion='',playwrightVersion='',resetId,
  originalRecipe,reducedRecipe,oracle,baselineFingerprint,finalFingerprint,trialCount,wallTimeMs,reduction,externalDependencies=[]
}={}){
  const source=sourceIdentity(sourceRepository,sourceCommit);
  const normalizedReset=text(resetId,256);if(!normalizedReset)fail('FAULTLINE_RUNTIME_REPRO_RESET_ID_REQUIRED');
  if(!oracle||typeof oracle!=='object'||Array.isArray(oracle))fail('FAULTLINE_RUNTIME_REPRO_ORACLE_REQUIRED');
  const original=recipe(originalRecipe,'ORIGINAL_RECIPE');
  const reduced=recipe(reducedRecipe,'REDUCED_RECIPE');
  if(reduced.length>original.length)fail('FAULTLINE_RUNTIME_REPRO_RECIPE_GROWTH');
  const trials=boundedMetric(trialCount,'TRIAL_COUNT',{integer:true,min:1,max:10000});
  const wall=boundedMetric(wallTimeMs,'WALL_TIME',{min:0,max:86_400_000});
  const ratio=boundedMetric(reduction,'REDUCTION',{min:0,max:1});
  const expectedReduction=original.length?1-reduced.length/original.length:0;
  if(Math.abs(expectedReduction-ratio)>1e-9)fail('FAULTLINE_RUNTIME_REPRO_REDUCTION_MISMATCH');
  return Object.freeze({
    schema:RUNTIME_REPRO_SCHEMA,
    portable:false,
    source,
    applicationUrl:safeUrl(applicationUrl,{required:true}),
    environment:{browser:text(browser,128)||'unknown',browserVersion:text(browserVersion,256)||'',playwrightVersion:text(playwrightVersion,256)||''},
    reset:{id:normalizedReset},
    originalRecipe:original,
    reducedRecipe:reduced,
    oracle:clone(oracle),
    baselineFingerprint:fingerprint(baselineFingerprint,'BASELINE'),
    finalFingerprint:fingerprint(finalFingerprint,'FINAL'),
    metrics:{trialCount:trials,wallTimeMs:wall,reduction:ratio,originalSteps:original.length,reducedSteps:reduced.length},
    externalDependencies:dependencies(externalDependencies)
  });
}
