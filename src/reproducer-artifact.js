// Reproducer artifact — one-command minimal repro bundle.
// The bundle is deterministic about its toolchain and records SHA-256 for
// every generated payload except evidence.json itself (which carries the
// finalized hash ledger).
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, sep, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const PLAYWRIGHT_VERSION='1.63.0';
const NODE_ENGINE='22.x';

export const REPRO_LAYOUT = Object.freeze([
  'README.md', 'run.sh', 'run.ps1', 'Dockerfile', 'package.json',
  'environment.lock', 'failure-oracle.json', 'causal-fingerprint.json',
  'provenance.json', 'original-manifest.json', 'reduction-log.json',
  'evidence.json'
]);

function safeRelativeName(root,prefix,name){
  if(typeof name!=='string'||!name.trim()||name.includes('\0')||isAbsolute(name))throw new Error('REPRO_INVALID_FILE_NAME');
  const normalized=name.replace(/\\/g,'/');
  if(normalized.split('/').some(part=>part===''||part==='.'||part==='..'))throw new Error('REPRO_INVALID_FILE_NAME');
  const target=resolve(root,prefix,normalized);
  const base=resolve(root);
  const rel=relative(base,target);
  if(rel.startsWith('..'+sep)||rel==='..'||isAbsolute(rel))throw new Error('REPRO_FILE_ESCAPE');
  return {relative:`${prefix}/${normalized}`,target};
}

export function buildReproManifest({ oracle, fingerprint, provenance, original, reductionLog, runCommand }) {
  if (!oracle) throw new Error('REPRO_MISSING_ORACLE');
  if (!fingerprint) throw new Error('REPRO_MISSING_FINGERPRINT');
  const manifest = {
    format: 'faultline-repro.v2',
    oracle,
    fingerprint,
    provenance: provenance || {},
    originalManifest: original || {},
    reductionLog: reductionLog || {},
    runtime:{node:NODE_ENGINE,playwright:PLAYWRIGHT_VERSION},
    runCommand: runCommand || 'bash run.sh',
  };
  manifest.manifestSha256 = sha256(JSON.stringify(manifest));
  return manifest;
}

export async function writeReproBundle(dir, {
  oracle,
  fingerprint,
  provenance,
  original,
  reductionLog,
  minimalFiles = {},
  testFiles = {},
  environmentLock = {}
}) {
  const root=resolve(dir);
  const manifest = buildReproManifest({ oracle, fingerprint, provenance, original, reductionLog });
  await mkdir(join(root, 'minimal'), { recursive: true });
  await mkdir(join(root, 'test'), { recursive: true });
  await mkdir(join(root, 'artifacts'), { recursive: true });

  const files = {};
  const put = async (rel, content) => {
    const target=resolve(root,rel);
    const back=relative(root,target);
    if(back.startsWith('..'+sep)||back==='..'||isAbsolute(back))throw new Error('REPRO_FILE_ESCAPE');
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n';
    await mkdir(dirname(target),{recursive:true});
    await writeFile(target, text, 'utf8');
    files[rel] = {sha256:sha256(text),bytes:Buffer.byteLength(text)};
  };

  const packageJson={
    name:'faultline-reproducer',
    version:'1.0.0',
    private:true,
    type:'module',
    engines:{node:NODE_ENGINE},
    dependencies:{playwright:PLAYWRIGHT_VERSION}
  };
  const lock={
    schema:'faultline.environment-lock.v1',
    node:NODE_ENGINE,
    playwright:PLAYWRIGHT_VERSION,
    ...environmentLock
  };

  await put('failure-oracle.json', oracle);
  await put('causal-fingerprint.json', fingerprint);
  await put('provenance.json', provenance || {});
  await put('original-manifest.json', original || {});
  await put('reduction-log.json', reductionLog || {});
  await put('environment.lock', lock);
  await put('package.json',packageJson);

  await put('README.md', `# Faultline reproducer

This bundle is pinned to Node ${NODE_ENGINE} and Playwright ${PLAYWRIGHT_VERSION}.

Preferred isolated execution:

\`\`\`sh
docker build -t faultline-repro .
docker run --rm --ipc=host faultline-repro
\`\`\`

Local execution:

\`\`\`sh
bash run.sh
\`\`\`

Windows: \`powershell -File run.ps1\`.

See \`failure-oracle.json\`, \`causal-fingerprint.json\`, and \`evidence.json\` for SAME_CAUSE and integrity evidence.
`);

  await put('run.sh', `#!/bin/sh
set -eu
npm install --ignore-scripts --no-audit --no-fund
npx playwright install chromium
node test/repro.mjs
`);

  await put('run.ps1', `Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
npm install --ignore-scripts --no-audit --no-fund
npx playwright install chromium
node test/repro.mjs
`);

  await put('Dockerfile', `FROM node:22-bookworm
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /repro
COPY package.json ./
RUN npm install --ignore-scripts --no-audit --no-fund \\\
  && npx playwright install --with-deps chromium \\\
  && npm cache clean --force \\\
  && chmod -R a+rX /ms-playwright
COPY . .
RUN chown -R node:node /repro
USER node
CMD ["node", "test/repro.mjs"]
`);

  for (const [name, value] of Object.entries(minimalFiles)) {
    const safe=safeRelativeName(root,'minimal',name);
    await put(safe.relative,value);
  }
  for (const [name, value] of Object.entries(testFiles)) {
    const safe=safeRelativeName(root,'test',name);
    await put(safe.relative,value);
  }

  // Evidence is emitted last so its ledger covers every other generated file.
  const evidence={
    schema:'faultline.repro-evidence.v2',
    manifestSha256:manifest.manifestSha256,
    generatedAt:new Date().toISOString(),
    files:{...files}
  };
  await writeFile(join(root,'evidence.json'),JSON.stringify(evidence,null,2)+'\n','utf8');

  return {
    dir:root,
    manifest,
    files:{...files,'evidence.json':{sha256:sha256(JSON.stringify(evidence,null,2)+'\n'),bytes:Buffer.byteLength(JSON.stringify(evidence,null,2)+'\n')}}
  };
}
