import {copyFileSync,existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const productionFiles=[
  'index.html',
  'services.html',
  'src/runtime.js',
  'src/ui.js',
  'src/reducer-engine.js',
  'src/sandbox-policy.js',
  'src/capture-contract.js',
  'src/commercial-cta.js',
  'vendor/acorn.js'
];
const SHA=/^[0-9a-f]{40}$/i;

function hash(bytes){return createHash('sha256').update(bytes).digest('hex');}
function validSha(value){const text=String(value||'').trim();return SHA.test(text)?text.toLowerCase():null;}
function validHttps(value){try{return new URL(String(value||'')).protocol==='https:';}catch{return false;}}
function sourceIdentity(){
  const vercelSha=validSha(process.env.VERCEL_GIT_COMMIT_SHA);
  if(process.env.VERCEL==='1'&&vercelSha){
    const owner=String(process.env.VERCEL_GIT_REPO_OWNER||'').trim();
    const slug=String(process.env.VERCEL_GIT_REPO_SLUG||'').trim();
    return Object.freeze({sha:vercelSha,provenance:'source-bound',authority:'vercel-git',repository:owner&&slug?`${owner}/${slug}`:null,ref:String(process.env.VERCEL_GIT_COMMIT_REF||'').trim()||null});
  }
  const githubSha=validSha(process.env.GITHUB_SHA);
  if(githubSha){
    let head=null,clean=null;
    try{
      head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim().toLowerCase();
      clean=execFileSync('git',['status','--porcelain=v1','--untracked-files=all'],{encoding:'utf8'}).trim()==='';
    }catch{}
    return Object.freeze({sha:githubSha,provenance:head===githubSha&&clean===true?'source-bound':'unverified',authority:'github-actions',repository:String(process.env.GITHUB_REPOSITORY||'').trim()||null,ref:String(process.env.GITHUB_REF_NAME||process.env.GITHUB_REF||'').trim()||null,verification:{headSha:head,headMatches:head===githubSha,clean}});
  }
  try{
    const head=validSha(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim());
    const clean=execFileSync('git',['status','--porcelain=v1','--untracked-files=all'],{encoding:'utf8'}).trim()==='';
    return Object.freeze({sha:head,provenance:head&&clean?'source-bound':'unverified',authority:'local-git',repository:null,ref:null,verification:{headSha:head,headMatches:Boolean(head),clean}});
  }catch{return Object.freeze({sha:null,provenance:'unverified',authority:'none',repository:null,ref:null});}
}

for(const file of productionFiles){
  if(!existsSync(file)){console.error(`Missing production file: ${file}`);process.exit(1);}
}

const source=sourceIdentity();
rmSync('public',{recursive:true,force:true});
mkdirSync('public/src',{recursive:true});
mkdirSync('public/vendor',{recursive:true});

const integrity={schemaVersion:1,service:'faultline-webmcp',version:'0.9.0',assets:{}};
for(const file of productionFiles){
  const bytes=readFileSync(file);
  copyFileSync(file,`public/${file}`);
  integrity.assets[`/${file}`]={sha256:hash(bytes),bytes:bytes.length};
}
const configuredPayment=String(process.env.FAULTLINE_PAYMENT_LINK||'').trim();
const commercialConfig={schemaVersion:1,provider:String(process.env.FAULTLINE_PAYMENT_PROVIDER||'').trim()||null,paymentUrl:validHttps(configuredPayment)?configuredPayment:null,intakeUrl:'https://tally.so/r/ZjMEKV'};
const commercialBytes=Buffer.from(`${JSON.stringify(commercialConfig,null,2)}\n`);
writeFileSync('public/commercial-config.json',commercialBytes);
integrity.assets['/commercial-config.json']={sha256:hash(commercialBytes),bytes:commercialBytes.length};

const integrityBytes=Buffer.from(`${JSON.stringify(integrity,null,2)}\n`);
writeFileSync('public/integrity.json',integrityBytes);
const release={schemaVersion:1,service:'faultline-webmcp',version:'0.9.0',source,evidence:{integrity:{path:'/integrity.json',sha256:hash(integrityBytes),bytes:integrityBytes.length}},runtime:{executionBoundary:'browser-iframe-local-first',arbitraryThirdPartyHostedExecution:false},commercial:{servicesPath:'/services.html',checkoutConfigured:Boolean(commercialConfig.paymentUrl)}};
writeFileSync('public/release.json',`${JSON.stringify(release,null,2)}\n`);
console.log(`static production tree verified and staged in public/ (${Object.keys(integrity.assets).length} runtime assets, ${source.provenance}/${source.authority})`);
