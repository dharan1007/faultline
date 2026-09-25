import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export const SOURCE_MAP_EVIDENCE_SCHEMA='faultline.source-map-evidence.v1';
const MAX_MAP_BYTES=32*1024*1024;
const MAX_GENERATED_BYTES=128*1024*1024;
const MAX_SOURCES=20000;
const fail=code=>{throw new Error(code)};

function bounded(value,max=4096){
  const text=String(value??'');
  return text.length>max?text.slice(0,max):text;
}
function sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}
async function readBoundedFile(path,maxBytes,code){
  const target=resolve(String(path??''));
  if(!target)fail(code);
  const info=await stat(target).catch(()=>null);
  if(!info?.isFile()||info.size<1||info.size>maxBytes)fail(code);
  const bytes=await readFile(target);
  return {path:target,bytes,sha256:sha256(bytes),size:bytes.length};
}
function safeSourceName(value){
  const text=bounded(value,8192);
  if(!text)return '';
  try{
    const url=new URL(text);
    url.username='';url.password='';url.search='';url.hash='';
    return url.toString();
  }catch{
    return text.replace(/\\/g,'/');
  }
}

export async function createSourceMapEvidence({
  generatedPath,
  mapPath,
  sourceRepository=null,
  sourceCommit=null
}={}){
  const generated=await readBoundedFile(generatedPath,MAX_GENERATED_BYTES,'FAULTLINE_SOURCEMAP_INVALID_GENERATED_FILE');
  const map=await readBoundedFile(mapPath,MAX_MAP_BYTES,'FAULTLINE_SOURCEMAP_INVALID_MAP_FILE');
  let parsed;
  try{parsed=JSON.parse(map.bytes.toString('utf8'));}catch{fail('FAULTLINE_SOURCEMAP_INVALID_JSON');}
  if(parsed?.version!==3||!Array.isArray(parsed.sources)||parsed.sources.length>MAX_SOURCES)fail('FAULTLINE_SOURCEMAP_INVALID_SCHEMA');
  if(typeof parsed.mappings!=='string')fail('FAULTLINE_SOURCEMAP_INVALID_SCHEMA');
  const commit=sourceCommit==null?null:String(sourceCommit).trim().toLowerCase();
  if(commit&&!/^[0-9a-f]{40}$/.test(commit))fail('FAULTLINE_SOURCEMAP_INVALID_SOURCE_COMMIT');

  const sources=parsed.sources.map(safeSourceName);
  const sourceRoot=parsed.sourceRoot==null?null:safeSourceName(parsed.sourceRoot);
  return Object.freeze({
    schema:SOURCE_MAP_EVIDENCE_SCHEMA,
    generated:{path:generated.path,sha256:generated.sha256,bytes:generated.size},
    map:{path:map.path,sha256:map.sha256,bytes:map.size,version:3},
    provenance:{
      sourceRepository:sourceRepository?bounded(sourceRepository,2048):null,
      sourceCommit:commit
    },
    mapping:{
      sourceRoot,
      sourceCount:sources.length,
      sources,
      namesCount:Array.isArray(parsed.names)?parsed.names.length:0,
      hasSourcesContent:Array.isArray(parsed.sourcesContent),
      sourcesContentIncluded:false
    }
  });
}

export async function verifySourceMapEvidence(evidence){
  if(!evidence||evidence.schema!==SOURCE_MAP_EVIDENCE_SCHEMA)fail('FAULTLINE_SOURCEMAP_INVALID_EVIDENCE');
  const generated=await readBoundedFile(evidence.generated?.path,MAX_GENERATED_BYTES,'FAULTLINE_SOURCEMAP_INVALID_GENERATED_FILE');
  const map=await readBoundedFile(evidence.map?.path,MAX_MAP_BYTES,'FAULTLINE_SOURCEMAP_INVALID_MAP_FILE');
  return {
    ok:
      generated.sha256===evidence.generated.sha256&&
      generated.size===evidence.generated.bytes&&
      map.sha256===evidence.map.sha256&&
      map.size===evidence.map.bytes,
    generated:{expected:{sha256:evidence.generated.sha256,bytes:evidence.generated.bytes},actual:{sha256:generated.sha256,bytes:generated.size}},
    map:{expected:{sha256:evidence.map.sha256,bytes:evidence.map.bytes},actual:{sha256:map.sha256,bytes:map.size}}
  };
}
