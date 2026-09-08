import test from 'node:test';
import assert from 'node:assert/strict';

async function loadModule(path,label){
  try{return await import(path)}catch(error){assert.fail(`${label} module must exist: ${error?.code||error?.message||error}`)}
}

const sampleCase={
  html:'<main><button id="save">Save</button></main>',
  css:'main{display:block}',
  js:"document.querySelector('#save').addEventListener('click',()=>{})",
  oracle:{kind:'dom_exists',selector:'main',equals:true,action:{kind:'none'}}
};

const publicTarget={
  mode:'public_url',
  url:'https://example.com/app',
  origin:'https://example.com',
  captureStartedAt:'2026-09-08T00:00:00.000Z'
};

const environment={
  browserName:'chromium',browserVersion:'test',viewport:{width:1440,height:900},deviceScaleFactor:1,
  locale:'en-US',timezone:'Asia/Kolkata',colorScheme:'dark',userAgent:'faultline-test',reducedMotion:'no-preference'
};

test('Investigation protocol creates and validates a revisioned source-agnostic investigation',async()=>{
  const protocol=await loadModule('../src/investigation-protocol.js','investigation protocol');
  const investigation=protocol.createInvestigation({id:'inv_test_1',target:publicTarget,environment});
  assert.equal(investigation.schemaVersion,1);
  assert.equal(investigation.revision,'r1');
  assert.equal(investigation.target.mode,'public_url');
  assert.deepEqual(investigation.journey,[]);
  assert.deepEqual(investigation.observations,[]);
  assert.deepEqual(investigation.experiments,[]);
  assert.deepEqual(protocol.validateInvestigation(investigation),investigation);
  assert.throws(()=>protocol.validateInvestigation({...investigation,schemaVersion:999}),/UNSUPPORTED_INVESTIGATION_SCHEMA/);
});

test('Investigation store owns revisions, rejects stale writes, and preserves append-only observations',async()=>{
  const protocol=await loadModule('../src/investigation-protocol.js','investigation protocol');
  const storeModule=await loadModule('../src/investigation-store.js','investigation store');
  const initial=protocol.createInvestigation({id:'inv_test_2',target:publicTarget,environment});
  const store=storeModule.createInvestigationStore(initial);
  const first=store.inspect();
  const committed=store.commit(first.revision,current=>({...current,journey:[{id:'step_1',index:0,kind:'click',selectorStrategies:[{kind:'role',value:'button:Save'}],timeoutMs:2000,preconditions:[],recordedAt:'2026-09-08T00:00:01.000Z'}]}),{kind:'journey_update'});
  assert.equal(committed.revision,'r2');
  assert.throws(()=>store.commit(first.revision,current=>current,{kind:'stale'}),/STALE_REVISION/);
  const observed=store.appendObservation(committed.revision,{observationId:'obs_1',runId:'run_1',sequence:1,browserTime:12.5,type:'console',source:'browser',redacted:false,payload:{level:'log',text:'ready'}});
  assert.equal(observed.revision,'r3');
  assert.equal(observed.observations.length,1);
  const observed2=store.appendObservation(observed.revision,{observationId:'obs_2',runId:'run_1',sequence:2,browserTime:13,type:'network',source:'browser',redacted:true,payload:{url:'https://example.com/api'}});
  assert.deepEqual(observed2.observations.map(x=>x.observationId),['obs_1','obs_2']);
  assert.equal(store.restore('r1',observed2.revision).revision,'r5');
});

test('Investigation export bundle is checksummed and read-only',async()=>{
  const protocol=await loadModule('../src/investigation-protocol.js','investigation protocol');
  const storeModule=await loadModule('../src/investigation-store.js','investigation store');
  const store=storeModule.createInvestigationStore(protocol.createInvestigation({id:'inv_test_3',target:publicTarget,environment}));
  const before=store.inspect();
  const bundle=await store.exportBundle();
  const after=store.inspect();
  assert.equal(bundle.manifest.schemaVersion,1);
  assert.equal(bundle.manifest.investigationId,'inv_test_3');
  assert.match(bundle.manifest.sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(after,before,'export must not mutate canonical investigation');
});

test('Legacy source adapter converts losslessly without making source the canonical product model',async()=>{
  const adapter=await loadModule('../src/legacy-source-adapter.js','legacy source adapter');
  const investigation=adapter.legacyCaseToInvestigation(sampleCase,{id:'inv_legacy_test'});
  assert.equal(investigation.target.mode,'legacy_source');
  assert.deepEqual(adapter.investigationToLegacyCase(investigation),sampleCase);
  assert.throws(()=>adapter.investigationToLegacyCase({...investigation,target:{...investigation.target,mode:'public_url'}}),/NOT_LEGACY_SOURCE_INVESTIGATION/);
});
