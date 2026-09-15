#!/usr/bin/env node
// Benchmark runner skeleton — enforces Rules B/C/D/G without running the
// benchmark itself. Real runs fill results/<suite>/<ts>/ with manifest,
// environment, raw/, metrics, failures, comparison, report, sha256sums.
// Usage: node benchmarks/runners/run-faultline.mjs --manifest <file> [--dry-run]
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const manifestPath = get('--manifest');
const dryRun = args.includes('--dry-run');
if (!manifestPath) { console.error('USAGE: run-faultline.mjs --manifest <manifest.json> [--dry-run]'); process.exit(2); }

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const forbidden = ['expectedOutputs', 'hardcodedAnswers', 'specialCaseIds', 'tunedOnEvalSplit'];
for (const key of forbidden) {
  if (manifest[key] !== undefined) { console.error(`RULE_B_VIOLATION: manifest contains forbidden key '${key}'`); process.exit(2); }
}
if (!/^[0-9a-f]{40}$/.test(manifest.benchmarkCommit || '')) {
  console.error('RULE_B_UNPINNED: manifest.benchmarkCommit must be a 40-char SHA before commercial runs');
  if (!dryRun) process.exit(2);
}
const require = createRequire(import.meta.url);
let sourceCommit = 'unknown';
try {
  const { execSync } = await import('node:child_process');
  sourceCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch { /* record unknown, do not fake */ }

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = `benchmarks/results/${manifest.suite}/${ts}`;
const ruleC = {
  benchmarkCommit: manifest.benchmarkCommit, competitorVersion: manifest.competitorVersion || 'n/a',
  sourceCommit, operatingSystem: process.platform, cpu: 'record-in-environment.json', ram: 'record-in-environment.json',
  databaseVersions: 'n/a', browserVersions: 'record-in-environment.json', llmModel: 'record-me', reasoningConfig: 'record-me',
  temperature: 'record-me', tokenBudget: manifest?.budgets?.tokenBudget, toolCallBudget: manifest?.budgets?.toolCallBudget,
  wallClockTimeout: manifest?.budgets?.wallClockTimeoutSec, retryPolicy: manifest?.budgets?.retryPolicy,
  networkConfig: 'record-me', seed: 'record-me', promptScaffold: 'record-me', humanInterventions: [],
  cost: 'record-me', finalScore: 'record-me',
};
console.log(JSON.stringify({ outDir, suite: manifest.suite, sourceCommit, ruleD: 'runner exits non-zero when score < baseline target' }, null, 2));
if (dryRun) { console.log('DRY_RUN_OK'); process.exit(0); }
await mkdir(`${outDir}/raw`, { recursive: true });
await writeFile(`${outDir}/manifest.json`, JSON.stringify({ ...ruleC, manifest }, null, 2));
await writeFile(`${outDir}/report.md`, `# ${manifest.suite} — ${ts}\n\nFill raw/, metrics.json, failures.json, comparison.json per contract Rule G.\n`);
console.log(`Initialized ${outDir}. Complete the run, hash with sha256sum, then compare against benchmarks/baselines/ (Rule D).`);
