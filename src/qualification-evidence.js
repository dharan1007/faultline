import { createHash } from 'node:crypto';

const SHA=/^[0-9a-f]{40}$/i;
const ZERO_SHA=/^0{40}$/;
const fail=code=>{throw new Error(code)};
const clone=value=>structuredClone(value);
const isObject=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const nonEmpty=(value,code,max=4096)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail(code);return value.trim();};

function canonical(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

export function qualificationDigest(value){return createHash('sha256').update(canonical(value)).digest('hex');}

export function validateExternalCase(caseDef){
  if(!isObject(caseDef))fail('FAULTLINE_QUALIFICATION_INVALID_CASE');
  const id=nonEmpty(caseDef.id,'FAULTLINE_QUALIFICATION_CASE_ID_REQUIRED',256);
  const repository=nonEmpty(caseDef.repository,'FAULTLINE_QUALIFICATION_REPOSITORY_REQUIRED',2048);
  let repoUrl;try{repoUrl=new URL(repository);}catch{fail('FAULTLINE_QUALIFICATION_INVALID_REPOSITORY');}
  if(repoUrl.protocol!=='https:')fail('FAULTLINE_QUALIFICATION_INVALID_REPOSITORY');
  const commit=String(caseDef.commit??'').trim().toLowerCase();
  if(!SHA.test(commit)||ZERO_SHA.test(commit))fail('FAULTLINE_QUALIFICATION_IMMUTABLE_COMMIT_REQUIRED');
  const reproduction=nonEmpty(caseDef.reproduction,'FAULTLINE_QUALIFICATION_REPRODUCTION_REQUIRED',8192);
  const license=nonEmpty(caseDef.license,'FAULTLINE_QUALIFICATION_LICENSE_REQUIRED',256);
  const provenance=nonEmpty(caseDef.provenance,'FAULTLINE_QUALIFICATION_PROVENANCE_REQUIRED',2048);
  if(!isObject(caseDef.expectedFailure)||(!caseDef.expectedFailure.oracle&&!caseDef.expectedFailure.fingerprint))fail('FAULTLINE_QUALIFICATION_EXPECTED_FAILURE_REQUIRED');
  return {id,repository:repoUrl.toString(),commit,reproduction,license,provenance,expectedFailure:clone(caseDef.expectedFailure)};
}

export function validateQualificationManifest(manifest){
  if(!isObject(manifest)||manifest.schema!=='faultline.external-corpus.v1'||!Array.isArray(manifest.cases))fail('FAULTLINE_QUALIFICATION_INVALID_MANIFEST');
  if(manifest.cases.length>500)fail('FAULTLINE_QUALIFICATION_TOO_MANY_CASES');
  const ids=new Set();
  const upstreamCases=new Set();
  const cases=manifest.cases.map(entry=>{
    const normalized=validateExternalCase(entry);
    if(ids.has(normalized.id))fail('FAULTLINE_QUALIFICATION_DUPLICATE_CASE');
    ids.add(normalized.id);
    const upstreamIdentity=qualificationDigest({repository:normalized.repository,commit:normalized.commit,reproduction:normalized.reproduction});
    if(upstreamCases.has(upstreamIdentity))fail('FAULTLINE_QUALIFICATION_DUPLICATE_UPSTREAM_CASE');
    upstreamCases.add(upstreamIdentity);
    return normalized;
  });
  return {schema:manifest.schema,cases,digest:qualificationDigest({schema:manifest.schema,cases})};
}

function percentile(values,p){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const index=Math.min(sorted.length-1,Math.max(0,Math.ceil((p/100)*sorted.length)-1));
  return sorted[index];
}

export function summarizeQualification(results){
  if(!Array.isArray(results))fail('FAULTLINE_QUALIFICATION_RESULTS_REQUIRED');
  const ids=new Set();
  const normalized=results.map(result=>{
    if(!isObject(result))fail('FAULTLINE_QUALIFICATION_INVALID_RESULT');
    const id=nonEmpty(result.id,'FAULTLINE_QUALIFICATION_RESULT_ID_REQUIRED',256);if(ids.has(id))fail('FAULTLINE_QUALIFICATION_DUPLICATE_RESULT');ids.add(id);
    if(!['portable','live'].includes(result.mode))fail('FAULTLINE_QUALIFICATION_INVALID_MODE');
    if(!['SUPPORTED','UNSUPPORTED','UNRESOLVED'].includes(result.classification))fail('FAULTLINE_QUALIFICATION_INVALID_CLASSIFICATION');
    if(typeof result.baselineReproduced!=='boolean')fail('FAULTLINE_QUALIFICATION_BASELINE_REQUIRED');
    if(typeof result.accepted!=='boolean')fail('FAULTLINE_QUALIFICATION_ACCEPTANCE_REQUIRED');
    if(typeof result.sameCause!=='boolean')fail('FAULTLINE_QUALIFICATION_CAUSE_REQUIRED');
    if(typeof result.falseEquivalent!=='boolean')fail('FAULTLINE_QUALIFICATION_FALSE_EQUIVALENT_REQUIRED');
    if(!Number.isFinite(result.reduction)||result.reduction<0||result.reduction>1)fail('FAULTLINE_QUALIFICATION_INVALID_REDUCTION');
    if(!Number.isFinite(result.wallTimeMs)||result.wallTimeMs<0)fail('FAULTLINE_QUALIFICATION_INVALID_TIMING');
    if(result.accepted&&(!result.baselineReproduced||!result.sameCause||result.classification!=='SUPPORTED'))fail('FAULTLINE_QUALIFICATION_INVALID_ACCEPTED_RESULT');
    return {id,mode:result.mode,classification:result.classification,baselineReproduced:result.baselineReproduced,accepted:result.accepted,sameCause:result.sameCause,falseEquivalent:result.falseEquivalent,reduction:result.reduction,wallTimeMs:result.wallTimeMs};
  });
  const supported=normalized.filter(result=>result.classification==='SUPPORTED');
  const reproduced=supported.filter(result=>result.baselineReproduced);
  const accepted=normalized.filter(result=>result.accepted);
  const falseEquivalents=accepted.filter(result=>result.falseEquivalent).length;
  const sameCauseAccepted=accepted.filter(result=>result.sameCause).length;
  const reproductionRate=supported.length?reproduced.length/supported.length:0;
  const sameCauseRate=accepted.length?sameCauseAccepted/accepted.length:0;
  const portableReductions=accepted.filter(result=>result.mode==='portable').map(result=>result.reduction);
  const liveReductions=accepted.filter(result=>result.mode==='live').map(result=>result.reduction);
  const medianPortableReduction=percentile(portableReductions,50);
  const medianLiveReduction=percentile(liveReductions,50);
  const usefulReduction=(medianPortableReduction!==null&&medianPortableReduction>=0.60)||(medianLiveReduction!==null&&medianLiveReduction>=0.30);
  const timings=normalized.map(result=>result.wallTimeMs);
  const productionEligible=normalized.length>=30&&accepted.length>=10&&falseEquivalents===0&&sameCauseRate>=0.99&&reproductionRate>=0.90&&usefulReduction;
  return Object.freeze({
    schema:'faultline.qualification-summary.v1',
    totalCases:normalized.length,supportedCases:supported.length,reproducedSupportedCases:reproduced.length,acceptedReductions:accepted.length,falseEquivalents,
    reproductionRate,sameCauseRate,medianPortableReduction,medianLiveReduction,p50WallTimeMs:percentile(timings,50),p95WallTimeMs:percentile(timings,95),productionEligible,
    evidenceDigest:qualificationDigest(normalized)
  });
}

export function assertCapabilityStatusSupported({capabilityMatrix,summary}){
  if(!isObject(capabilityMatrix)||!Array.isArray(capabilityMatrix.capabilities))fail('FAULTLINE_QUALIFICATION_INVALID_CAPABILITY_MATRIX');
  if(!isObject(summary)||summary.schema!=='faultline.qualification-summary.v1')fail('FAULTLINE_QUALIFICATION_INVALID_SUMMARY');
  const production=capabilityMatrix.capabilities.filter(capability=>capability?.status==='PRODUCTION');
  if(production.length&&!summary.productionEligible)fail('FAULTLINE_QUALIFICATION_PRODUCTION_EVIDENCE_INSUFFICIENT');
  return true;
}
