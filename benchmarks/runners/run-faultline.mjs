#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { executeExternalCorpus, validateExternalRunnerManifest } from '../../src/external-qualification-runner.js';
import { summarizeQualification } from '../../src/qualification-evidence.js';

const args = process.argv.slice(2);
const get = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const manifestPath = get('--manifest');
const outputRoot = get('--out') || 'benchmarks/results/external-incidents';
const dryRun = args.includes('--dry-run');
const keepWorkspace = args.includes('--keep-workspace');

if (!manifestPath) {
  console.error('USAGE: run-faultline.mjs --manifest <external-corpus.json> [--out <dir>] [--dry-run] [--keep-workspace]');
  process.exit(2);
}

let manifest;
try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
catch { console.error('FAULTLINE_EXTERNAL_MANIFEST_READ_FAILED'); process.exit(2); }

let validated;
try { validated = validateExternalRunnerManifest(manifest); }
catch (error) { console.error(String(error?.message ?? error)); process.exit(2); }

if (dryRun) {
  console.log(JSON.stringify({
    ok: true,
    schema: validated.schema,
    cases: validated.cases.length,
    manifestDigest: validated.digest,
    repositories: [...new Set(validated.cases.map(item => item.repository))].length,
    commits: [...new Set(validated.cases.map(item => `${item.repository}@${item.commit}`))].length
  }, null, 2));
  process.exit(0);
}

await mkdir(outputRoot, { recursive: true });
const execution = await executeExternalCorpus(manifest, {
  faultlineRoot: resolve(new URL('../..', import.meta.url).pathname),
  outputRoot,
  keepWorkspace
});
const summary = summarizeQualification(execution.results);
const payload = {
  schema: 'faultline.external-corpus-run.v1',
  generatedAt: new Date().toISOString(),
  manifestDigest: execution.manifestDigest,
  results: execution.results,
  summary
};
await writeFile(resolve(outputRoot, 'qualification-results.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: summary.productionEligible ? 'PRODUCTION_EVIDENCE_MET' : 'EXPERIMENTAL_EVIDENCE',
  totalCases: summary.totalCases,
  supportedCases: summary.supportedCases,
  acceptedReductions: summary.acceptedReductions,
  falseEquivalents: summary.falseEquivalents,
  reproductionRate: summary.reproductionRate,
  sameCauseRate: summary.sameCauseRate,
  medianPortableReduction: summary.medianPortableReduction,
  medianLiveReduction: summary.medianLiveReduction,
  evidenceDigest: summary.evidenceDigest
}));
if (!summary.productionEligible) process.exitCode = 3;
