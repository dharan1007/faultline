const SECRET_KEYS=/authorization|credential|password|secret|token|api.?key/i;

function scrub(value,depth=0){
  if(depth>5) return '[truncated]';
  if(Array.isArray(value)) return value.slice(0,50).map(item=>scrub(item,depth+1));
  if(value&&typeof value==='object'){
    const out={};
    for(const [key,item] of Object.entries(value)) if(!SECRET_KEYS.test(key)&&key!=='stack') out[key]=scrub(item,depth+1);
    return out;
  }
  if(typeof value==='string') return value.slice(0,4000).replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi,'Bearer [redacted]');
  return value;
}

export function ok(data,requestId){ return {ok:true,requestId:String(requestId),data:scrub(data),error:null}; }
export function fail(code,message,{retryable=false,details={}}={},requestId){ return {ok:false,requestId:String(requestId),data:null,error:{code:String(code),message:String(message),retryable:Boolean(retryable),details:scrub(details)}}; }

export async function readJson(request,{maxBytes=262144}={}){
  const declared=Number(request.headers?.get?.('content-length')||0);
  if(Number.isFinite(declared)&&declared>maxBytes) throw new Error('REQUEST_TOO_LARGE');
  const text=await request.text();
  if(new TextEncoder().encode(text).byteLength>maxBytes) throw new Error('REQUEST_TOO_LARGE');
  try { return text?JSON.parse(text):{}; } catch { throw new Error('INVALID_JSON'); }
}

export function publicError(error,fallbackCode='INTERNAL_ERROR'){
  const code=String(error?.code||fallbackCode);
  const message=String(error?.publicMessage||error?.message||'Request failed').replace(/Bearer\s+\S+/gi,'Bearer [redacted]');
  return {code,message,retryable:Boolean(error?.retryable),details:scrub(error?.details||{})};
}

export function requestId(headers){
  const existing=headers?.get?.('x-request-id');
  return existing&&/^[A-Za-z0-9._:-]{1,96}$/.test(existing)?existing:`req_${globalThis.crypto?.randomUUID?.()||Date.now().toString(36)}`;
}
