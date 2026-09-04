const FILE = path => path.replaceAll('\\','/').split('/').at(-1);

function depsOf(packageJson={}){
  return {...(packageJson.peerDependencies||{}),...(packageJson.devDependencies||{}),...(packageJson.dependencies||{})};
}

function has(deps,name){ return Object.prototype.hasOwnProperty.call(deps,name); }
function filesSet(files=[]){ return new Set(files.map(FILE)); }

function detectPackageManager(packageJson,files){
  const declared=String(packageJson?.packageManager||'').split('@')[0];
  if(['npm','pnpm','yarn','bun'].includes(declared)) return declared;
  const f=filesSet(files);
  if(f.has('pnpm-lock.yaml')) return 'pnpm';
  if(f.has('yarn.lock')) return 'yarn';
  if(f.has('bun.lock')||f.has('bun.lockb')) return 'bun';
  return 'npm';
}

function detectWorkspace(packageJson,files){
  const f=filesSet(files);
  if(f.has('turbo.json')) return 'turborepo';
  if(f.has('nx.json')) return 'nx';
  if(f.has('pnpm-workspace.yaml')) return 'pnpm-workspace';
  if(packageJson?.workspaces) return 'workspaces';
  return 'single-package';
}

function detectFramework(packageJson,files){
  const deps=depsOf(packageJson||{}), f=filesSet(files);
  if(has(deps,'next')) return ['next',0.99];
  if(has(deps,'nuxt')) return ['nuxt',0.99];
  if(has(deps,'@sveltejs/kit')) return ['sveltekit',0.99];
  if(Object.keys(deps).some(name=>name.startsWith('@remix-run/'))) return ['remix',0.98];
  if(has(deps,'@angular/core')) return ['angular',0.99];
  if(has(deps,'astro')) return ['astro',0.99];
  if(has(deps,'solid-js')&&has(deps,'vite')) return ['solid-vite',0.94];
  if(has(deps,'vue')&&has(deps,'vite')) return ['vue-vite',0.95];
  if(has(deps,'react')&&has(deps,'vite')) return ['react-vite',0.95];
  if(packageJson) return ['node-custom',0.76];
  if(f.has('index.html')) return ['static-html',0.96];
  return ['unsupported',0.2];
}

function packageCommand(pm,script,{serve=false}={}){
  if(!script) return null;
  let argv;
  if(script==='test') argv=[pm,'test'];
  else if(pm==='npm') argv=script==='start'?['npm','start']:['npm','run',script];
  else if(pm==='yarn') argv=['yarn',script];
  else argv=[pm,'run',script];
  if(serve) argv.push('--','--hostname','0.0.0.0');
  return argv;
}

function installCommand(pm,files){
  const f=filesSet(files);
  if(pm==='pnpm') return ['pnpm','install','--frozen-lockfile'];
  if(pm==='yarn') return ['yarn','install','--immutable'];
  if(pm==='bun') return ['bun','install','--frozen-lockfile'];
  return f.has('package-lock.json')?['npm','ci']:['npm','install'];
}

function commandsFor(packageJson,files,framework,pm){
  if(framework==='static-html') return {install:null,build:null,start:['python3','-m','http.server','3000','--bind','0.0.0.0'],test:null};
  if(!packageJson) return {install:null,build:null,start:null,test:null};
  const scripts=packageJson.scripts||{};
  const startName=scripts.dev?'dev':scripts.start?'start':null;
  return {
    install:installCommand(pm,files),
    build:scripts.build?packageCommand(pm,'build'):null,
    start:startName?packageCommand(pm,startName,{serve:startName==='dev'}):null,
    test:scripts.test?packageCommand(pm,'test'):null
  };
}

export function detectProject({packageJson=null,files=[]}={}){
  const cleanFiles=Array.isArray(files)?files.map(String):[];
  const [framework,confidence]=detectFramework(packageJson,cleanFiles);
  const packageManager=packageJson?detectPackageManager(packageJson,cleanFiles):null;
  const workspace=packageJson?detectWorkspace(packageJson,cleanFiles):'single-package';
  const commands=commandsFor(packageJson,cleanFiles,framework,packageManager);
  const reasons=[];
  let compatibility='ready';
  if(framework==='unsupported') { compatibility='unsupported'; reasons.push('framework_unsupported'); }
  else if(!commands.start) { compatibility='configuration_required'; reasons.push('start_command_missing'); }
  return {framework,packageManager,workspace,commands,confidence,compatibility,reasons};
}
