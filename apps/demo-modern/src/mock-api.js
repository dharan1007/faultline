const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function saveConfiguration(payload){
  fetch('/demo/mock-api/config-save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{});
  await delay(180);
  return {ok:true,requestId:`cfg-${payload.deployment}-${payload.environment}`,savedAt:new Date().toISOString()};
}

export function emitAnalytics(event,payload={}){
  const query=new URLSearchParams({event,source:'faultline-demo'});
  fetch(`/demo/mock-api/analytics?${query}`,{method:'POST',body:JSON.stringify(payload),keepalive:true}).catch(()=>{});
}

export async function pollActivity(){
  fetch('/demo/mock-api/activity?cursor=latest').catch(()=>{});
  await delay(35);
  return {receivedAt:new Date().toISOString()};
}
