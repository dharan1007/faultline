import { CAPTURE_MAX_SEQUENCE_STEPS, CAPTURE_MAX_WAIT_MS, CAPTURE_SCHEMA, normalizeCapture } from '../src/capture.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const fail=code=>{throw new Error(code);};

function normalizeActions(actions=[]){
  if(!Array.isArray(actions)||actions.length>CAPTURE_MAX_SEQUENCE_STEPS)fail('CAPTURE_INVALID_ACTIONS');
  let totalWait=0;
  const steps=actions.map(step=>{
    if(!step||typeof step!=='object'||Array.isArray(step))fail('CAPTURE_INVALID_ACTIONS');
    if(step.kind==='click'){
      if(typeof step.selector!=='string'||!step.selector.trim())fail('CAPTURE_INVALID_ACTIONS');
      return {kind:'click',selector:step.selector};
    }
    if(step.kind==='set_value'){
      if(typeof step.selector!=='string'||!step.selector.trim()||typeof step.value!=='string')fail('CAPTURE_INVALID_ACTIONS');
      return {kind:'set_value',selector:step.selector,value:step.value};
    }
    if(step.kind==='set_checked'){
      if(typeof step.selector!=='string'||!step.selector.trim()||typeof step.checked!=='boolean')fail('CAPTURE_INVALID_ACTIONS');
      return {kind:'set_checked',selector:step.selector,checked:step.checked};
    }
    if(step.kind==='wait'){
      if(!Number.isFinite(step.durationMs)||step.durationMs<0||step.durationMs>CAPTURE_MAX_WAIT_MS)fail('CAPTURE_INVALID_ACTIONS');
      totalWait+=step.durationMs;
      if(totalWait>CAPTURE_MAX_WAIT_MS)fail('CAPTURE_INVALID_ACTIONS');
      return {kind:'wait',durationMs:step.durationMs};
    }
    fail('CAPTURE_INVALID_ACTIONS');
  });
  return steps;
}

function actionFor(steps){
  if(steps.length===0)return {kind:'none'};
  if(steps.length===1)return clone(steps[0]);
  return {kind:'sequence',steps:clone(steps)};
}

async function collectSource(page){
  return await page.evaluate(async()=>{
    const unsupported=[];
    const pageOrigin=location.origin;
    const sameOrigin=url=>{
      try{return new URL(url,location.href).origin===pageOrigin;}catch{return false;}
    };
    const fetchText=async(url,kind)=>{
      if(!sameOrigin(url)){unsupported.push({kind,url});return '';}
      try{
        const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
        if(!response.ok){unsupported.push({kind,url,status:response.status});return '';}
        return await response.text();
      }catch(error){
        unsupported.push({kind,url,error:String(error)});
        return '';
      }
    };

    const css=[];
    for(const style of document.querySelectorAll('style')) css.push(style.textContent||'');
    for(const link of document.querySelectorAll('link[rel~="stylesheet"][href]')){
      css.push(await fetchText(link.href,'stylesheet'));
    }

    const js=[];
    for(const script of document.scripts){
      const type=(script.getAttribute('type')||'').trim().toLowerCase();
      if(type==='module'){
        unsupported.push({kind:'module-script',url:script.src||location.href});
        continue;
      }
      if(type&&!['text/javascript','application/javascript','application/ecmascript','text/ecmascript'].includes(type))continue;
      if(script.src)js.push(await fetchText(script.src,'script'));
      else js.push(script.textContent||'');
    }

    for(const node of document.querySelectorAll('iframe[src],object[data],embed[src]')){
      unsupported.push({kind:node.tagName.toLowerCase(),url:node.getAttribute('src')||node.getAttribute('data')||''});
    }

    const body=document.body.cloneNode(true);
    body.querySelectorAll('script,style,link[rel~="stylesheet"]').forEach(node=>node.remove());
    return {
      source:{html:body.innerHTML,css:css.filter(Boolean).join('\n\n'),js:js.filter(Boolean).join('\n\n')},
      provenance:{url:location.href,title:document.title||'',capturedAt:new Date().toISOString(),userAgent:navigator.userAgent},
      unsupported
    };
  });
}

async function performActions(page,steps){
  for(const step of steps){
    if(step.kind==='wait'){
      await page.waitForTimeout(step.durationMs);
      continue;
    }
    const locator=page.locator(step.selector);
    if(await locator.count()===0)fail('CAPTURE_ACTION_TARGET_NOT_FOUND');
    if(step.kind==='click')await locator.first().click();
    else if(step.kind==='set_value')await locator.first().fill(step.value);
    else if(step.kind==='set_checked'){
      if(step.checked)await locator.first().check();
      else await locator.first().uncheck();
    }
  }
}

async function measureOracle(page,oracle){
  if(oracle.kind==='runtime_error')fail('CAPTURE_UNSUPPORTED_ORACLE');
  if(oracle.delayMs!==undefined){
    if(!Number.isFinite(oracle.delayMs)||oracle.delayMs<0||oracle.delayMs>CAPTURE_MAX_WAIT_MS)fail('CAPTURE_INVALID_ORACLE');
    if(oracle.delayMs>0)await page.waitForTimeout(oracle.delayMs);
  }
  if(oracle.kind==='dom_exists')return (await page.locator(oracle.selector).count())>0;
  const locator=page.locator(oracle.selector).first();
  if(await locator.count()===0)fail('CAPTURE_ORACLE_TARGET_NOT_FOUND');
  if(oracle.kind==='dom_property')return await locator.evaluate((element,property)=>element[property],oracle.property);
  if(oracle.kind==='dom_attribute')return await locator.getAttribute(oracle.property);
  if(oracle.kind==='computed_style')return await locator.evaluate((element,property)=>getComputedStyle(element).getPropertyValue(property)||getComputedStyle(element)[property],oracle.property);
  fail('CAPTURE_INVALID_ORACLE');
}

export async function captureFaultlineFailure(page,{label,actions=[],oracle}={}){
  if(!page||typeof page.evaluate!=='function'||!oracle||typeof oracle!=='object')fail('CAPTURE_INVALID_INPUT');
  const steps=normalizeActions(actions);
  const snapshot=await collectSource(page);
  if(snapshot.unsupported.length)fail('CAPTURE_UNSUPPORTED_DEPENDENCY');

  await performActions(page,steps);
  const actual=await measureOracle(page,oracle);
  if(!Object.is(actual,oracle.equals))fail('CAPTURE_SOURCE_NOT_FAILING');

  const provenance={...snapshot.provenance};
  if(label!==undefined){
    if(typeof label!=='string')fail('CAPTURE_INVALID_INPUT');
    provenance.label=label;
  }
  const capture={
    schema:CAPTURE_SCHEMA,
    source:snapshot.source,
    oracle:{...clone(oracle),action:actionFor(steps),delayMs:oracle.delayMs??0},
    provenance,
    expectedStatus:'FAIL'
  };
  normalizeCapture(capture);
  return capture;
}
