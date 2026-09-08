const clone=value=>value===undefined?undefined:(typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value)));
function deepFreeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))deepFreeze(child);Object.freeze(value);}return value;}
function safeText(value){
  return String(value??'')
    .replace(/(Bearer\s+)[^\s]+/gi,'$1[REDACTED]')
    .replace(/((?:token|session|password|secret|api[_-]?key)=)[^\s&]+/gi,'$1[REDACTED]')
    .slice(0,512);
}
function safeUrl(value){
  try{const url=new URL(String(value||''));url.search='';url.username='';url.password='';return url.href;}
  catch{return safeText(value).split('?')[0];}
}
function makeSuggestion(type,index,label,definition,confidence='high'){
  return deepFreeze({id:`oracle-${type}-${index}`,type,label,confidence,definition:deepFreeze(clone(definition))});
}

export function suggestOracles(observations=[],selectedTarget=null){
  const suggestions=[];
  let index=0;
  const source=Array.isArray(observations)?observations:[];
  for(const observation of source){
    const kind=String(observation?.kind||'');
    const data=observation?.data&&typeof observation.data==='object'?observation.data:{};
    if(kind==='capture.runtime'&&['pageerror','unhandledrejection','unhandled_rejection'].includes(String(data.type||'').toLowerCase())){
      suggestions.push(makeSuggestion('runtime_error',index++,'JavaScript/runtime error occurs',{eventType:data.type||'pageerror',name:safeText(data.name||'Error'),message:safeText(data.message||'')}));
      continue;
    }
    if(kind==='capture.network'&&data.phase==='response'&&Number(data.status)>=400){
      suggestions.push(makeSuggestion('network_status',index++,'Request returns an error status',{url:safeUrl(data.url),operator:'status_gte',value:400,observedStatus:Number(data.status)}));
      continue;
    }
    if(kind==='capture.navigation'&&String(data.url||'')){
      suggestions.push(makeSuggestion('route',index++,'Page ends on this route',{url:safeUrl(data.url),operator:'equals'}));
    }
  }

  if(selectedTarget&&typeof selectedTarget==='object'&&selectedTarget.kind==='element'){
    const selector=clone(selectedTarget.selector||{});
    if(selectedTarget.visible!==undefined)suggestions.push(makeSuggestion('visibility',index++,'Element visibility is wrong',{selector,expected:Boolean(selectedTarget.visible)}));
    if(selectedTarget.clickable!==undefined)suggestions.push(makeSuggestion('clickability',index++,'Element clickability is wrong',{selector,expected:Boolean(selectedTarget.clickable)}));
    if(typeof selectedTarget.text==='string')suggestions.push(makeSuggestion('content',index++,'Element content is wrong',{selector,expected:safeText(selectedTarget.text)}));
    if(selectedTarget.geometry&&typeof selectedTarget.geometry==='object')suggestions.push(makeSuggestion('geometry',index++,'Element geometry is wrong',{selector,expected:clone(selectedTarget.geometry)}));
    if(selectedTarget.visualRegion&&typeof selectedTarget.visualRegion==='object')suggestions.push(makeSuggestion('visual_region',index++,'Visual region changed unexpectedly',{region:clone(selectedTarget.visualRegion)}));
  }

  const deduped=[];
  const seen=new Set();
  for(const suggestion of suggestions){
    const fingerprint=JSON.stringify([suggestion.type,suggestion.definition]);
    if(seen.has(fingerprint))continue;
    seen.add(fingerprint);deduped.push(suggestion);
  }
  return deepFreeze(deduped);
}
