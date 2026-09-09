import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { CAPTURE_SCHEMA, validateCaptureArtifact } from '../../src/capture-contract.js';

const require=createRequire(import.meta.url);
const playwrightVersion=require('playwright/package.json').version;
const MAX_DIAGNOSTICS=200;
const MAX_DIAGNOSTIC_CHARS=2048;

function boundedText(value,max=2048){
  const text=String(value??'');
  return text.length>max?text.slice(0,max):text;
}

function boundedDiagnosticList(values){
  return values.slice(0,MAX_DIAGNOSTICS).map(value=>boundedText(value,MAX_DIAGNOSTIC_CHARS));
}

export function armFaultlineDiagnostics(page){
  if(!page||typeof page.on!=='function'||typeof page.off!=='function')throw new Error('INVALID_PLAYWRIGHT_PAGE');
  const consoleErrors=[];
  const pageErrors=[];
  let disposed=false;
  const push=(list,value)=>{if(list.length<MAX_DIAGNOSTICS)list.push(boundedText(value,MAX_DIAGNOSTIC_CHARS));};
  const onConsole=message=>{if(message?.type?.()==='error')push(consoleErrors,message.text?.()??'');};
  const onPageError=error=>push(pageErrors,error?.stack||error?.message||error);
  page.on('console',onConsole);
  page.on('pageerror',onPageError);
  return Object.freeze({
    snapshot(){
      if(disposed)throw new Error('DIAGNOSTICS_DISPOSED');
      return {consoleErrors:[...consoleErrors],pageErrors:[...pageErrors]};
    },
    dispose(){
      if(disposed)return;
      disposed=true;
      page.off('console',onConsole);
      page.off('pageerror',onPageError);
    }
  });
}

function readDiagnostics(diagnostics){
  if(diagnostics==null)return {consoleErrors:[],pageErrors:[]};
  const snapshot=typeof diagnostics.snapshot==='function'?diagnostics.snapshot():diagnostics;
  if(!snapshot||!Array.isArray(snapshot.consoleErrors)||!Array.isArray(snapshot.pageErrors))throw new Error('INVALID_CAPTURE_DIAGNOSTICS');
  return {
    consoleErrors:boundedDiagnosticList(snapshot.consoleErrors),
    pageErrors:boundedDiagnosticList(snapshot.pageErrors)
  };
}

export async function captureFaultlineCase({page,oracle,js='',provenance={},diagnostics,writeTo}={}){
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

  const capturedDiagnostics=readDiagnostics(diagnostics);
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
      consoleErrors:capturedDiagnostics.consoleErrors,
      pageErrors:capturedDiagnostics.pageErrors
    }
  };

  validateCaptureArtifact(capture);
  if(writeTo){
    if(typeof writeTo!=='string'||!writeTo.trim())throw new Error('INVALID_CAPTURE_OUTPUT_PATH');
    await writeFile(writeTo,`${JSON.stringify(capture,null,2)}\n`,'utf8');
  }
  return capture;
}
