import { performance } from 'node:perf_hooks';
import { validateCaptureAction } from '../../src/capture-contract.js';
import { buildFingerprint, signalsFromOracleEvidence } from '../../src/causal-fingerprint.js';

const ORACLE_KINDS=new Set(['dom_property','dom_attribute','computed_style','dom_exists','runtime_error']);
const fail=code=>{throw new Error(code)};
const clone=value=>value===undefined?undefined:structuredClone(value);
const safeText=(value,max=2048)=>String(value??'').slice(0,max);

function validatePage(page){
  if(!page||typeof page.locator!=='function'||typeof page.evaluate!=='function'||typeof page.on!=='function'||typeof page.off!=='function')fail('FAULTLINE_LIVE_INVALID_PAGE');
  return page;
}

function validateOracle(oracle){
  if(!oracle||typeof oracle!=='object'||Array.isArray(oracle)||!ORACLE_KINDS.has(oracle.kind))fail('FAULTLINE_LIVE_INVALID_ORACLE');
  if(oracle.kind!=='runtime_error'&&(typeof oracle.selector!=='string'||!oracle.selector.trim()))fail('FAULTLINE_LIVE_INVALID_ORACLE');
  if(['dom_property','dom_attribute','computed_style'].includes(oracle.kind)&&(typeof oracle.property!=='string'||!oracle.property.trim()))fail('FAULTLINE_LIVE_INVALID_ORACLE');
  if(oracle.kind==='dom_attribute'&&!(typeof oracle.equals==='string'||oracle.equals===null))fail('FAULTLINE_LIVE_INVALID_ORACLE');
  if(oracle.delayMs!==undefined&&(!Number.isFinite(oracle.delayMs)||oracle.delayMs<0||oracle.delayMs>5000))fail('FAULTLINE_LIVE_INVALID_ORACLE');
  return oracle;
}

export function validateLiveRecipe(recipe){
  if(!Array.isArray(recipe)||recipe.length>64)fail('FAULTLINE_LIVE_INVALID_RECIPE');
  for(const action of recipe)validateCaptureAction(action);
  return recipe;
}

function locator(page,selector){
  const target=page.locator(selector).first();
  return target;
}

export async function executeLiveAction(page,action,{timeoutMs=5000}={}){
  validatePage(page);
  validateCaptureAction(action,{allowSequence:true,allowWait:false});
  const timeout={timeout:timeoutMs};
  switch(action.kind){
    case 'none': return;
    case 'click': await locator(page,action.selector).click(timeout); return;
    case 'hover': await locator(page,action.selector).hover(timeout); return;
    case 'pointer_move': {
      if(!page.mouse||typeof page.mouse.move!=='function')fail('FAULTLINE_LIVE_POINTER_UNAVAILABLE');
      let x=action.x,y=action.y;
      if(action.selector){
        const box=await locator(page,action.selector).boundingBox(timeout);
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

async function observedValue(page,oracle,runtimeErrors){
  if(oracle.kind==='runtime_error'){
    if(oracle.equals===undefined)return runtimeErrors.at(-1)?.message??null;
    const expected=String(oracle.equals);
    return runtimeErrors.find(error=>error.message===expected)?.message??runtimeErrors.at(-1)?.message??null;
  }
  const target=locator(page,oracle.selector);
  if(oracle.kind==='dom_exists')return await target.count()>0;
  if(await target.count()<1)return undefined;
  if(oracle.kind==='dom_attribute')return target.getAttribute(oracle.property);
  if(oracle.kind==='computed_style')return target.evaluate((element,property)=>getComputedStyle(element)[property],oracle.property);
  return target.evaluate((element,property)=>element[property],oracle.property);
}

export async function evaluateLiveOracle(page,oracle,{runtimeErrors=[]}={}){
  validatePage(page);validateOracle(oracle);
  if(oracle.delayMs)await page.waitForTimeout(oracle.delayMs);
  const actual=await observedValue(page,oracle,runtimeErrors);
  const expected=oracle.kind==='computed_style'?String(oracle.equals):oracle.kind==='runtime_error'&&oracle.equals!==undefined?String(oracle.equals):oracle.equals;
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
  validatePage(page);validateLiveRecipe(recipe);validateOracle(oracle);
  if(typeof reset!=='function')fail('FAULTLINE_LIVE_RESET_REQUIRED');
  if(expectedOrigin!=null){try{expectedOrigin=new URL(expectedOrigin).origin;}catch{fail('FAULTLINE_LIVE_INVALID_EXPECTED_ORIGIN');}}
  if(signal?.aborted)throw new DOMException('Faultline live trial aborted','AbortError');
  const started=performance.now();
  try{await reset({page,signal});}catch(cause){return {status:'UNRESOLVED',evidence:{reason:'RESET_FAILED'},fingerprint:null,timingMs:performance.now()-started,provenance:sanitizedProvenance(page,provenance),cause};}
  assertExpectedOrigin(page,expectedOrigin);
  const runtimeErrors=[];
  const onPageError=error=>runtimeErrors.push({message:safeText(error?.message??error,500),name:safeText(error?.name??'Error',120),stack:safeText(error?.stack??'',2000)});
  page.on('pageerror',onPageError);
  try{
    for(const action of recipe){
      if(signal?.aborted)throw new DOMException('Faultline live trial aborted','AbortError');
      await executeLiveAction(page,action,{timeoutMs});
    }
    const result=await evaluateLiveOracle(page,oracle,{runtimeErrors});
    const fingerprint=buildFingerprint(signalsFromOracleEvidence(result.evidence,oracle));
    return {...result,fingerprint,timingMs:performance.now()-started,provenance:sanitizedProvenance(page,provenance)};
  }catch(error){
    if(error?.name==='AbortError')throw error;
    const result={status:'UNRESOLVED',evidence:{reason:safeText(error?.message??error,240)}};
    return {...result,fingerprint:buildFingerprint(signalsFromOracleEvidence(result.evidence,oracle)),timingMs:performance.now()-started,provenance:sanitizedProvenance(page,provenance)};
  }finally{page.off('pageerror',onPageError);}
}
