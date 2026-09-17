#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { executeExternalLiveCorpus } from '../src/external-live-qualification-runner.js';

const [manifestPath='benchmarks/external-live-corpus.json',outputPath='benchmarks/results/external-live-results.json']=process.argv.slice(2);
let manifest;try{manifest=JSON.parse(await readFile(manifestPath,'utf8'))}catch(error){console.error(`FAULTLINE_EXTERNAL_LIVE_MANIFEST_READ_FAILED:${error?.message??error}`);process.exit(1)}
try{const result=await executeExternalLiveCorpus(manifest);await mkdir(new URL('../benchmarks/results/',import.meta.url),{recursive:true});await writeFile(outputPath,`${JSON.stringify(result,null,2)}\n`,'utf8');const counts=result.results.reduce((out,row)=>(out[row.classification]=(out[row.classification]??0)+1,out),{});console.log(JSON.stringify({ok:true,manifestDigest:result.manifestDigest,total:result.results.length,classifications:counts,outputPath}))}catch(error){console.error(error?.message??'FAULTLINE_EXTERNAL_LIVE_CORPUS_FAILED');process.exit(1)}
