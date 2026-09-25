// Reproducer artifact — one-command minimal repro bundle.
// Layout: faultline-repro/{README,run.sh,run.ps1,Dockerfile,environment.lock,
// failure-oracle.json,causal-fingerprint.json,provenance.json,
// original-manifest.json,reduction-log.json,minimal/,test/,artifacts/,evidence.json}
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export const REPRO_LAYOUT = Object.freeze([
  'README.md', 'run.sh', 'run.ps1', 'Dockerfile', 'environment.lock',
  'failure-oracle.json', 'causal-fingerprint.json', 'provenance.json',
  'original-manifest.json', 'reduction-log.json', 'evidence.json',
]);

export function buildReproManifest({ oracle, fingerprint, provenance, original, reductionLog, runCommand }) {
  if (!oracle) throw new Error('REPRO_MISSING_ORACLE');
  if (!fingerprint) throw new Error('REPRO_MISSING_FINGERPRINT');
  const manifest = {
    format: 'faultline-repro.v1',
    oracle, fingerprint,
    provenance: provenance || {},
    originalManifest: original || {},
    reductionLog: reductionLog || {},
    runCommand: runCommand || 'bash run.sh',
  };
  manifest.manifestSha256 = sha256(JSON.stringify(manifest));
  return manifest;
}

export async function writeReproBundle(dir, { oracle, fingerprint, provenance, original, reductionLog, minimalFiles = {}, testFiles = {}, environmentLock = {} }) {
  const manifest = buildReproManifest({ oracle, fingerprint, provenance, original, reductionLog });
  await mkdir(join(dir, 'minimal'), { recursive: true });
  await mkdir(join(dir, 'test'), { recursive: true });
  await mkdir(join(dir, 'artifacts'), { recursive: true });
  const files = {};
  const put = async (rel, content) => {
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n';
    await writeFile(join(dir, rel), text, 'utf8');
    files[rel] = sha256(text);
  };
  await put('failure-oracle.json', oracle);
  await put('causal-fingerprint.json', fingerprint);
  await put('provenance.json', provenance || {});
  await put('original-manifest.json', original || {});
  await put('reduction-log.json', reductionLog || {});
  await put('environment.lock', environmentLock);
  await put('evidence.json', { manifestSha256: manifest.manifestSha256, files });
  await put('README.md', `# Faultline reproducer\n\nRun one command:\n\n\`\`\`sh\nbash run.sh\n\`\`\`\n\nWindows: \`powershell -File run.ps1\`. See failure-oracle.json + causal-fingerprint.json for SAME_CAUSE evidence.\n`);
  await put('run.sh', `#!/bin/sh\nset -eu\n# faultline-repro.v1 — reproduce the captured failure\n# 1) build: docker build -t faultline-repro .\n# 2) run: docker run --rm faultline-repro\n# local (no docker): npx playwright install chromium && node test/repro.mjs\nnode test/repro.mjs\n`);
  await put('run.ps1', `Set-StrictMode -Version Latest\n$ErrorActionPreference='Stop'\n# faultline-repro.v1 — reproduce the captured failure\nnode test/repro.mjs\n`);
  await put('Dockerfile', `FROM node:22-bookworm
WORKDIR /repro
RUN npm init -y >/dev/null 2>&1 \\
  && npm install --save-exact playwright@1.63.0 \\
  && npx playwright install --with-deps chromium \\
  && npm cache clean --force
COPY . .
RUN chown -R node:node /repro
USER node
CMD ["node", "test/repro.mjs"]
`);
    for (const [name, content] of Object.entries(minimalFiles)) await put(`minimal/${name}`, content);
  for (const [name, content] of Object.entries(testFiles)) await put(`test/${name}`, content);
  return { dir, manifest, files };
}
