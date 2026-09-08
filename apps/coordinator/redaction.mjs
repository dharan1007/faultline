const SENSITIVE_HEADERS=new Set([
  'authorization','proxy-authorization','cookie','set-cookie','x-api-key','x-auth-token','x-access-token'
]);
const SENSITIVE_QUERY=/^(?:access[_-]?token|auth|authorization|code|cookie|key|api[_-]?key|password|passwd|secret|session|token)$/i;
const SENSITIVE_AUTOCOMPLETE=/^(?:current-password|new-password|cc-|one-time-code)/i;
const SENSITIVE_INPUT_TYPE=/^(?:password|hidden)$/i;
const SECRET_PAIR=/\b(password|passwd|authorization|cookie|token|secret|api[_-]?key)\b\s*[:=]\s*(?:Bearer\s+)?[^\s,;]+/gi;

export function redactText(value){
  if(value===null||value===undefined)return value;
  return String(value).replace(SECRET_PAIR,(_,key)=>`${String(key).toLowerCase()}=[REDACTED]`);
}

export function redactHeaders(headers={}){
  const entries=headers instanceof Headers?[...headers.entries()]:Object.entries(headers||{});
  const result={};
  for(const [rawKey,rawValue] of entries){
    const key=String(rawKey).toLowerCase();
    const value=Array.isArray(rawValue)?rawValue.join(', '):String(rawValue??'');
    result[key]=SENSITIVE_HEADERS.has(key)?'[REDACTED]':redactText(value);
  }
  return result;
}

export function redactUrl(value){
  try{
    const url=new URL(String(value));
    for(const key of [...url.searchParams.keys()])if(SENSITIVE_QUERY.test(key))url.searchParams.set(key,'[REDACTED]');
    if(url.hash&&SENSITIVE_QUERY.test(url.hash.slice(1).split(/[=:]/,1)[0]))url.hash='#[REDACTED]';
    else if(url.hash&&/(?:access[_-]?token|authorization|cookie|password|secret|session|token|api[_-]?key)\s*[=:]/i.test(url.hash))url.hash='#[REDACTED]';
    return url.href;
  }catch{
    return redactText(value);
  }
}

export function redactInputMetadata(fields=[]){
  return fields.map(field=>{
    const type=String(field?.type||'').toLowerCase();
    const autocomplete=String(field?.autocomplete||'').toLowerCase();
    const name=String(field?.name||'');
    const sensitive=SENSITIVE_INPUT_TYPE.test(type)||SENSITIVE_AUTOCOMPLETE.test(autocomplete)||SENSITIVE_QUERY.test(name);
    return {
      type:type||'text',
      name,
      autocomplete,
      hasValue:Boolean(field?.hasValue),
      value:sensitive&&field?.hasValue?'[REDACTED]':undefined,
      sensitive
    };
  });
}

export function redactionCategories({headers=false,urls=false,forms=false,text=false}={}){
  const categories=[];
  if(headers)categories.push('headers');
  if(urls)categories.push('url-query');
  if(forms)categories.push('form-values');
  if(text)categories.push('secret-text');
  return categories;
}
