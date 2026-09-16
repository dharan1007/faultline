import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium, firefox, webkit } from 'playwright';
import { validateQualificationManifest, qualificationDigest } from './qualification-evidence.js';
import { captureFaultlineCase, armFaultlineDiagnostics } from '../integrations/playwright-capture/index.js';
import { executeLiveAction, validateLiveRecipe } from '../integrations/playwright-live/index.js';

const fail = code => { throw new Error(code); };
const clone = value => value === undefined ? undefined : structuredClone(value);
const HASH40 = /^[0-9a-f]{40}$/i;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;
const BROWSERS = Object.freeze({ chromium, firefox, webkit });

function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function nonEmpty(value, code, max = 8192) { if (typeof value !== 'string' || !value.trim() || value.length > max) fail(code); return value.trim(); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function within(root, candidate) { const r = resolve(root); const c = resolve(candidate); return c === r || c.startsWith(`${r}${sep}`); }
function safeRelative(root, value, code) { value = nonEmpty(value, code, 4096); if (isAbsolute(value)) fail(code); const out = resolve(root, value); if (!within(root, out)) fail(code); return out; }

function normalizeRunnerExpectation(value) {
  if (value == null) return Object.freeze({ mode: 'nonzero-exit' });
  if (!isObject(value)) fail('FAULTLINE_EXTERNAL_INVALID_RUNNER_EXPECTATION');
  const allowed = new Set(['exitCode', 'stdoutIncludes', 'stderrIncludes', 'combinedIncludes']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`FAULTLINE_EXTERNAL_UNKNOWN_RUNNER_EXPECTATION:${key}`);
  const out = {};
  if (value.exitCode != null) {
    if (!Number.isInteger(value.exitCode) || value.exitCode < 0 || value.exitCode > 255) fail('FAULTLINE_EXTERNAL_INVALID_EXPECTED_EXIT');
    out.exitCode = value.exitCode;
  }
  for (const key of ['stdoutIncludes', 'stderrIncludes', 'combinedIncludes']) {
    if (value[key] == null) continue;
    if (!Array.isArray(value[key]) || value[key].length < 1 || value[key].length > 32) fail('FAULTLINE_EXTERNAL_INVALID_EXPECTED_TEXT');
    out[key] = value[key].map(item => nonEmpty(item, 'FAULTLINE_EXTERNAL_INVALID_EXPECTED_TEXT', 2048));
  }
  if (!Object.keys(out).length) fail('FAULTLINE_EXTERNAL_EMPTY_RUNNER_EXPECTATION');
  return Object.freeze(out);
}

function normalizeMode(value) {
  const mode = value == null ? 'portable' : nonEmpty(value, 'FAULTLINE_EXTERNAL_INVALID_MODE', 32);
  if (!['portable', 'live'].includes(mode)) fail('FAULTLINE_EXTERNAL_INVALID_MODE');
  return mode;
}

function normalizeReadyUrl(value) {
  let url;
  try { url = new URL(nonEmpty(value, 'FAULTLINE_EXTERNAL_PLAYWRIGHT_READY_URL_REQUIRED', 2048)); }
  catch { fail('FAULTLINE_EXTERNAL_PLAYWRIGHT_READY_URL_INVALID'); }
  if (!['http:', 'https:'].includes(url.protocol)) fail('FAULTLINE_EXTERNAL_PLAYWRIGHT_READY_URL_INVALID');
  const hostname = url.hostname.toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) fail('FAULTLINE_EXTERNAL_PLAYWRIGHT_READY_URL_LOOPBACK_REQUIRED');
  if (url.username || url.password) fail('FAULTLINE_EXTERNAL_PLAYWRIGHT_READY_URL_INVALID');
  return url.toString();
}

function normalizePlaywrightAdapter(value) {
  const launchCommand = nonEmpty(value.launchCommand, 'FAULTLINE_EXTERNAL_PLAYWRIGHT_LAUNCH_COMMAND_REQUIRED', 16384);
  const readyUrl = normalizeReadyUrl(value.readyUrl);
  const browser = value.browser == null ? 'chromium' : nonEmpty(value.browser, 'FAULTLINE_EXTERNAL_PLAYWRIGHT_BROWSER_INVALID', 32).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(BROWSERS, browser)) fail('FAULTLINE_EXTERNAL_PLAYWRIGHT_BROWSER_INVALID');
  if (!Array.isArray(value.recipe)) fail('FAULTLINE_EXTERNAL_PLAYWRIGHT_RECIPE_INVALID');
  let recipe;
  try { recipe = clone(validateLiveRecipe(value.recipe)); } catch { fail('FAULTLINE_EXTERNAL_PLAYWRIGHT_RECIPE_INVALID'); }
  if (!isObject(value.oracle)) fail('FAULTLINE_EXTERNAL_PLAYWRIGHT_ORACLE_REQUIRED');
  const oracle = clone(value.oracle);
  const capturePath = nonEmpty(value.capturePath, 'FAULTLINE_EXTERNAL_CAPTURE_PATH_REQUIRED', 4096);
  const mode = normalizeMode(value.mode);
  const readyTimeoutMs = value.readyTimeoutMs == null ? 60_000 : Number(value.readyTimeoutMs);
  if (!Number.isSafeInteger(readyTimeoutMs) || readyTimeoutMs < 1_000 || readyTimeoutMs > 10 * 60_000) fail('FAULTLINE_EXTERNAL_PLAYWRIGHT_READY_TIMEOUT_INVALID');
  return Object.freeze({ kind: 'playwright-live', launchCommand, readyUrl, browser, recipe: Object.freeze(recipe), oracle: Object.freeze(oracle), capturePath, mode, readyTimeoutMs });
}

function normalizeAdapter(value) {
  if (!isObject(value)) fail('FAULTLINE_EXTERNAL_CAPTURE_ADAPTER_REQUIRED');
  const kind = value.kind == null ? 'command' : nonEmpty(value.kind, 'FAULTLINE_EXTERNAL_CAPTURE_ADAPTER_KIND_INVALID', 64);
  if (kind === 'playwright-live') return normalizePlaywrightAdapter(value);
  if (kind !== 'command') fail('FAULTLINE_EXTERNAL_CAPTURE_ADAPTER_KIND_INVALID');
  const command = nonEmpty(value.command, 'FAULTLINE_EXTERNAL_CAPTURE_COMMAND_REQUIRED', 16384);
  const capturePath = nonEmpty(value.capturePath, 'FAULTLINE_EXTERNAL_CAPTURE_PATH_REQUIRED', 4096);
  return Object.freeze({ kind: 'command', command, capturePath, mode: normalizeMode(value.mode) });
}

export function validateExternalRunnerManifest(raw) {
  const base = validateQualificationManifest(raw);
  if (base.cases.length < 1) fail('FAULTLINE_EXTERNAL_CASES_REQUIRED');
  const rawById = new Map(raw.cases.map(entry => [entry.id, entry]));
  const cases = base.cases.map(baseCase => {
    const original = rawById.get(baseCase.id);
    if (!original) fail('FAULTLINE_EXTERNAL_CASE_MISSING');
    const repositoryUrl = new URL(baseCase.repository);
    if (repositoryUrl.username || repositoryUrl.password) fail('FAULTLINE_EXTERNAL_REPOSITORY_CREDENTIALS_FORBIDDEN');
    const runner = normalizeRunnerExpectation(original.expectedFailure?.runner);
    const adapter = normalizeAdapter(original.adapter);
    const setupCommand = original.setupCommand == null ? null : nonEmpty(original.setupCommand, 'FAULTLINE_EXTERNAL_INVALID_SETUP_COMMAND', 16384);
    const timeoutMs = original.timeoutMs == null ? 120_000 : Number(original.timeoutMs);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30 * 60_000) fail('FAULTLINE_EXTERNAL_INVALID_TIMEOUT');
    return Object.freeze({ ...baseCase, setupCommand, runner, adapter, timeoutMs });
  });
  return Object.freeze({ schema: base.schema, cases: Object.freeze(cases), digest: base.digest });
}

export function baselineMatches(run, expectation) {
  if (!isObject(run) || !Number.isInteger(run.exitCode) || typeof run.stdout !== 'string' || typeof run.stderr !== 'string') fail('FAULTLINE_EXTERNAL_INVALID_COMMAND_RESULT');
  if (expectation.mode === 'nonzero-exit') return run.exitCode !== 0;
  if (expectation.exitCode != null && run.exitCode !== expectation.exitCode) return false;
  for (const needle of expectation.stdoutIncludes ?? []) if (!run.stdout.includes(needle)) return false;
  for (const needle of expectation.stderrIncludes ?? []) if (!run.stderr.includes(needle)) return false;
  const combined = `${run.stdout}\n${run.stderr}`;
  for (const needle of expectation.combinedIncludes ?? []) if (!combined.includes(needle)) return false;
  return true;
}

async function runCommand(command, { cwd, timeoutMs, env = {} }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('/bin/bash', ['-lc', command], { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let killedForOutput = false;
    const collect = (chunks, data, kind) => {
      const bytes = Buffer.byteLength(data);
      if (kind === 'stdout') stdoutBytes += bytes; else stderrBytes += bytes;
      if (stdoutBytes + stderrBytes > MAX_OUTPUT_BYTES) { killedForOutput = true; child.kill('SIGKILL'); return; }
      chunks.push(Buffer.from(data));
    };
    child.stdout.on('data', data => collect(stdout, data, 'stdout'));
    child.stderr.on('data', data => collect(stderr, data, 'stderr'));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.once('error', reject);
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (killedForOutput) return reject(new Error('FAULTLINE_EXTERNAL_COMMAND_OUTPUT_LIMIT'));
      resolvePromise({ exitCode: Number.isInteger(code) ? code : 255, signal: signal ?? null, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
    });
  });
}

function startBackground(command, { cwd, env = {} }) {
  const child = spawn('/bin/bash', ['-lc', `exec ${command}`], { cwd, env: { ...process.env, ...env }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout = [];
  const stderr = [];
  let bytes = 0;
  const collect = (target, data) => { if (bytes >= MAX_OUTPUT_BYTES) return; const buffer = Buffer.from(data); bytes += buffer.length; if (bytes <= MAX_OUTPUT_BYTES) target.push(buffer); };
  child.stdout.on('data', data => collect(stdout, data));
  child.stderr.on('data', data => collect(stderr, data));
  return { child, output: () => ({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') }) };
}

async function stopBackground(child) {
  if (!child || child.exitCode != null) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch {} }
  await new Promise(resolvePromise => {
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} }
      resolvePromise();
    }, 3000);
    child.once('close', () => { clearTimeout(timer); resolvePromise(); });
  });
}

async function waitUntilReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(2500) });
      if (response.status >= 200 && response.status < 500) return;
      lastError = new Error(`HTTP_${response.status}`);
    } catch (error) { lastError = error; }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
  }
  const error = new Error('FAULTLINE_EXTERNAL_PLAYWRIGHT_READY_TIMEOUT', { cause: lastError });
  throw error;
}

async function playwrightCapture(caseDef, { repoDir, captureAbs, faultlineRoot, raw }) {
  const adapter = caseDef.adapter;
  const background = startBackground(adapter.launchCommand, { cwd: repoDir, env: { FAULTLINE_ROOT: resolve(faultlineRoot) } });
  let browser = null;
  let diagnostics = null;
  try {
    await waitUntilReady(adapter.readyUrl, adapter.readyTimeoutMs);
    browser = await BROWSERS[adapter.browser].launch({ headless: true });
    const page = await browser.newPage();
    diagnostics = armFaultlineDiagnostics(page);
    await page.goto(adapter.readyUrl, { waitUntil: 'domcontentloaded', timeout: Math.min(caseDef.timeoutMs, 30_000) });
    for (const action of adapter.recipe) await executeLiveAction(page, action, { timeoutMs: Math.min(caseDef.timeoutMs, 10_000) });
    await captureFaultlineCase({
      page,
      oracle: clone(adapter.oracle),
      provenance: { sourceRepository: caseDef.repository, sourceCommit: caseDef.commit, testTitle: caseDef.id, testFile: caseDef.provenance },
      diagnostics,
      writeTo: captureAbs
    });
    raw.captureCommand = { exitCode: 0, adapter: 'playwright-live', browser: adapter.browser, readyUrl: adapter.readyUrl };
  } finally {
    try { diagnostics?.dispose(); } catch {}
    try { await browser?.close(); } catch {}
    await stopBackground(background.child);
    const output = background.output();
    raw.launch = { stdoutSha256: sha256(output.stdout), stderrSha256: sha256(output.stderr), stdoutBytes: Buffer.byteLength(output.stdout), stderrBytes: Buffer.byteLength(output.stderr) };
  }
}

async function checkoutCase(caseDef, workspace) {
  const repoDir = join(workspace, 'upstream');
  await mkdir(repoDir, { recursive: true });
  let result = await runCommand('git init -q', { cwd: repoDir, timeoutMs: 30_000 });
  if (result.exitCode !== 0) fail('FAULTLINE_EXTERNAL_GIT_INIT_FAILED');
  result = await runCommand(`git remote add origin ${JSON.stringify(caseDef.repository)}`, { cwd: repoDir, timeoutMs: 30_000 });
  if (result.exitCode !== 0) fail('FAULTLINE_EXTERNAL_GIT_REMOTE_FAILED');
  result = await runCommand(`git fetch --quiet --depth=1 origin ${caseDef.commit}`, { cwd: repoDir, timeoutMs: caseDef.timeoutMs });
  if (result.exitCode !== 0) fail('FAULTLINE_EXTERNAL_GIT_FETCH_FAILED');
  result = await runCommand('git checkout --quiet --detach FETCH_HEAD', { cwd: repoDir, timeoutMs: 30_000 });
  if (result.exitCode !== 0) fail('FAULTLINE_EXTERNAL_GIT_CHECKOUT_FAILED');
  result = await runCommand('git rev-parse HEAD', { cwd: repoDir, timeoutMs: 30_000 });
  if (result.exitCode !== 0 || result.stdout.trim().toLowerCase() !== caseDef.commit.toLowerCase()) fail('FAULTLINE_EXTERNAL_CHECKOUT_SHA_MISMATCH');
  result = await runCommand('git status --porcelain --untracked-files=no', { cwd: repoDir, timeoutMs: 30_000 });
  if (result.exitCode !== 0 || result.stdout.trim()) fail('FAULTLINE_EXTERNAL_CHECKOUT_NOT_CLEAN');
  return repoDir;
}

async function fileEvidence(path, code) {
  let info; try { info = await stat(path); } catch { fail(code); }
  if (!info.isFile() || info.size < 1 || info.size > MAX_CAPTURE_BYTES) fail(code);
  const bytes = await readFile(path);
  return { path, bytes, sha256: sha256(bytes), size: info.size };
}

function reportReduction(report) {
  const before = Object.values(report?.capture?.sourceBytes ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
  const after = Object.values(report?.final?.sourceBytes ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
  if (!(before > 0) || after < 0 || after > before) return 0;
  return (before - after) / before;
}

export async function executeExternalCase(caseDef, { faultlineRoot = process.cwd(), outputRoot = 'benchmarks/results/external-incidents', keepWorkspace = false } = {}) {
  if (!HASH40.test(caseDef.commit)) fail('FAULTLINE_EXTERNAL_INVALID_COMMIT');
  const workspace = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(join(tmpdir(), `faultline-${caseDef.id.replace(/[^a-z0-9._-]/gi, '_')}-`)));
  const startedAt = Date.now();
  const raw = { id: caseDef.id, repository: caseDef.repository, commit: caseDef.commit, provenance: caseDef.provenance, adapterKind: caseDef.adapter.kind, startedAt };
  let result;
  try {
    const repoDir = await checkoutCase(caseDef, workspace);
    if (caseDef.setupCommand) {
      const setup = await runCommand(caseDef.setupCommand, { cwd: repoDir, timeoutMs: caseDef.timeoutMs, env: { FAULTLINE_ROOT: resolve(faultlineRoot) } });
      raw.setup = { exitCode: setup.exitCode, stdoutSha256: sha256(setup.stdout), stderrSha256: sha256(setup.stderr) };
      if (setup.exitCode !== 0) fail('FAULTLINE_EXTERNAL_SETUP_FAILED');
    }
    const baseline = await runCommand(caseDef.reproduction, { cwd: repoDir, timeoutMs: caseDef.timeoutMs, env: { FAULTLINE_ROOT: resolve(faultlineRoot) } });
    raw.baseline = { exitCode: baseline.exitCode, signal: baseline.signal, stdoutSha256: sha256(baseline.stdout), stderrSha256: sha256(baseline.stderr) };
    const baselineReproduced = baselineMatches(baseline, caseDef.runner);
    if (!baselineReproduced) {
      result = { id: caseDef.id, mode: caseDef.adapter.mode, classification: 'UNSUPPORTED', baselineReproduced: false, accepted: false, sameCause: false, falseEquivalent: false, reduction: 0, wallTimeMs: Date.now() - startedAt };
      return { result, raw };
    }

    const captureAbs = safeRelative(repoDir, caseDef.adapter.capturePath, 'FAULTLINE_EXTERNAL_UNSAFE_CAPTURE_PATH');
    await mkdir(resolve(captureAbs, '..'), { recursive: true });
    if (caseDef.adapter.kind === 'playwright-live') {
      await playwrightCapture(caseDef, { repoDir, captureAbs, faultlineRoot, raw });
    } else {
      const captureRun = await runCommand(caseDef.adapter.command, { cwd: repoDir, timeoutMs: caseDef.timeoutMs, env: { FAULTLINE_ROOT: resolve(faultlineRoot), FAULTLINE_CAPTURE_PATH: captureAbs } });
      raw.captureCommand = { exitCode: captureRun.exitCode, stdoutSha256: sha256(captureRun.stdout), stderrSha256: sha256(captureRun.stderr) };
      if (captureRun.exitCode !== 0) fail('FAULTLINE_EXTERNAL_CAPTURE_FAILED');
    }
    const capture = await fileEvidence(captureAbs, 'FAULTLINE_EXTERNAL_CAPTURE_ARTIFACT_MISSING');
    raw.capture = { path: caseDef.adapter.capturePath, sha256: capture.sha256, size: capture.size };

    const caseOut = resolve(outputRoot, caseDef.id);
    await mkdir(caseOut, { recursive: true });
    const reportPath = join(caseOut, 'faultline-report.json');
    const analyze = await runCommand(`node ${JSON.stringify(resolve(faultlineRoot, 'bin/faultline.mjs'))} analyze ${JSON.stringify(captureAbs)} --out ${JSON.stringify(reportPath)}`, { cwd: resolve(faultlineRoot), timeoutMs: caseDef.timeoutMs });
    raw.analyze = { exitCode: analyze.exitCode, stdoutSha256: sha256(analyze.stdout), stderrSha256: sha256(analyze.stderr) };
    if (analyze.exitCode !== 0) {
      result = { id: caseDef.id, mode: caseDef.adapter.mode, classification: analyze.exitCode === 3 ? 'UNSUPPORTED' : 'UNRESOLVED', baselineReproduced: true, accepted: false, sameCause: false, falseEquivalent: false, reduction: 0, wallTimeMs: Date.now() - startedAt };
      return { result, raw };
    }
    const reportEvidence = await fileEvidence(reportPath, 'FAULTLINE_EXTERNAL_REPORT_MISSING');
    const report = JSON.parse(reportEvidence.bytes.toString('utf8'));
    raw.report = { sha256: reportEvidence.sha256, size: reportEvidence.size };
    const sameCause = report?.final?.sameCause === true;
    const reduction = reportReduction(report);
    result = { id: caseDef.id, mode: caseDef.adapter.mode, classification: 'SUPPORTED', baselineReproduced: true, accepted: sameCause && reduction > 0, sameCause, falseEquivalent: !sameCause && report?.final?.status === 'FAIL', reduction, wallTimeMs: Date.now() - startedAt };
    return { result, raw };
  } finally {
    raw.completedAt = Date.now();
    raw.evidenceDigest = qualificationDigest(raw);
    const rawDir = resolve(outputRoot, 'raw');
    await mkdir(rawDir, { recursive: true });
    await writeFile(join(rawDir, `${caseDef.id}.json`), `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
    if (!keepWorkspace) await import('node:fs/promises').then(({ rm }) => rm(workspace, { recursive: true, force: true }));
  }
}

export async function executeExternalCorpus(manifest, options = {}) {
  const validated = validateExternalRunnerManifest(manifest);
  const results = [];
  for (const caseDef of validated.cases) {
    try {
      const execution = await executeExternalCase(caseDef, options);
      results.push(execution.result);
    } catch (error) {
      results.push({ id: caseDef.id, mode: caseDef.adapter.mode, classification: 'UNRESOLVED', baselineReproduced: false, accepted: false, sameCause: false, falseEquivalent: false, reduction: 0, wallTimeMs: 0, error: String(error?.message ?? error) });
    }
  }
  return Object.freeze({ schema: 'faultline.external-corpus-results.v1', manifestDigest: validated.digest, results: Object.freeze(results) });
}
