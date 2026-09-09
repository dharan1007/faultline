import { writeFile } from 'node:fs/promises';
import { createCaptureArtifact } from '../src/capture-contract.js';

function fail(code, detail='') {
  const suffix=detail?`:${String(detail)}`:'';
  throw new Error(`${code}${suffix}`);
}

function validatePage(page){
  if(!page||typeof page.url!=='function'||typeof page.title!=='function'||typeof page.evaluate!=='function'||typeof page.viewportSize!=='function'){
    fail('FAULTLINE_CAPTURE_INVALID','PAGE');
  }
}

function validateOutputPath(outputPath){
  if(typeof outputPath!=='string'||!outputPath.trim())fail('FAULTLINE_CAPTURE_INVALID','OUTPUT_PATH');
}

function validateSnapshotOracle(oracle){
  if(!oracle||typeof oracle!=='object'||Array.isArray(oracle))fail('FAULTLINE_CAPTURE_INVALID','ORACLE');
  if(!['dom_property','dom_attribute','computed_style','dom_exists'].includes(oracle.kind))fail('FAULTLINE_CAPTURE_UNSUPPORTED_ORACLE',oracle.kind||'UNKNOWN');
  if(!oracle.action||oracle.action.kind!=='none')fail('FAULTLINE_CAPTURE_UNSUPPORTED_ACTION',oracle.action?.kind||'UNKNOWN');
  if(typeof oracle.selector!=='string'||!oracle.selector.trim())fail('FAULTLINE_CAPTURE_INVALID','ORACLE_SELECTOR');
  if(['dom_property','dom_attribute','computed_style'].includes(oracle.kind)&&(typeof oracle.property!=='string'||!oracle.property.trim()))fail('FAULTLINE_CAPTURE_INVALID','ORACLE_PROPERTY');
  const delay=oracle.delayMs??0;
  if(!Number.isFinite(delay)||delay<0||delay>2000)fail('FAULTLINE_CAPTURE_INVALID','ORACLE_DELAY');
}

async function captureSnapshot(page,oracle){
  validateSnapshotOracle(oracle);
  const snapshot=await page.evaluate(async oracleValue=>{
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    if(Number(oracleValue.delayMs)>0)await wait(Number(oracleValue.delayMs));
    const element=document.querySelector(oracleValue.selector);
    let actual;
    if(oracleValue.kind==='dom_exists')actual=Boolean(element);
    else if(oracleValue.kind==='dom_attribute')actual=element?element.getAttribute(oracleValue.property):undefined;
    else if(oracleValue.kind==='computed_style')actual=element?getComputedStyle(element)[oracleValue.property]:undefined;
    else actual=element?element[oracleValue.property]:undefined;
    const expected=oracleValue.kind==='computed_style'?String(oracleValue.equals):oracleValue.equals;
    const status=Object.is(actual,expected)?'FAIL':'PASS';

    const body=document.body.cloneNode(true);
    body.querySelectorAll('script,noscript').forEach(node=>node.remove());
    body.querySelectorAll('*').forEach(node=>{
      for(const attribute of [...node.attributes])if(/^on/i.test(attribute.name))node.removeAttribute(attribute.name);
    });

    const css=[];
    const inaccessible=[];
    const collect=sheet=>{
      try{css.push(...Array.from(sheet.cssRules||[],rule=>rule.cssText));}
      catch{inaccessible.push(String(sheet.href||'cross-origin stylesheet'));}
    };
    for(const sheet of Array.from(document.styleSheets||[]))collect(sheet);
    for(const sheet of Array.from(document.adoptedStyleSheets||[]))collect(sheet);
    return {
      html:body.innerHTML,
      css:css.join('\n'),
      js:'',
      baseline:{status,evidence:{actual,expected,kind:oracleValue.kind,selector:oracleValue.selector,property:oracleValue.property}},
      inaccessible
    };
  },oracle);
  if(snapshot.inaccessible.length)fail('FAULTLINE_CAPTURE_UNRESOLVED_STYLESHEET',snapshot.inaccessible[0]);
  if(snapshot.baseline.status!=='FAIL')fail('FAULTLINE_CAPTURE_BASELINE_NOT_FAILING',snapshot.baseline.status);
  return {caseValue:{html:snapshot.html,css:snapshot.css,js:snapshot.js,oracle:structuredClone(oracle)},baseline:snapshot.baseline};
}

async function measureProvidedCase(page,caseValue){
  if(!caseValue||typeof caseValue!=='object'||Array.isArray(caseValue))fail('FAULTLINE_CAPTURE_INVALID','CASE');
  const measured=await captureSnapshot(page,caseValue.oracle);
  return {caseValue:structuredClone(caseValue),baseline:measured.baseline};
}

export async function captureFaultlineCase({
  page,
  oracle,
  caseValue,
  outputPath,
  browserName='chromium',
  capturedAt=new Date().toISOString()
}={}){
  validatePage(page);
  validateOutputPath(outputPath);

  let provenance;
  try{
    const viewport=page.viewportSize();
    provenance={
      adapter:'faultline-playwright',
      adapterVersion:1,
      url:String(page.url()),
      title:String(await page.title()),
      userAgent:String(await page.evaluate(()=>navigator.userAgent)),
      viewport,
      browser:String(browserName)
    };
  }catch(error){
    fail('FAULTLINE_CAPTURE_PROVENANCE',error?.message||error);
  }

  const capture=caseValue?await measureProvidedCase(page,caseValue):await captureSnapshot(page,oracle);
  const artifact=createCaptureArtifact({caseValue:capture.caseValue,provenance,baseline:capture.baseline,capturedAt});
  const serialized=`${JSON.stringify(artifact,null,2)}\n`;
  try{
    await writeFile(outputPath,serialized,'utf8');
  }catch(error){
    fail('FAULTLINE_CAPTURE_WRITE',error?.message||error);
  }
  return artifact;
}
