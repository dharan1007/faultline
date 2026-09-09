const CAPTURE_FORMAT='faultline.capture.v1';
const clone=value=>JSON.parse(JSON.stringify(value));
const isObject=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const exactKeys=(value,allowed)=>Object.keys(value).every(key=>allowed.includes(key));

function invalid(){throw new Error('INVALID_CAPTURE');}

function validateRecordedAction(action){
  if(!isObject(action)||!['click','set_value','set_checked','wait'].includes(action.kind))invalid();
  if(action.kind==='wait'){
    if(!exactKeys(action,['kind','durationMs'])||!Number.isFinite(action.durationMs)||action.durationMs<0||action.durationMs>2000)invalid();
    return;
  }
  if(typeof action.selector!=='string'||!action.selector.trim())invalid();
  if(action.kind==='click'&&!exactKeys(action,['kind','selector']))invalid();
  if(action.kind==='set_value'&&(!exactKeys(action,['kind','selector','value'])||typeof action.value!=='string'))invalid();
  if(action.kind==='set_checked'&&(!exactKeys(action,['kind','selector','checked'])||typeof action.checked!=='boolean'))invalid();
}

function validateProvenance(provenance){
  if(!isObject(provenance)||!exactKeys(provenance,['url','title','browser','viewport','actions']))invalid();
  if(typeof provenance.url!=='string'||!provenance.url.trim()||typeof provenance.title!=='string'||typeof provenance.browser!=='string'||!provenance.browser.trim())invalid();
  if(!isObject(provenance.viewport)||!exactKeys(provenance.viewport,['width','height']))invalid();
  if(!Number.isInteger(provenance.viewport.width)||provenance.viewport.width<1||!Number.isInteger(provenance.viewport.height)||provenance.viewport.height<1)invalid();
  if(!Array.isArray(provenance.actions)||provenance.actions.length>8)invalid();
  let totalWait=0;
  for(const action of provenance.actions){validateRecordedAction(action);if(action.kind==='wait')totalWait+=action.durationMs;}
  if(totalWait>2000)invalid();
}

export function validateCaptureV1(capture,{allowManual=false}={}){
  if(!isObject(capture)||!exactKeys(capture,['format','mode','capturedAt','provenance','unresolvedResources','case']))invalid();
  if(capture.format!==CAPTURE_FORMAT||!['snapshot',...(allowManual?['manual']:[])].includes(capture.mode))invalid();
  if(typeof capture.capturedAt!=='string'||!Number.isFinite(Date.parse(capture.capturedAt)))invalid();
  validateProvenance(capture.provenance);
  if(!Array.isArray(capture.unresolvedResources)||capture.unresolvedResources.some(item=>typeof item!=='string'||!item.trim()))invalid();
  if(!isObject(capture.case))invalid();
  return capture;
}

export function normalizeCaptureV1(capture){
  validateCaptureV1(capture);
  return {
    case:clone(capture.case),
    metadata:{
      format:CAPTURE_FORMAT,
      mode:'snapshot',
      capturedAt:capture.capturedAt,
      provenance:clone(capture.provenance),
      unresolvedResources:clone(capture.unresolvedResources)
    }
  };
}

export function createCaptureV1({case:failureCase,metadata=null}){
  const normalizedMetadata=metadata?clone(metadata):{
    format:CAPTURE_FORMAT,
    mode:'manual',
    capturedAt:new Date().toISOString(),
    provenance:{
      url:typeof location==='object'?String(location.href):'about:blank',
      title:typeof document==='object'?String(document.title):'FAULTLINE manual case',
      browser:typeof navigator==='object'?String(navigator.userAgent):'unknown',
      viewport:{
        width:typeof innerWidth==='number'?Math.max(1,Math.round(innerWidth)):1280,
        height:typeof innerHeight==='number'?Math.max(1,Math.round(innerHeight)):720
      },
      actions:[]
    },
    unresolvedResources:[]
  };
  const artifact={...normalizedMetadata,case:clone(failureCase)};
  validateCaptureV1(artifact,{allowManual:true});
  return artifact;
}

export { CAPTURE_FORMAT };
