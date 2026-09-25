import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export const PLAYWRIGHT_TRACE_EVIDENCE_SCHEMA='faultline.playwright-trace-evidence.v1';

const fail=code=>{throw new Error(code)};
const clone=value=>structuredClone(value);

function safePath(value){
  if(typeof value!=='string'||!value.trim())fail('FAULTLINE_TRACE_PATH_REQUIRED');
  return resolve(value);
}
async function digestFile(path){
  const bytes=await readFile(path);
  return {sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
}
function bounded(value,max=2048){
  const text=String(value??'');
  return text.length>max?text.slice(0,max):text;
}

export async function startFaultlineTrace({
  context,
  path,
  screenshots=true,
  snapshots=true,
  sources=true,
  title='FAULTLINE reproduction'
}={}){
  if(!context?.tracing||typeof context.tracing.start!=='function'||typeof context.tracing.stop!=='function')fail('FAULTLINE_TRACE_INVALID_CONTEXT');
  const target=safePath(path);
  const startedAt=new Date().toISOString();
  await context.tracing.start({screenshots:Boolean(screenshots),snapshots:Boolean(snapshots),sources:Boolean(sources),title:bounded(title,256)});
  let stopped=false;

  return Object.freeze({
    async stop({sourceRepository=null,sourceCommit=null,testTitle=null,testFile=null}={}){
      if(stopped)fail('FAULTLINE_TRACE_ALREADY_STOPPED');
      stopped=true;
      await context.tracing.stop({path:target});
      const info=await stat(target);
      if(!info.isFile()||info.size<=0)fail('FAULTLINE_TRACE_EMPTY_ARTIFACT');
      const digest=await digestFile(target);
      const commit=sourceCommit==null?null:String(sourceCommit).trim().toLowerCase();
      if(commit&&!/^[0-9a-f]{40}$/.test(commit))fail('FAULTLINE_TRACE_INVALID_SOURCE_COMMIT');
      return Object.freeze({
        schema:PLAYWRIGHT_TRACE_EVIDENCE_SCHEMA,
        path:target,
        sha256:digest.sha256,
        bytes:digest.bytes,
        startedAt,
        stoppedAt:new Date().toISOString(),
        capture:{screenshots:Boolean(screenshots),snapshots:Boolean(snapshots),sources:Boolean(sources)},
        provenance:{
          sourceRepository:sourceRepository?bounded(sourceRepository):null,
          sourceCommit:commit,
          testTitle:testTitle?bounded(testTitle):null,
          testFile:testFile?bounded(testFile):null
        },
        viewer:{
          command:`npx playwright show-trace ${JSON.stringify(target)}`,
          formatAuthority:'playwright'
        }
      });
    }
  });
}

export async function verifyTraceEvidence(evidence){
  if(!evidence||evidence.schema!==PLAYWRIGHT_TRACE_EVIDENCE_SCHEMA)fail('FAULTLINE_TRACE_INVALID_EVIDENCE');
  const target=safePath(evidence.path);
  const digest=await digestFile(target);
  const ok=digest.sha256===evidence.sha256&&digest.bytes===evidence.bytes;
  return {
    ok,
    expected:{sha256:evidence.sha256,bytes:evidence.bytes},
    actual:digest,
    path:target
  };
}

export function attachTraceEvidence(artifact,evidence){
  if(!artifact||typeof artifact!=='object'||Array.isArray(artifact))fail('FAULTLINE_TRACE_ARTIFACT_REQUIRED');
  if(!evidence||evidence.schema!==PLAYWRIGHT_TRACE_EVIDENCE_SCHEMA)fail('FAULTLINE_TRACE_INVALID_EVIDENCE');
  return Object.freeze({...clone(artifact),traceEvidence:clone(evidence)});
}
