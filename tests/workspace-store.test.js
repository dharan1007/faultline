import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceStore } from '../src/workspace-store.js';
import { parseRoute, hrefFor } from '../src/router.js';

function memoryAdapter(initial=null){
  let value=initial;
  return {read:async()=>value,write:async next=>{value=next;},clear:async()=>{value=null;},peek:()=>value};
}

test('workspace store round-trips projects and investigations without secrets', async () => {
  const adapter=memoryAdapter();
  const store=createWorkspaceStore(adapter);
  await store.load();
  await store.putProject({id:'p1',name:'App',source:{kind:'git',url:'https://github.com/acme/app.git',token:'secret'},compatibility:'ready'});
  await store.putInvestigation({id:'i1',projectId:'p1',title:'Checkout failure',stage:'reproduce',status:'draft',report:{description:'broken'},secret:'hidden'});
  const raw=adapter.peek();
  assert.equal(raw.version,1);
  assert.equal(raw.projects[0].source.token,undefined);
  assert.equal(raw.investigations[0].secret,undefined);
  const hydrated=createWorkspaceStore(adapter);
  await hydrated.load();
  assert.equal(hydrated.getProject('p1').name,'App');
  assert.equal(hydrated.getInvestigation('i1').title,'Checkout failure');
});

test('workspace store fails closed on corrupted versions', async () => {
  const adapter=memoryAdapter({version:99,projects:[{id:'bad'}]});
  const store=createWorkspaceStore(adapter);
  const result=await store.load();
  assert.equal(result.status,'reset');
  assert.deepEqual(store.listProjects(),[]);
});

test('workspace store never persists capability tokens or credential-shaped fields', async () => {
  const adapter=memoryAdapter();
  const store=createWorkspaceStore(adapter);
  await store.load();
  await store.putProject({id:'p1',name:'Private',source:{kind:'git',url:'https://github.com/acme/private.git'},credentials:{token:'abc'},apiKey:'xyz'});
  const serialized=JSON.stringify(adapter.peek());
  assert.equal(serialized.includes('abc'),false);
  assert.equal(serialized.includes('xyz'),false);
  assert.equal(serialized.includes('credentials'),false);
});

test('router resolves all product views and entity identifiers', () => {
  assert.deepEqual(parseRoute('#/projects'),{name:'projects',params:{}});
  assert.deepEqual(parseRoute('#/connect'),{name:'connect',params:{}});
  assert.deepEqual(parseRoute('#/project/p_1'),{name:'project',params:{projectId:'p_1'}});
  assert.deepEqual(parseRoute('#/investigation/i_1'),{name:'investigation',params:{investigationId:'i_1'}});
  assert.deepEqual(parseRoute('#/runs'),{name:'runs',params:{}});
  assert.deepEqual(parseRoute('#/evidence'),{name:'evidence',params:{}});
  assert.deepEqual(parseRoute('#/integrations'),{name:'integrations',params:{}});
  assert.deepEqual(parseRoute('#/settings'),{name:'settings',params:{}});
  assert.deepEqual(parseRoute('#/minimal'),{name:'minimal',params:{}});
  assert.deepEqual(parseRoute('#/unknown'),{name:'not-found',params:{}});
});

test('hrefFor encodes entity ids safely', () => {
  assert.equal(hrefFor('projects'),'#/projects');
  assert.equal(hrefFor('project',{projectId:'a b'}),'#/project/a%20b');
  assert.equal(hrefFor('investigation',{investigationId:'x/y'}),'#/investigation/x%2Fy');
});
