import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { assertCapabilityStatusSupported, summarizeQualification } from '../src/qualification-evidence.js';

const resultsPath=process.env.FAULTLINE_QUALIFICATION_RESULTS||'benchmarks/results/qualification-results.json';
const matrix=JSON.parse(await readFile(new URL('../capability-matrix.json',import.meta.url),'utf8'));
let results=[];
if(existsSync(resultsPath)){
  const parsed=JSON.parse(await readFile(resultsPath,'utf8'));
  results=Array.isArray(parsed)?parsed:Array.isArray(parsed.results)?parsed.results:[];
}
const summary=summarizeQualification(results);
assertCapabilityStatusSupported({capabilityMatrix:matrix,summary});
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/faultline-qualification-summary.json',`${JSON.stringify(summary,null,2)}\n`,'utf8');
console.log(JSON.stringify({status:summary.productionEligible?'PRODUCTION_EVIDENCE_MET':'EXPERIMENTAL_EVIDENCE',...summary}));
