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

export async function captureFaultlineCase({
  page,
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

  const artifact=createCaptureArtifact({caseValue,provenance,capturedAt});
  const serialized=`${JSON.stringify(artifact,null,2)}\n`;
  try{
    await writeFile(outputPath,serialized,'utf8');
  }catch(error){
    fail('FAULTLINE_CAPTURE_WRITE',error?.message||error);
  }
  return artifact;
}
