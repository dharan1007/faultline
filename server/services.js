import { detectProject } from '../src/project-detector.js';
import { createInvestigation } from '../src/platform-domain.js';

const clone=value=>JSON.parse(JSON.stringify(value));

export function inspectProjectManifest(input={}){
  const packageJson=input.packageJson??null;
  const files=Array.isArray(input.files)?input.files.slice(0,2000).map(String):[];
  if(packageJson!==null&&typeof packageJson!=='object') throw new Error('PACKAGE_JSON_INVALID');
  return detectProject({packageJson,files});
}

export function evaluateFailure(input={}){
  const oracle=input.oracle,observation=input.observation;
  if(!oracle||typeof oracle!=='object'||!observation||typeof observation!=='object') throw new Error('ORACLE_OR_OBSERVATION_REQUIRED');
  const supported=new Set(['dom_property','computed_style','dom_exists','runtime_error','text','url']);
  if(!supported.has(oracle.kind)) throw new Error('ORACLE_KIND_UNSUPPORTED');
  const actual=observation.actual;
  const failed=oracle.kind==='runtime_error'?Boolean(actual):Object.is(actual,oracle.equals);
  return {status:failed?'FAIL':'PASS',executed:false,evidence:{actual,expected:oracle.equals,kind:oracle.kind}};
}

export function createInvestigationRecord(input={}){
  if(!input.projectId) throw new Error('PROJECT_ID_REQUIRED');
  return createInvestigation(input.projectId,{
    id:input.id,
    title:input.title,
    report:input.report||{},
    sourceRevision:input.sourceRevision||'r1'
  });
}

export function exportReproducer(input={}){
  const value=input.case||input;
  if(typeof value.html!=='string'||typeof value.css!=='string'||typeof value.js!=='string') throw new Error('REPRODUCER_CASE_REQUIRED');
  const safeJs=String(value.js).replace(/<\/script/gi,'<\\/script');
  return {html:`<!doctype html><html><head><meta charset="utf-8"><style>${value.css}</style></head><body>${value.html}<script>${safeJs}<\/script></body></html>`};
}

export function unavailableRemote(operation){
  return {
    ok:false,
    error:{
      code:'CONFIGURATION_REQUIRED',
      message:`${operation} requires the verified isolated sandbox execution adapter.`,
      retryable:false,
      details:{remoteExecution:'gated'}
    }
  };
}

export function createDefaultServices(){
  return {
    inspectProjectManifest,
    evaluateFailure,
    createInvestigationRecord,
    exportReproducer,
    projectVerify:async()=>unavailableRemote('Project verification'),
    runStart:async()=>unavailableRemote('Run start'),
    runStatus:async()=>unavailableRemote('Run status'),
    reduce:async()=>unavailableRemote('Remote reduction'),
    evidenceGet:async()=>unavailableRemote('Remote evidence lookup')
  };
}

export function clonePublic(value){return clone(value);}
