import {rankSelectorStrategies,validateJourney} from '../../src/journey.js';

class ReplayCancelledError extends Error{
  constructor(){super('OPERATION_CANCELLED');this.name='ReplayCancelledError';this.code='OPERATION_CANCELLED';}
}

function clone(value){return value===undefined?undefined:(typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value)));}
function cancelledResult(steps=[]){return {operationStatus:'CANCELLED',oracleOutcome:'UNRESOLVED',steps:clone(steps),oracle:null,error:{code:'OPERATION_CANCELLED'}};}
function isTimeoutLike(error){return error?.name==='TimeoutError'||/timeout/i.test(String(error?.message||''));}
function abortReason(signal){return signal?.reason instanceof Error?signal.reason:new ReplayCancelledError();}
function assertNotAborted(signal){if(signal?.aborted)throw abortReason(signal);}
function raceSignal(promise,signal){
  if(!signal)return Promise.resolve(promise);
  if(signal.aborted)return Promise.reject(abortReason(signal));
  return new Promise((resolve,reject)=>{
    const onAbort=()=>reject(abortReason(signal));
    signal.addEventListener('abort',onAbort,{once:true});
    Promise.resolve(promise).then(value=>{signal.removeEventListener('abort',onAbort);resolve(value);},error=>{signal.removeEventListener('abort',onAbort);reject(error);});
  });
}
function selectorSnapshot(selector={}){
  if(!selector||typeof selector!=='object'||Array.isArray(selector))throw new Error('INVALID_REPLAY_SELECTOR');
  return {
    role:selector.role,
    accessibleName:selector.accessibleName||selector.name,
    testId:selector.testId||selector.test_id,
    text:selector.text,
    css:selector.css
  };
}
function locatorForStrategy(page,strategy){
  if(strategy.kind==='role')return page.getByRole(strategy.role,{name:strategy.name,exact:true});
  if(strategy.kind==='test_id')return page.getByTestId(strategy.value);
  if(strategy.kind==='text')return page.getByText(strategy.value,{exact:true});
  if(strategy.kind==='css')return page.locator(strategy.value);
  throw new Error('UNSUPPORTED_SELECTOR_STRATEGY');
}
async function resolveLocator(page,selector,timeoutMs,signal){
  const strategies=rankSelectorStrategies(selectorSnapshot(selector));
  for(const strategy of strategies){
    assertNotAborted(signal);
    const locator=locatorForStrategy(page,strategy).first();
    try{
      await raceSignal(locator.waitFor({state:'attached',timeout:Math.min(timeoutMs,700)}),signal);
      return {locator,strategy};
    }catch(error){
      if(signal?.aborted)throw abortReason(signal);
      if(!isTimeoutLike(error))continue;
    }
  }
  return null;
}
async function executeTargetedStep(page,step,signal){
  const resolved=await resolveLocator(page,step.target,step.timeoutMs,signal);
  if(!resolved)return {status:'UNRESOLVED',reason:'TARGET_NOT_FOUND'};
  const {locator,strategy}=resolved;
  try{
    assertNotAborted(signal);
    if(step.kind==='click')await raceSignal(locator.click({timeout:step.timeoutMs}),signal);
    else if(step.kind==='select')await raceSignal(locator.selectOption(step.value,{timeout:step.timeoutMs}),signal);
    else if(step.kind==='check'){
      try{await raceSignal(locator.check({timeout:step.timeoutMs}),signal);}
      catch(error){
        if(signal?.aborted)throw abortReason(signal);
        if(!isTimeoutLike(error))throw error;
        const label=await locator.evaluate(element=>element.labels?.[0]?{text:element.labels[0].textContent||'',tag:element.labels[0].tagName}:null).catch(()=>null);
        if(!label)throw error;
        await raceSignal(locator.evaluate(element=>element.labels?.[0]?.click()),signal);
        if(!(await locator.isChecked()))throw error;
      }
    }
    else if(step.kind==='uncheck'){
      try{await raceSignal(locator.uncheck({timeout:step.timeoutMs}),signal);}
      catch(error){
        if(signal?.aborted)throw abortReason(signal);
        if(!isTimeoutLike(error))throw error;
        const label=await locator.evaluate(element=>element.labels?.[0]?true:false).catch(()=>false);
        if(!label)throw error;
        await raceSignal(locator.evaluate(element=>element.labels?.[0]?.click()),signal);
        if(await locator.isChecked())throw error;
      }
    }
    else if(step.kind==='type'){
      if(step.sensitive||step.value==='[REDACTED]')return {status:'UNRESOLVED',reason:'SENSITIVE_INPUT_REQUIRES_USER'};
      await raceSignal(locator.fill(String(step.value??''),{timeout:step.timeoutMs}),signal);
    }
    assertNotAborted(signal);
    return {status:'COMPLETED',strategy:clone(strategy)};
  }catch(error){
    if(signal?.aborted||error?.code==='OPERATION_CANCELLED')throw abortReason(signal);
    if(isTimeoutLike(error))return {status:'UNRESOLVED',reason:'ACTION_NOT_PERFORMABLE',strategy:clone(strategy)};
    throw error;
  }
}
async function executeStep(page,step,signal){
  if(['click','select','check','uncheck','type'].includes(step.kind))return executeTargetedStep(page,step,signal);
  try{
    assertNotAborted(signal);
    if(step.kind==='wait'){
      const delay=Number(step.value??0);
      if(!Number.isFinite(delay)||delay<0||delay>step.timeoutMs)throw new Error('INVALID_JOURNEY_WAIT');
      await raceSignal(page.waitForTimeout(delay),signal);
    }else if(step.kind==='navigate'){
      if(!step.url)return {status:'UNRESOLVED',reason:'NAVIGATION_URL_MISSING'};
      await raceSignal(page.goto(step.url,{waitUntil:'domcontentloaded',timeout:step.timeoutMs}),signal);
    }else if(step.kind==='assertion'){
      return {status:'COMPLETED'};
    }
    assertNotAborted(signal);
    return {status:'COMPLETED'};
  }catch(error){
    if(signal?.aborted||error?.code==='OPERATION_CANCELLED')throw abortReason(signal);
    if(isTimeoutLike(error))return {status:'UNRESOLVED',reason:'STEP_TIMEOUT'};
    throw error;
  }
}
async function evaluateClickability(page,oracle,signal){
  const timeoutMs=Math.min(Number(oracle.timeoutMs)||1200,5000);
  const resolved=await resolveLocator(page,oracle.selector,timeoutMs,signal);
  if(!resolved)return {outcome:'UNRESOLVED',oracle:{type:'clickability',selector:clone(oracle.selector),expected:Boolean(oracle.expected),observed:null,reason:'TARGET_NOT_FOUND'}};
  const observed=await raceSignal(resolved.locator.evaluate(element=>{
    const rect=element.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)return false;
    const style=getComputedStyle(element);
    if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;
    if(element.disabled||element.getAttribute('aria-disabled')==='true')return false;
    const x=Math.min(innerWidth-1,Math.max(0,rect.left+rect.width/2));
    const y=Math.min(innerHeight-1,Math.max(0,rect.top+rect.height/2));
    const hit=document.elementFromPoint(x,y);
    return Boolean(hit&&(hit===element||element.contains(hit)));
  }),signal);
  const expected=oracle.expected!==false;
  return {outcome:observed===expected?'PASS':'FAIL',oracle:{type:'clickability',selector:clone(oracle.selector),expected,observed:Boolean(observed),strategy:clone(resolved.strategy)}};
}
async function evaluateOracle(page,oracle,signal){
  if(!oracle||typeof oracle!=='object')return {outcome:'UNRESOLVED',oracle:null};
  if(oracle.type==='clickability')return evaluateClickability(page,oracle,signal);
  return {outcome:'UNRESOLVED',oracle:{type:String(oracle.type||'unknown'),reason:'UNSUPPORTED_ORACLE'}};
}

export async function replayJourney(page,journey,{oracle=null,signal}={}){
  const steps=[];
  try{
    assertNotAborted(signal);
    const canonical=validateJourney(journey);
    for(const step of canonical){
      assertNotAborted(signal);
      const startedAt=new Date().toISOString();
      const result=await executeStep(page,step,signal);
      steps.push({id:step.id,kind:step.kind,status:result.status,reason:result.reason||null,strategy:result.strategy||null,startedAt,finishedAt:new Date().toISOString()});
      if(result.status==='UNRESOLVED')return {operationStatus:'COMPLETED',oracleOutcome:'UNRESOLVED',steps,oracle:null,error:null};
    }
    const oracleResult=await evaluateOracle(page,oracle,signal);
    return {operationStatus:'COMPLETED',oracleOutcome:oracleResult.outcome,steps,oracle:oracleResult.oracle,error:null};
  }catch(error){
    if(signal?.aborted||error?.code==='OPERATION_CANCELLED')return cancelledResult(steps);
    return {operationStatus:'FAILED',oracleOutcome:'UNRESOLVED',steps,error:{code:error?.code||'REPLAY_FAILED',message:String(error?.message||'REPLAY_FAILED').slice(0,512)},oracle:null};
  }
}
