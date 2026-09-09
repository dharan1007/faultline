import { validateCaptureArtifact } from './capture-contract.js';

function runtime(){
  const api=globalThis.window?.faultline;
  if(!api||typeof api.loadCase!=='function'||typeof api.inspect!=='function')throw new Error('FAULTLINE_CAPTURE_RUNTIME_UNAVAILABLE');
  return api;
}

export function validateCapture(input){
  return validateCaptureArtifact(input);
}

export function importCapture({artifact,expectedRevision}={}){
  const normalized=validateCaptureArtifact(artifact);
  const api=runtime();
  const revision=expectedRevision??api.inspect().revision;
  const result=api.loadCase({expectedRevision:revision,case:normalized.case});
  return {
    result,
    capture:{
      format:normalized.format,
      version:normalized.version,
      capturedAt:normalized.capturedAt,
      provenance:normalized.provenance,
      baseline:normalized.baseline
    }
  };
}

export function installCaptureIntegration(){
  if(typeof window==='undefined')return undefined;
  const surface=Object.freeze({validate:validateCapture,import:importCapture});
  Object.defineProperty(window,'faultlineCapture',{configurable:true,value:surface});
  return surface;
}
