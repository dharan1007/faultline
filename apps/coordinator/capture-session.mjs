import http from 'node:http';
import net from 'node:net';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

import {validateCaptureTarget} from './url-policy.mjs';
import {mergeCaptureLimits,assertCaptureLimit,CaptureLimitError} from './limits.mjs';
import {redactHeaders,redactInputMetadata,redactText,redactUrl,redactionCategories} from './redaction.mjs';

export class OperationCancelledError extends Error{
  constructor(){super('OPERATION_CANCELLED');this.name='OperationCancelledError';this.code='OPERATION_CANCELLED';}
}

function now(){return new Date().toISOString();}
function openSocket(connector,{address,hostname,port}){
  const socket=connector?connector({address,hostname,port}):net.connect({host:address,port});
  if(!socket||typeof socket.pipe!=='function')throw new Error('INVALID_CAPTURE_CONNECTOR');
  return socket;
}
function publicError(error){return error&&typeof error==='object'&&typeof error.code==='string'?error:new Error(String(error?.message||error||'CAPTURE_PROXY_ERROR'));}

export async function startPinnedProxy({resolver,connector}={}){
  let firstPolicyError=null;
  const sockets=new Set();
  const remember=error=>{if(!firstPolicyError)firstPolicyError=publicError(error);};
  const trackSocket=socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));return socket;};

  const server=http.createServer(async(req,res)=>{
    try{
      const target=await validateCaptureTarget(req.url,resolver);
      if(target.protocol!=='http:')throw Object.assign(new Error('CAPTURE_PROXY_PROTOCOL_BLOCKED'),{code:'CAPTURE_PROXY_PROTOCOL_BLOCKED'});
      const parsed=new URL(target.url);
      const port=Number(parsed.port||80);
      const headers={...req.headers,host:parsed.host};
      delete headers['proxy-authorization'];delete headers['proxy-connection'];delete headers.connection;
      const upstream=http.request({
        protocol:'http:',host:target.addresses[0],port,method:req.method,path:`${parsed.pathname}${parsed.search}`,headers,
        createConnection:()=>trackSocket(openSocket(connector,{address:target.addresses[0],hostname:target.hostname,port}))
      },upstreamResponse=>{
        res.writeHead(upstreamResponse.statusCode||502,upstreamResponse.headers);
        upstreamResponse.pipe(res);
      });
      upstream.on('error',error=>{if(!res.headersSent)res.writeHead(502);res.end('capture proxy upstream error');});
      req.pipe(upstream);
    }catch(error){
      remember(error);
      if(!res.headersSent)res.writeHead(403,{'content-type':'text/plain'});
      res.end('capture target blocked');
    }
  });

  server.on('connect',async(req,clientSocket,head)=>{
    try{
      const authority=new URL(`https://${req.url}/`);
      const target=await validateCaptureTarget(authority.href,resolver);
      const port=Number(authority.port||443);
      const upstream=trackSocket(openSocket(connector,{address:target.addresses[0],hostname:target.hostname,port}));
      upstream.once('connect',()=>{
        clientSocket.write('HTTP/1.1 200 Connection Established\r\nProxy-Agent: faultline-coordinator\r\n\r\n');
        if(head?.length)upstream.write(head);
        upstream.pipe(clientSocket);clientSocket.pipe(upstream);
      });
      upstream.once('error',()=>{try{clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');}catch{}clientSocket.destroy();});
      trackSocket(clientSocket);
    }catch(error){
      remember(error);
      try{clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');}catch{}
      clientSocket.destroy();
    }
  });

  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address();
  return {
    url:`http://127.0.0.1:${address.port}`,
    get policyError(){return firstPolicyError;},
    async close(){for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(()=>resolve()));}
  };
}

function abortReason(signal){
  if(signal?.reason instanceof CaptureLimitError)return signal.reason;
  if(signal?.reason&&signal.reason.code==='CAPTURE_LIMIT_REACHED')return signal.reason;
  return new OperationCancelledError();
}
function raceSignal(promise,signal){
  if(!signal)return promise;
  if(signal.aborted)return Promise.reject(abortReason(signal));
  return new Promise((resolve,reject)=>{
    const onAbort=()=>reject(abortReason(signal));
    signal.addEventListener('abort',onAbort,{once:true});
    Promise.resolve(promise).then(value=>{signal.removeEventListener('abort',onAbort);resolve(value);},error=>{signal.removeEventListener('abort',onAbort);reject(error);});
  });
}
function sleep(ms,signal){return raceSignal(new Promise(resolve=>setTimeout(resolve,ms)),signal);}
function summarizeForObservation(kind,item){
  if(kind==='screenshot'){
    const {dataBase64,...summary}=item;
    return summary;
  }
  return item;
}
function makeObservations(capture){
  const groups=[
    ['document_snapshot','documentSnapshots'],['screenshot','screenshots'],['console','consoleEvents'],['runtime','runtimeEvents'],
    ['network','networkEvents'],['navigation','navigationEvents'],['resource','resources']
  ];
  let sequence=0;
  const observations=[];
  for(const [kind,key] of groups){
    for(const item of capture[key]||[]){
      sequence+=1;
      observations.push({observationId:`obs_${capture.id}_${sequence}`,sequence,kind:`capture.${kind}`,at:item.at||capture.finishedAt,data:summarizeForObservation(kind,item)});
    }
  }
  return observations;
}

export async function capturePublicTarget({targetUrl,captureId,resolver,connector,limits:limitOverrides={},signal}={}){
  const limits=mergeCaptureLimits(limitOverrides);
  const validated=await validateCaptureTarget(targetUrl,resolver);
  const proxy=await startPinnedProxy({resolver,connector});
  const deadlineController=new AbortController();
  const deadlineTimer=setTimeout(()=>deadlineController.abort(new CaptureLimitError('duration',limits.maxDurationMs+1,limits.maxDurationMs)),limits.maxDurationMs);
  const combinedSignal=signal?AbortSignal.any([signal,deadlineController.signal]):deadlineController.signal;
  let browser;
  let browserLaunchPromise;
  let context;
  let page;
  const pending=new Set();
  let totalEvents=0;
  let limitError=null;
  const capture={
    id:captureId||`capture_${Date.now()}`,mode:'public_url',status:'CAPTURING',startedAt:now(),finishedAt:null,
    documentSnapshots:[],screenshots:[],consoleEvents:[],runtimeEvents:[],networkEvents:[],navigationEvents:[],resources:[],storageDiffs:[],traceReferences:[],
    redactionSummary:{redacted:true,categories:redactionCategories({headers:true,urls:true,forms:true,text:true})}
  };
  const record=(bucket,item)=>{
    if(limitError)return;
    totalEvents+=1;
    try{assertCaptureLimit('events',totalEvents,limits.maxEvents);}catch(error){limitError=error;return;}
    capture[bucket].push(item);
  };
  const track=promise=>{const wrapped=Promise.resolve(promise).catch(error=>record('runtimeEvents',{at:now(),type:'capture_observer_error',message:redactText(error?.message||error)})).finally(()=>pending.delete(wrapped));pending.add(wrapped);};
  const check=()=>{if(combinedSignal.aborted)throw abortReason(combinedSignal);if(proxy.policyError)throw proxy.policyError;if(limitError)throw limitError;};

  try{
    browserLaunchPromise=chromium.launch({
      headless:true,proxy:{server:proxy.url},timeout:limits.navigationTimeoutMs,
      args:['--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-extensions','--disable-sync','--disable-quic']
    });
    browser=await raceSignal(browserLaunchPromise,combinedSignal);
    context=await browser.newContext({acceptDownloads:false,permissions:[],serviceWorkers:'block'});
    page=await context.newPage();
    page.on('download',download=>{record('runtimeEvents',{at:now(),type:'download_blocked',suggestedFilename:redactText(download.suggestedFilename())});download.cancel().catch(()=>{});});
    page.on('popup',popup=>{record('runtimeEvents',{at:now(),type:'popup_blocked',url:redactUrl(popup.url())});popup.close().catch(()=>{});});
    page.on('console',message=>record('consoleEvents',{at:now(),type:message.type(),text:redactText(message.text()),location:{url:redactUrl(message.location().url||''),lineNumber:message.location().lineNumber,columnNumber:message.location().columnNumber}}));
    page.on('pageerror',error=>record('runtimeEvents',{at:now(),type:'pageerror',message:redactText(error?.message||error),name:error?.name||'Error'}));
    page.on('framenavigated',frame=>{if(frame===page.mainFrame())record('navigationEvents',{at:now(),type:'frame_navigated',url:redactUrl(frame.url())});});
    page.on('request',request=>track((async()=>record('networkEvents',{at:now(),phase:'request',method:request.method(),resourceType:request.resourceType(),url:redactUrl(request.url()),headers:redactHeaders(await request.allHeaders())}))()));
    page.on('response',response=>track((async()=>record('networkEvents',{at:now(),phase:'response',status:response.status(),url:redactUrl(response.url()),headers:redactHeaders(await response.allHeaders())}))()));

    try{await raceSignal(page.goto(validated.url,{waitUntil:'domcontentloaded',timeout:limits.navigationTimeoutMs}),combinedSignal);}catch(error){if(proxy.policyError)throw proxy.policyError;throw error;}
    check();
    await sleep(limits.settleMs,combinedSignal);
    check();
    while(pending.size){await raceSignal(Promise.allSettled([...pending]),combinedSignal);check();}

    const rawSnapshot=await raceSignal(page.evaluate(maxChars=>({
      title:document.title,
      url:location.href,
      elementCount:document.querySelectorAll('*').length,
      textLength:(document.body?.innerText||'').length,
      htmlLength:document.documentElement?.outerHTML.length||0,
      visibleText:(document.body?.innerText||'').slice(0,maxChars),
      fields:[...document.querySelectorAll('input,textarea,select')].slice(0,100).map(element=>({type:element.type||element.tagName.toLowerCase(),name:element.name||'',autocomplete:element.autocomplete||'',hasValue:Boolean(element.value)}))
    }),limits.maxTextSampleChars),combinedSignal);
    record('documentSnapshots',{at:now(),title:redactText(rawSnapshot.title),url:redactUrl(rawSnapshot.url),elementCount:rawSnapshot.elementCount,textLength:rawSnapshot.textLength,htmlLength:rawSnapshot.htmlLength,hydratedText:redactText(rawSnapshot.visibleText),fields:redactInputMetadata(rawSnapshot.fields)});
    check();

    const resourceEntries=await raceSignal(page.evaluate(()=>performance.getEntriesByType('resource').map(entry=>({url:entry.name,initiatorType:entry.initiatorType,duration:Math.round(entry.duration*1000)/1000,transferSize:Number(entry.transferSize||0)}))),combinedSignal);
    assertCaptureLimit('resources',resourceEntries.length,limits.maxResourceEntries);
    for(const resource of resourceEntries)record('resources',{at:now(),...resource,url:redactUrl(resource.url)});
    record('navigationEvents',{at:now(),type:'navigation_final',url:redactUrl(page.url())});
    check();

    const screenshot=await raceSignal(page.screenshot({type:'png',fullPage:true}),combinedSignal);
    assertCaptureLimit('screenshot_bytes',screenshot.length,limits.maxScreenshotBytes);
    record('screenshots',{at:now(),mime:'image/png',bytes:screenshot.length,sha256:createHash('sha256').update(screenshot).digest('hex'),dataBase64:screenshot.toString('base64')});
    check();

    const environment=await raceSignal(page.evaluate(()=>({userAgent:navigator.userAgent,platform:navigator.platform,language:navigator.language,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,viewport:{width:innerWidth,height:innerHeight},devicePixelRatio})),combinedSignal);
    capture.status='CAPTURED';capture.finishedAt=now();
    return {target:validated,capture,observations:makeObservations(capture),environment:{...environment,capturePolicy:'public-only-pinned-proxy'}};
  }finally{
    clearTimeout(deadlineTimer);
    if(page&&!page.isClosed())await page.close().catch(()=>{});
    if(context)await context.close().catch(()=>{});
    if(browser)await browser.close().catch(()=>{});
    else if(browserLaunchPromise){
      const lateBrowser=await browserLaunchPromise.catch(()=>null);
      if(lateBrowser)await lateBrowser.close().catch(()=>{});
    }
    await proxy.close().catch(()=>{});
  }
}
