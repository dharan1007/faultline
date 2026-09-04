import test from 'node:test';
import assert from 'node:assert/strict';
import { detectProject } from '../src/project-detector.js';

const pkg = (dependencies={},scripts={},extra={}) => ({name:'fixture',private:true,dependencies,scripts,...extra});

const cases = [
  ['Next.js',pkg({next:'16.0.0',react:'19.0.0'},{dev:'next dev',build:'next build'}),'next'],
  ['React/Vite',pkg({react:'19.0.0',vite:'7.0.0'},{dev:'vite',build:'vite build'}),'react-vite'],
  ['Vue/Vite',pkg({vue:'3.5.0',vite:'7.0.0'},{dev:'vite',build:'vite build'}),'vue-vite'],
  ['Nuxt',pkg({nuxt:'4.0.0',vue:'3.5.0'},{dev:'nuxt dev',build:'nuxt build'}),'nuxt'],
  ['SvelteKit',pkg({'@sveltejs/kit':'2.0.0',svelte:'5.0.0'},{dev:'vite dev',build:'vite build'}),'sveltekit'],
  ['Remix',pkg({'@remix-run/react':'3.0.0',react:'19.0.0'},{dev:'remix vite:dev',build:'remix vite:build'}),'remix'],
  ['Angular',pkg({'@angular/core':'21.0.0'},{start:'ng serve',build:'ng build'}),'angular'],
  ['Astro',pkg({astro:'6.0.0'},{dev:'astro dev',build:'astro build'}),'astro']
];

for (const [name,packageJson,framework] of cases) test(`detectProject identifies ${name} before generic signals`, () => {
  const result = detectProject({packageJson,files:['package.json','package-lock.json']});
  assert.equal(result.framework, framework);
  assert.ok(result.confidence > 0.7);
});

test('detectProject identifies package manager and workspace without executing package scripts', () => {
  const packageJson=pkg({next:'16.0.0'},{dev:'next dev',build:'next build',test:'node --test'},{packageManager:'pnpm@10.0.0',workspaces:['apps/*']});
  const result=detectProject({packageJson,files:['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','turbo.json']});
  assert.equal(result.packageManager,'pnpm');
  assert.equal(result.workspace,'turborepo');
  assert.deepEqual(result.commands.install,['pnpm','install','--frozen-lockfile']);
  assert.deepEqual(result.commands.build,['pnpm','run','build']);
  assert.deepEqual(result.commands.test,['pnpm','test']);
  assert.ok(Array.isArray(result.commands.start));
  assert.equal(result.commands.start[0],'pnpm');
  assert.equal(result.commands.start[1],'run');
  assert.equal(result.commands.start[2],'dev');
  assert.ok(result.commands.start.includes('0.0.0.0'));
});

test('detectProject recognizes Nx before generic workspaces', () => {
  const result=detectProject({packageJson:pkg({react:'19.0.0'},{start:'nx serve app'},{workspaces:['apps/*']}),files:['package.json','nx.json','yarn.lock']});
  assert.equal(result.workspace,'nx');
  assert.equal(result.packageManager,'yarn');
});

test('detectProject selects deterministic npm lifecycle argv', () => {
  const result=detectProject({packageJson:pkg({next:'16.0.0'},{dev:'next dev',build:'next build',test:'node --test'}),files:['package.json','package-lock.json']});
  assert.deepEqual(result.commands.install,['npm','ci']);
  assert.deepEqual(result.commands.start,['npm','run','dev','--','--hostname','0.0.0.0']);
  assert.deepEqual(result.commands.build,['npm','run','build']);
  assert.deepEqual(result.commands.test,['npm','test']);
  assert.equal(result.compatibility,'ready');
});

test('detectProject requires configuration when repository has no runnable start/dev script', () => {
  const result=detectProject({packageJson:pkg({next:'16.0.0'},{build:'next build'}),files:['package.json','package-lock.json']});
  assert.equal(result.framework,'next');
  assert.equal(result.compatibility,'configuration_required');
  assert.ok(result.reasons.includes('start_command_missing'));
});

test('detectProject treats a plain index.html project as a runnable static site', () => {
  const result=detectProject({packageJson:null,files:['index.html','styles.css']});
  assert.equal(result.framework,'static-html');
  assert.equal(result.compatibility,'ready');
  assert.ok(Array.isArray(result.commands.start));
});

test('detectProject treats an unknown Node package with an explicit start script as custom Node', () => {
  const result=detectProject({packageJson:pkg({express:'5.0.0'},{start:'node server.js'}),files:['package.json','package-lock.json']});
  assert.equal(result.framework,'node-custom');
  assert.equal(result.compatibility,'ready');
  assert.deepEqual(result.commands.start,['npm','start']);
});
