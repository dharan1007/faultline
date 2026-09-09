import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { CAPTURE_LIMITS, CAPTURE_SCHEMA, validateCaptureArtifact } from '../../src/capture-contract.js';

const require=createRequire(import.meta.url);
const playwrightVersion=require('playwright/package.json').version;
const diagnosticsRecorders=new WeakSet();

function boundedText(value,max=2048){
  const text=String(value??'');
  return text.length>max?text.slice(0,max):text;
}

function boundedDiagnostic(value){
  return boundedText(value,CAPTURE_LIMITS.diagnosticStringChars);
}

function pushDiagnostic(entries,value){
  if(entries.length>=CAPTURE_LIMITS.diagnosticsEntries)return;
  entries.push(boundedDiagnostic(value));
}

export function armFaultlineDiagnostics({page}={}){
  if(!page||typeof page.on!=='function'||typeof page.off!=='function')throw new Error('INVALID_PLAYWRIGHT_PAGE');
  const consoleErrors=[];
  const pageErrors=[];
  let disposed=false;

  const onConsole=message=>{
    try{
      if(message?.type?.()==='error')pushDiagnostic(consoleErrors,message.text?.()??'');
    }catch{
      pushDiagnostic(consoleErrors,'UNREADABLE_CONSOLE_ERROR');
    }
  };
  const onPageError=error=>{
    try{
      pushDiagnostic(pageErrors,error?.stack||error?.message||error);
    }catch{
      pushDiagnostic(pageErrors,'UNREADABLE_PAGE_ERROR');
    }
  };

  page.on('console',onConsole);
  page.on('pageerror',onPageError);

  const recorder={
    snapshot(){
      return {consoleErrors:[...consoleErrors],pageErrors:[...pageErrors]};
    },
    dispose(){
      if(disposed)return;
      disposed=true;
      page.off('console',onConsole);
      page.off('pageerror',onPageError);
    }
  };
  diagnosticsRecorders.add(recorder);
  return recorder;
}

function captureDiagnostics(diagnostics){
  if(diagnostics===undefined)return {consoleErrors:[],pageErrors:[]};
  if(!diagnostics||typeof diagnostics!=='object'||!diagnosticsRecorders.has(diagnostics))throw new Error('INVALID_CAPTURE_DIAGNOSTICS');
  const snapshot=diagnostics.snapshot();
  return {
    consoleErrors:Array.isArray(snapshot.consoleErrors)?snapshot.consoleErrors:[],
    pageErrors:Array.isArray(snapshot.pageErrors)?snapshot.pageErrors:[]
  };
}

export async function captureFaultlineCase({page,oracle,js='',provenance={},writeTo,diagnostics}={}){
  if(!page||typeof page.evaluate!=='function')throw new Error('INVALID_PLAYWRIGHT_PAGE');
  if(typeof js!=='string')throw new Error('INVALID_CAPTURE');

  const snapshot=await page.evaluate(()=>{
    const css=[];
    const externalDependencies=[];
    for(const sheet of [...document.styleSheets]){
      try{
        const rules=[...sheet.cssRules];
        if(rules.length)css.push(rules.map(rule=>rule.cssText).join('\n'));
      }catch{
        if(sheet.href)externalDependencies.push(String(sheet.href));
      }
    }

    // innerHTML reflects markup, not all current DOM property state. Clone the body and
    // project live form values into serializable markup so a caller-prepared Playwright
    // page can be reproduced without changing the page being debugged.
    const body=document.body;
    const portableBody=body?.cloneNode(true)??null;
    if(body&&portableBody){
      const liveControls=[...body.querySelectorAll('input,textarea,select')];
      const portableControls=[...portableBody.querySelectorAll('input,textarea,select')];
      for(let index=0;index<liveControls.length;index+=1){
        const live=liveControls[index];
        const portable=portableControls[index];
        if(!portable)continue;

        if(live instanceof HTMLInputElement){
          const type=String(live.type||'text').toLowerCase();
          if(type==='password')portable.removeAttribute('value');
          else if(type!=='file')portable.setAttribute('value',live.value);
          if(type==='checkbox'||type==='radio'){
            if(live.checked)portable.setAttribute('checked','');
            else portable.removeAttribute('checked');
          }
          continue;
        }

        if(live instanceof HTMLTextAreaElement){
          portable.textContent=live.value;
          continue;
        }

        if(live instanceof HTMLSelectElement){
          const liveOptions=[...live.options];
          const portableOptions=[...portable.options];
          for(let optionIndex=0;optionIndex<liveOptions.length;optionIndex+=1){
            const liveOption=liveOptions[optionIndex];
            const portableOption=portableOptions[optionIndex];
            if(!portableOption)continue;
            if(liveOption.selected)portableOption.setAttribute('selected','');
            else portableOption.removeAttribute('selected');
          }
        }
      }
    }

    return {
      url:location.href,
      title:document.title,
      html:portableBody?.innerHTML??'',
      css:css.join('\n'),
      externalDependencies
    };
  });

  const recordedDiagnostics=captureDiagnostics(diagnostics);
  const viewport=page.viewportSize?.()??null;
  const browser=page.context?.().browser?.();
  const capture={
    schema:CAPTURE_SCHEMA,
    capturedAt:new Date().toISOString(),
    source:{
      url:boundedText(snapshot.url),
      title:boundedText(snapshot.title),
      html:snapshot.html,
      css:snapshot.css,
      js
    },
    oracle,
    environment:{
      browser:browser?.browserType?.().name?.()??'unknown',
      browserVersion:boundedText(browser?.version?.()??''),
      playwrightVersion,
      viewport:viewport?{width:viewport.width,height:viewport.height}:null
    },
    provenance:{
      adapter:'@faultline/playwright-capture',
      testTitle:boundedText(provenance.testTitle??''),
      testFile:boundedText(provenance.testFile??'')
    },
    diagnostics:{
      externalDependencies:snapshot.externalDependencies.map(value=>boundedText(value)),
      consoleErrors:recordedDiagnostics.consoleErrors,
      pageErrors:recordedDiagnostics.pageErrors
    }
  };

  validateCaptureArtifact(capture);
  if(writeTo){
    if(typeof writeTo!=='string'||!writeTo.trim())throw new Error('INVALID_CAPTURE_OUTPUT_PATH');
    await writeFile(writeTo,`${JSON.stringify(capture,null,2)}\n`,'utf8');
  }
  return capture;
}
