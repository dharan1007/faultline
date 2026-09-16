import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { executeExternalCorpus, validateExternalRunnerManifest } from '../src/external-qualification-runner.js';
import { summarizeQualification } from '../src/qualification-evidence.js';

const manifestPath=resolve(process.env.FAULTLINE_EXTERNAL_MANIFEST||'benchmarks/manifests/external-incidents.json');
const resultsPath=resolve(process.env.FAULTLINE_QUALIFICATION_RESULTS||'benchmarks/results/qualification-results.json');
const outputRoot=resolve(process.env.FAULTLINE_EXTERNAL_OUTPUT||'benchmarks/results/external-incidents');

if(!existsSync(manifestPath))throw new Error('FAULTLINE_EXTERNAL_MANIFEST_REQUIRED');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const validated=validateExternalRunnerManifest(manifest);
if(validated.cases.length<30)throw new Error(`FAULTLINE_EXTERNAL_CORPUS_TOO_SMALL:${validated.cases.length}`);

const corpus=await executeExternalCorpus(manifest,{faultlineRoot:process.cwd(),outputRoot,keepWorkspace:false});
if(corpus.results.length!==validated.cases.length)throw new Error('FAULTLINE_EXTERNAL_RESULT_COUNT_MISMATCH');
const ids=new Set(corpus.results.map(result=>result.id));
if(ids.size!==validated.cases.length)throw new Error('FAULTLINE_EXTERNAL_RESULT_IDENTITY_MISMATCH');

const summary=summarizeQualification(corpus.results);
await mkdir(resolve(resultsPath,'..'),{recursive:true});
await writeFile(resultsPath,`${JSON.stringify({schema:corpus.schema,manifestDigest:corpus.manifestDigest,results:corpus.results},null,2)}\n`,'utf8');
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/faultline-external-corpus-summary.json',`${JSON.stringify({manifestPath,manifestDigest:corpus.manifestDigest,...summary},null,2)}\n`,'utf8');

if(!summary.productionEligible)throw new Error(`FAULTLINE_EXTERNAL_QUALIFICATION_FAILED:${JSON.stringify({totalCases:summary.totalCases,acceptedReductions:summary.acceptedReductions,reproductionRate:summary.reproductionRate,sameCauseRate:summary.sameCauseRate,falseEquivalents:summary.falseEquivalents,medianPortableReduction:summary.medianPortableReduction,medianLiveReduction:summary.medianLiveReduction})}`);
console.log(JSON.stringify({status:'FAULTLINE_EXTERNAL_QUALIFICATION_PASSED',manifestDigest:corpus.manifestDigest,...summary}));
