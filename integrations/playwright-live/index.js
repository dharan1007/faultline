import { performance } from 'node:perf_hooks';
import { validateCaptureAction } from '../../src/capture-contract.js';
import { buildFingerprint, signalsFromOracleEvidence } from '../../src/causal-fingerprint.js';

const ORACLE_KINDS=new Set([
  'dom_property','dom_attribute','computed_style','dom_exists','runtime_error','dom_focused','text_content',
  'console_event','network_status','network_body','network_sequence','race_timing','performance_threshold'
]);
const CLICK_BUTTONS=new Set(['left','right','middle']);
const CONSOLE_LEVELS=new Set(['log','debug','info','warning','error','dir','trace']);
const fail=code=>{throw new Error(code)};
const clone=value=>value===undefined?undefined:structuredClone(value);
const safeText=(value,max=2048)=>String(value??'').slice(0,max);

function validatePage(page){
  if(!page||typeof page.locator!=='function'||typeof page.evaluate!=='function'||typeof page.on!=='function'||typeof page.off!=='function')fail('FAULTLINE_LIVE_INVALID_PAGE');
  return page;
}
function nonEmpty(value,max=2048){return typeof value==='string'&&value.trim().length>0&&value.length<=max;}
function finiteMs(value,max=60000){return Number.isFinite(value)&&value>=0&&value<=max;}

function captureCompatibleAction(action){
  if(!action||typeof action!=='object'||Array.isArray(action))return action;
  if(action.kind==='click'&&Object.prototype.hasOwnProperty.call(action,'button')){const {button,...base}=action;return base;}
  if(action.kind==='sequence'&&Array.isArray(action.steps))return {...action,steps:action.steps.map(captureCompatibleAction)};
  return action;
}

function validateLiveAction(action,{allowSequence=true,allowWait=false}={}){
  try{validateCaptureAction(captureCompatibleAction(action),{allowSequence,allowWait});}catch{fail('FAULTLINE_LIVE_INVALID_ACTION');}
  const inspect=value=>{
    if(value?.kind==='click'&&value.button!==undefined&&(!CLICK_BUTTONS.has(value.button)||Object.keys(value).some(key=>!['kind','selector','button'].includes(key))))fail('FAULTLINE_LIVE_INVALID_ACTION');
    if(value?.kind==='sequence')for(const step of value.steps)inspect(step);
  };
  inspect(action);
  return action;
}

function validateNetworkMatcher(value,{statusRequired=false,bodyRequired=false}={}){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('FAULTLINE_LIVE_INVALID_ORACLE');
  if(!nonEmpty(value.url))fail('FAULTLINE_LIVE_INVALID_ORACLE');
  if(value.method!==undefined&&(!nonEmpty(value.method,16)||!/^[A-Za-z]+$/.test(value.method)))fail('FAULTLINE_LIVE_INVALID_ORACLE');
  if(statusRequired&&(!Number.isInteger(value.status)||value.status<100||value.status>599))fail('FAULTLINE_LIVE_INVALID_ORACLE');
  if(value.status!==undefined&&(!Number.isInteger(value.status)||value.status<100||value.status>599))fail('FAULTLINE_LIVE_INVALID_ORACLE');
  if(bodyRequired&&!nonEmpty(value.bodyPattern,4096))fail('FAULTLINE_LIVE_INVALID_ORACLE');
}

export function validateLiveOracle(oracle){
  if(!oracle||typeof oracle!=='object'||Array.isArray(oracle)||!ORACLE_KINDS.has(oracle.kind))fail('FAULTLINE_LIVE_INVALID_ORACLE');
  if(['dom_property','dom_attribute','computed_style','dom_exists','dom_focused','text_content'].includes(oracle.kind)&&!nonEmpty(oracle.selector))fail('FAULTLINE_LIVE_INVALID_ORACLE');
  if(['dom_property','dom_attribute','computed_style'].includes(oracle.kind)&&!nonEmpty(oracle.property))fail('FAULTLINE_LIVE_INVALID_ORACLE');
  if(oracle.kind==='dom_attribute'&&!(typeof oracle.equals==='string'||oracle.equals===null))fail('FAULTLINE_LIVE_INVALID_ORACLE');
  if(oracle.kind==='dom_focused'&&typeof oracle.equals!=='boolean')fail('FAULTLINE_LIVE_INVALID_ORACLE');
  if(oracle.kind==='text_content'&&typeof oracle.equals!=='string')fail('FAULTLINE_LIVE_INVALID_ORACLE');
  if(oracle.kind==='console_event'){
    if(!nonEmpty(oracle.pattern,4096))fail('FAULTLINE_LIVE_INVALID_ORACLE');
    if(oracle.level!==undefined&&!CONSOLE_LEVELS.has(oracle.level))fail('FAULTLINE_LIVE_INVALID_ORACLE');
  }
  if(oracle.kind==='network_status')validateNetworkMatcher(oracle,{statusRequired:true});
  if(oracle.kind==='network_body')validateNetworkMatcher(oracle,{bodyRequired:true});
  if(oracle.kind==='network_sequence'){
    if(!Array.isArray(oracle.sequence)||oracle.sequence.length<1||oracle.sequence.length>32)fail('FAULTLINE_LIVE_INVALID_ORACLE');
    for(const item of oracle.sequence)validateNetworkMatcher(item);
  }
  if(oracle.kind==='race_timing'){
    const relation=oracle.relation;
    if(!relation||typeof relation!=='object'||!nonEmpty(relation.firstMark,256)||!nonEmpty(relation.secondMark,256)||!['before','after'].includes(relation.operator))fail('FAULTLINE_LIVE_INVALID_ORACLE');
    if(relation.maxDeltaMs!==undefined&&!finiteMs(relation.maxDeltaMs,60000))fail('FAULTLINE_LIVE_INVALID_ORACLE');
  }
  if(oracle.kind==='performance_threshold'){
    if(!nonEmpty(oracle.metric,256)||!finiteMs(oracle.budgetMs,600000))fail('FAULTLINE_LIVE_INVALID_ORACLE');
    if(oracle.comparator!==undefined&&!['gt','gte','lt','lte'].includes(oracle.comparator))fail('FAULTLINE_LIVE_INVALID_ORACLE');
  }
  if(oracle.delayMs!==undefined&&!finiteMs(oracle.delayMs,5000))fail('FAULTLINE_LIVE_INVALID_ORACLE');
  return oracle;
}

export function validateLiveRecipe(recipe){
  if(!Array.isArray(recipe)||recipe.length>64)fail('FAULTLINE_LIVE_INVALID_RECIPE');
  for(const action of recipe)validateLiveAction(action);
  return recipe;
}

function locator(page,selector){return page.locator(selector).first();}

export async function executeLiveAction(page,action,{timeoutMs=5000}={}){
  validatePage(page);
  validateLiveAction(action,{allowSequence:true,allowWait:false});
  const timeout={timeout:timeoutMs};
  switch(action.kind){
    case 'none': return;
    case 'click': await locator(page,action.selector).click({...timeout,...(action.button?{button:action.button}:{})}); return;
    case 'hover': await locator(page,action.selector).hover(timeout); return;
    case 'pointer_move': {
      if(!page.mouse||typeof page.mouse.move!=='function')fail('FAULTLINE_LIVE_POINTER_UNAVAILABLE');
      let x=action.x,y=action.y;
      if(action.selector){
        const target=locator(page,action.selector);
        await target.waitFor({state:'visible',timeout:timeoutMs});
        const box=await target.boundingBox();
        if(!box)fail('FAULTLINE_LIVE_TARGET_NOT_VISIBLE');
        x=box.x+box.width/2+(Number.isFinite(action.x)?action.x:0);
        y=box.y+box.height/2+(Number.isFinite(action.y)?action.y:0);
      }
      await page.mouse.move(Number(x),Number(y));
      return;
    }
    case 'set_value': await locator(page,action.selector).fill(action.value,timeout); return;
    case 'set_checked': {
      const target=locator(page,action.selector);
      if(action.checked)await target.check(timeout);else await target.uncheck(timeout);
      return;
    }
    case 'key_press': {
      if(action.selector)await locator(page,action.selector).press(action.key,timeout);
      else if(page.keyboard&&typeof page.keyboard.press==='function')await page.keyboard.press(action.key);
      else fail('FAULTLINE_LIVE_KEYBOARD_UNAVAILABLE');
      return;
    }
    case 'focus': await locator(page,action.selector).focus(timeout); return;
    case 'blur': await locator(page,action.selector).evaluate(element=>element.blur()); return;
    case 'scroll': {
      const position={x:Number.isFinite(action.x)?Number(action.x):0,y:Number.isFinite(action.y)?Number(action.y):0};
      if(action.selector)await locator(page,action.selector).evaluate((element,pos)=>element.scrollTo(pos.x,pos.y),position);
      else await page.evaluate(pos=>window.scrollTo(pos.x,pos.y),position);
      return;
    }
    case 'select_option': await locator(page,action.selector).selectOption(action.value,timeout); return;
    case 'sequence':
      for(const step of action.steps){
        if(step.kind==='wait')await page.waitForTimeout(step.durationMs);
        else await executeLiveAction(page,step,{timeoutMs});
      }
      return;
    default: fail('FAULTLINE_LIVE_UNSUPPORTED_ACTION');
  }
}

function normalizedUrl(value){
  try{
    const url=new URL(String(value));
    url.username='';url.password='';url.search='';url.hash='';
    return url.toString();
  }catch{return String(value??'').split('?')[0].split('#')[0];}
}
function urlMatches(actual,expected){
  const actualText=String(actual??'');
  const expectedText=String(expected??'');
  try{
    const exp=new URL(expectedText);
    return normalizedUrl(actualText)===normalizedUrl(exp.toString());
  }catch{
    return actualText.includes(expectedText);
  }
}
function networkMatches(event,matcher){
  if(!urlMatches(event.url,matcher.url))return false;
  if(matcher.method!==undefined&&event.method!==String(matcher.method).toUpperCase())return false;
  if(matcher.status!==undefined&&event.status!==matcher.status)return false;
  return true;
}
function orderedSequence(observed,expected){
  let cursor=0;
  const matched=[];
  for(const event of observed){
    if(cursor>=expected.length)break;
    if(networkMatches(event,expected[cursor])){matched.push(event);cursor++;}
  }
  return {matches:cursor===expected.length,matched};
}
function comparator(actual,budget,operator){
  if(operator==='gte')return actual>=budget;
  if(operator==='lt')return actual<budget;
  if(operator==='lte')return actual<=budget;
  return actual>budget;
}

async function observedDomValue(page,oracle,runtimeErrors){
  if(oracle.kind==='runtime_error'){
    if(oracle.equals===undefined)return runtimeErrors.at(-1)?.message??null;
    const expected=String(oracle.equals);
    return runtimeErrors.find(error=>error.message===expected)?.message??runtimeErrors.at(-1)?.message??null;
  }
  const target=locator(page,oracle.selector);
  if(oracle.kind==='dom_exists')return await target.count()>0;
  if(await target.count()<1)return undefined;
  if(oracle.kind==='dom_focused')return target.evaluate(element=>element===document.activeElement);
  if(oracle.kind==='text_content')return target.evaluate(element=>element.textContent);
  if(oracle.kind==='dom_attribute')return target.getAttribute(oracle.property);
  if(oracle.kind==='computed_style')return target.evaluate((element,property)=>getComputedStyle(element)[property],oracle.property);
  return target.evaluate((element,property)=>element[property],oracle.property);
}

export async function evaluateLiveOracle(page,oracle,{runtimeErrors=[],consoleEvents=[],networkEvents=[],timingMs=0}={}){
  validatePage(page);validateLiveOracle(oracle);
  if(oracle.delayMs)await page.waitForTimeout(oracle.delayMs);

  if(oracle.kind==='console_event'){
    const match=consoleEvents.find(event=>(oracle.level===undefined||event.type===oracle.level)&&event.text.includes(oracle.pattern))??null;
    return {status:match?'FAIL':'PASS',evidence:{kind:oracle.kind,actual:match?.text??null,expected:oracle.pattern,console:match?(match.type+':'+match.text):null}};
  }

  if(oracle.kind==='network_status'){
    const match=networkEvents.find(event=>networkMatches(event,oracle))??null;
    return {status:match?'FAIL':'PASS',evidence:{kind:oracle.kind,actual:match?.status??null,expected:oracle.status,networkSequence:match?[{method:match.method,status:match.status,url:match.url}]:null}};
  }

  if(oracle.kind==='network_body'){
    const match=networkEvents.find(event=>networkMatches(event,oracle)&&typeof event.body==='string'&&event.body.includes(oracle.bodyPattern))??null;
    return {status:match?'FAIL':'PASS',evidence:{kind:oracle.kind,actual:match?.body??null,expected:oracle.bodyPattern,requestResponse:match?{method:match.method,status:match.status,url:match.url,body:match.body}:null}};
  }

  if(oracle.kind==='network_sequence'){
    const sequence=orderedSequence(networkEvents,oracle.sequence);
    const normalized=sequence.matched.map(event=>({method:event.method,status:event.status,url:event.url}));
    return {status:sequence.matches?'FAIL':'PASS',evidence:{kind:oracle.kind,actual:normalized,expected:oracle.sequence,networkSequence:sequence.matches?normalized:null}};
  }

  if(oracle.kind==='race_timing'){
    const marks=await page.evaluate(()=>performance.getEntriesByType('mark').map(entry=>({name:entry.name,startTime:entry.startTime})).slice(-200));
    const first=marks.filter(mark=>mark.name===oracle.relation.firstMark).at(-1);
    const second=marks.filter(mark=>mark.name===oracle.relation.secondMark).at(-1);
    if(!first||!second)return {status:'UNRESOLVED',evidence:{kind:oracle.kind,reason:'FAULTLINE_LIVE_TIMING_MARK_MISSING'}};
    const ordered=oracle.relation.operator==='before'?first.startTime<second.startTime:first.startTime>second.startTime;
    const delta=Math.abs(second.startTime-first.startTime);
    const within=oracle.relation.maxDeltaMs===undefined||delta<=oracle.relation.maxDeltaMs;
    const failed=ordered&&within;
    const eventOrdering=[...marks].sort((a,b)=>a.startTime-b.startTime).map(mark=>mark.name);
    const timingRelation=oracle.relation.firstMark+':'+oracle.relation.operator+':'+oracle.relation.secondMark+':within='+String(within);
    return {status:failed?'FAIL':'PASS',evidence:{kind:oracle.kind,actual:{ordered,within},expected:oracle.relation,eventOrdering,timingRelation}};
  }

  if(oracle.kind==='performance_threshold'){
    let actual;
    if(oracle.metric==='trial_duration')actual=timingMs;
    else actual=await page.evaluate(name=>performance.getEntriesByName(name,'measure').at(-1)?.duration??null,oracle.metric);
    if(!Number.isFinite(actual))return {status:'UNRESOLVED',evidence:{kind:oracle.kind,reason:'FAULTLINE_LIVE_PERFORMANCE_METRIC_MISSING'}};
    const operator=oracle.comparator??'gt';
    const failed=comparator(actual,oracle.budgetMs,operator);
    return {status:failed?'FAIL':'PASS',evidence:{kind:oracle.kind,actual,expected:{operator,budgetMs:oracle.budgetMs},statePredicate:{metric:oracle.metric,operator,budgetMs:oracle.budgetMs,failed}}};
  }

  const actual=await observedDomValue(page,oracle,runtimeErrors);
  const expected=oracle.kind==='computed_style'||oracle.kind==='text_content'?String(oracle.equals):oracle.kind==='runtime_error'&&oracle.equals!==undefined?String(oracle.equals):oracle.equals;
  const failed=oracle.kind==='runtime_error'?(oracle.equals===undefined?Boolean(actual):Object.is(actual,expected)):Object.is(actual,expected);
  const errorDetail=oracle.kind==='runtime_error'?runtimeErrors.find(error=>error.message===actual)??runtimeErrors.at(-1):null;
  return {status:failed?'FAIL':'PASS',evidence:{actual,expected,kind:oracle.kind,selector:oracle.selector,property:oracle.property,...(errorDetail?{errorName:errorDetail.name,errorStack:errorDetail.stack}: {})}};
}

function sanitizedProvenance(page,provenance={}){
  const browser=page.context?.().browser?.();
  let url='';
  try{url=String(page.url?.()??'');}catch{}
  return {
    sourceRepository:typeof provenance.sourceRepository==='string'?safeText(provenance.sourceRepository):null,
    sourceCommit:/^[0-9a-f]{40}$/i.test(String(provenance.sourceCommit??''))?String(provenance.sourceCommit).toLowerCase():null,
    applicationUrl:url?safeText(url):null,
    testFile:typeof provenance.testFile==='string'?safeText(provenance.testFile):null,
    testTitle:typeof provenance.testTitle==='string'?safeText(provenance.testTitle):null,
    resetId:typeof provenance.resetId==='string'?safeText(provenance.resetId):null,
    browser:browser?.browserType?.().name?.()??'unknown',
    browserVersion:safeText(browser?.version?.()??'')
  };
}

function assertExpectedOrigin(page,expectedOrigin){
  if(!expectedOrigin)return;
  let actual;
  try{actual=new URL(page.url()).origin;}catch{fail('FAULTLINE_LIVE_INVALID_PAGE_URL');}
  if(actual!==expectedOrigin)fail('FAULTLINE_LIVE_ORIGIN_DRIFT');
}

export async function runLiveTrial({page,reset,recipe=[],oracle,provenance={},expectedOrigin=null,timeoutMs=5000,signal}={}){
  validatePage(page);validateLiveRecipe(recipe);validateLiveOracle(oracle);
  if(typeof reset!=='function')fail('FAULTLINE_LIVE_RESET_REQUIRED');
  if(expectedOrigin!=null){try{expectedOrigin=new URL(expectedOrigin).origin;}catch{fail('FAULTLINE_LIVE_INVALID_EXPECTED_ORIGIN');}}
  if(signal?.aborted)throw new DOMException('Faultline live trial aborted','AbortError');
  const started=performance.now();
  try{await reset({page,signal});}catch(cause){return {status:'UNRESOLVED',evidence:{reason:'RESET_FAILED'},fingerprint:null,timingMs:performance.now()-started,provenance:sanitizedProvenance(page,provenance),cause};}
  assertExpectedOrigin(page,expectedOrigin);

  const runtimeErrors=[];
  const consoleEvents=[];
  const networkEvents=[];
  const pendingBodies=new Set();
  const onPageError=error=>runtimeErrors.push({message:safeText(error?.message??error,500),name:safeText(error?.name??'Error',120),stack:safeText(error?.stack??'',2000)});
  const onConsole=message=>consoleEvents.push({type:safeText(message.type?.()??'log',32),text:safeText(message.text?.()??'',4096)});
  const onResponse=response=>{
    const request=response.request();
    const event={method:String(request.method?.()??'GET').toUpperCase(),status:Number(response.status()),url:normalizedUrl(response.url()),body:null};
    networkEvents.push(event);
    if(oracle.kind==='network_body'&&urlMatches(event.url,oracle.url)){
      const task=response.text().then(body=>{event.body=safeText(body,16384);}).catch(()=>{});
      pendingBodies.add(task);task.finally(()=>pendingBodies.delete(task));
    }
  };
  page.on('pageerror',onPageError);
  page.on('console',onConsole);
  page.on('response',onResponse);
  try{
    for(const action of recipe){
      if(signal?.aborted)throw new DOMException('Faultline live trial aborted','AbortError');
      await executeLiveAction(page,action,{timeoutMs});
    }
    if(pendingBodies.size)await Promise.allSettled([...pendingBodies]);
    const result=await evaluateLiveOracle(page,oracle,{runtimeErrors,consoleEvents,networkEvents,timingMs:performance.now()-started});
    const fingerprint=buildFingerprint(signalsFromOracleEvidence(result.evidence,oracle));
    return {...result,fingerprint,timingMs:performance.now()-started,provenance:sanitizedProvenance(page,provenance)};
  }catch(error){
    if(error?.name==='AbortError')throw error;
    const result={status:'UNRESOLVED',evidence:{reason:safeText(error?.message??error,240)}};
    return {...result,fingerprint:buildFingerprint(signalsFromOracleEvidence(result.evidence,oracle)),timingMs:performance.now()-started,provenance:sanitizedProvenance(page,provenance)};
  }finally{
    page.off('pageerror',onPageError);
    page.off('console',onConsole);
    page.off('response',onResponse);
  }
}
