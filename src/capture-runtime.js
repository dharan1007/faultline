import { CAPTURE_SCHEMA, captureSummary, normalizeCapture } from './capture-format.js';

const REVISION_PATTERN='^r[1-9][0-9]*$';
const DIAGNOSTIC_RESOURCE_SCHEMA={
  type:'object',
  additionalProperties:false,
  properties:{
    kind:{type:'string'},
    url:{},
    reason:{type:'string'}
  },
  required:['kind','url','reason']
};
const CAPTURED_RESOURCE_SCHEMA={
  type:'object',
  additionalProperties:false,
  properties:{url:{},chars:{type:'integer',minimum:0}},
  required:['url','chars']
};
export const CAPTURE_INPUT_SCHEMA={
  type:'object',
  additionalProperties:false,
  properties:{
    schema:{type:'string',enum:[CAPTURE_SCHEMA]},
    case:{
      type:'object',
      additionalProperties:false,
      properties:{html:{type:'string'},css:{type:'string'},js:{type:'string'},oracle:{type:'object'}},
      required:['html','css','js','oracle']
    },
    provenance:{
      type:'object',
      additionalProperties:false,
      properties:{
        url:{type:'string'},title:{type:'string'},capturedAt:{type:'string'},
        viewport:{type:'object',additionalProperties:false,properties:{width:{type:'integer',minimum:1},height:{type:'integer',minimum:1}},required:['width','height']},
        userAgent:{type:'string'},
        playwright:{type:'object',additionalProperties:false,properties:{projectName:{type:'string'},testTitle:{type:'string'}}}
      },
      required:['url','title','capturedAt','viewport','userAgent','playwright']
    },
    diagnostics:{
      type:'object',
      additionalProperties:false,
      properties:{
        omittedResources:{type:'array',items:DIAGNOSTIC_RESOURCE_SCHEMA,maxItems:100},
        capturedScripts:{type:'array',items:CAPTURED_RESOURCE_SCHEMA,maxItems:100},
        capturedStylesheets:{type:'array',items:CAPTURED_RESOURCE_SCHEMA,maxItems:100}
      },
      required:['omittedResources','capturedScripts','capturedStylesheets']
    }
  },
  required:['schema','case','provenance','diagnostics']
};

const TOOL_MANIFEST_ENTRY={
  name:'faultline_load_capture',
  description:'Import a versioned Playwright browser-failure capture into the canonical FAULTLINE case in one optimistic revision.',
  inputSchema:{
    type:'object',
    additionalProperties:false,
    properties:{expectedRevision:{type:'string',pattern:REVISION_PATTERN},capture:CAPTURE_INPUT_SCHEMA},
    required:['expectedRevision','capture']
  },
  readOnly:false,
  annotations:{readOnlyHint:false,untrustedContentHint:true}
};

function publishWebMCPReady(faultline){
  const badge=document.getElementById('webmcp');
  if(!badge)return;
  const count=faultline.manifest().length;
  badge.textContent=`WebMCP ready · ${count} tools`;
  badge.dataset.state='ready';
  badge.removeAttribute('title');
}

export function installCaptureRuntime(){
  const faultline=window.faultline;
  if(!faultline||typeof faultline.loadCase!=='function'||typeof faultline.manifest!=='function')throw new Error('FAULTLINE_RUNTIME_UNAVAILABLE');
  if(typeof faultline.loadCapture==='function')return faultline.loadCapture;

  const baseManifest=faultline.manifest.bind(faultline);
  const loadCapture=({expectedRevision,capture}={})=>{
    const normalized=normalizeCapture(capture);
    const summary=captureSummary(normalized);
    const loaded=faultline.loadCase({expectedRevision,case:normalized.case});
    return {...loaded,capture:summary};
  };

  faultline.loadCapture=loadCapture;
  faultline.manifest=()=>{
    const manifest=baseManifest();
    return manifest.some(tool=>tool.name===TOOL_MANIFEST_ENTRY.name)?manifest:[...manifest,TOOL_MANIFEST_ENTRY];
  };

  const mc=document.modelContext;
  if(mc?.registerTool){
    const controller=new AbortController();
    Promise.resolve(mc.registerTool({
      name:TOOL_MANIFEST_ENTRY.name,
      title:'FAULTLINE · load capture',
      description:TOOL_MANIFEST_ENTRY.description,
      inputSchema:TOOL_MANIFEST_ENTRY.inputSchema,
      execute:async input=>loadCapture(input||{}),
      annotations:TOOL_MANIFEST_ENTRY.annotations
    },{signal:controller.signal})).then(()=>publishWebMCPReady(faultline)).catch(error=>{
      const badge=document.getElementById('webmcp');
      if(badge){badge.textContent='WebMCP capture registration error';badge.dataset.state='ERROR';badge.title=String(error?.message||error);}
    });
    window.addEventListener('pagehide',()=>controller.abort(),{once:true});
  }

  return loadCapture;
}